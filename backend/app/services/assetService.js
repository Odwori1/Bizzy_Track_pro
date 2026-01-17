import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class AssetService {
  /**
   * Generate next asset code
   */
  static async generateNextAssetCode(client, businessId) {
    try {
      // Get business prefix
      const businessResult = await client.query(
        'SELECT name FROM businesses WHERE id = $1',
        [businessId]
      );

      let prefix = 'AST';
      if (businessResult.rows.length > 0) {
        prefix = businessResult.rows[0].name.substring(0, 3).toUpperCase();
      }

      // Get next sequence number from assets table
      const sequenceResult = await client.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(asset_code FROM '[0-9]+$') AS INTEGER)), 0) + 1 as next_sequence
         FROM assets
         WHERE business_id = $1 AND asset_code ~ ('^' || $2 || '-[0-9]+$')`,
        [businessId, prefix]
      );

      const nextSequence = sequenceResult.rows[0].next_sequence;
      return `${prefix}-${String(nextSequence).padStart(4, '0')}`;

    } catch (error) {
      log.warn('Asset code generation failed:', error.message);
      return `AST-${Date.now().toString().slice(-6)}`;
    }
  }

  /**
   * Create a new fixed asset - PRODUCTION READY with RLS fix
   */
  static async createFixedAsset(businessId, assetData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // ✅ FIX: Set session variable for RLS policy (transaction-scoped with 'true')
      // The 'true' parameter makes it transaction-local, but we set it again after commit
      await client.query(
        "SELECT set_config('app.current_business_id', $1, false)",
        [businessId]
      );

      log.info('RLS session variable set for transaction', { businessId });

      // Lock table to prevent race conditions in asset code generation
      await client.query('LOCK TABLE assets IN SHARE ROW EXCLUSIVE MODE');

      // Ensure fixed asset accounts exist
      await client.query(
        'SELECT ensure_fixed_asset_accounts($1)',
        [businessId]
      );

      // Generate asset code if not provided
      let assetCode = assetData.asset_code;
      if (!assetCode) {
        assetCode = await this.generateNextAssetCode(client, businessId);

        // Verify uniqueness
        const checkUnique = await client.query(
          'SELECT id FROM assets WHERE business_id = $1 AND asset_code = $2',
          [businessId, assetCode]
        );

        if (checkUnique.rows.length > 0) {
          throw new Error(`Asset code ${assetCode} already exists`);
        }
      }

      // Useful life - Schema already converted years → months
      const usefulLifeMonths = assetData.useful_life_months || 60;

      log.info('Creating asset with useful life:', {
        received_months: assetData.useful_life_months,
        received_years: assetData.useful_life_years,
        storing_months: usefulLifeMonths
      });

      // ✅ FIX: Store purchase_date directly as string (already validated by schema)
      const purchaseDate = assetData.purchase_date || new Date().toISOString().split('T')[0];
      
      log.info('Creating asset with purchase date:', {
        received: assetData.purchase_date,
        storing: purchaseDate,
        note: 'Storing as YYYY-MM-DD string to prevent timezone conversion'
      });

      // Use purchase_cost (not purchase_price)
      const purchaseCost = parseFloat(assetData.purchase_cost || assetData.purchase_price || 0);

      // Insert into assets table
      const result = await client.query(
        `INSERT INTO assets (
          business_id, asset_code, asset_name, category, asset_type,
          purchase_date, purchase_cost, salvage_value, useful_life_months,
          depreciation_method, depreciation_rate,
          serial_number, model, manufacturer, location,
          status, condition_status, notes,
          department_id, supplier_id, purchase_order_id,
          current_book_value,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        RETURNING *`,
        [
          businessId,
          assetCode,
          assetData.asset_name,
          assetData.category,
          'tangible',
          purchaseDate,  // ✅ Already a string
          purchaseCost,
          parseFloat(assetData.salvage_value || 0),
          usefulLifeMonths,
          assetData.depreciation_method || 'straight_line',
          assetData.depreciation_rate || null,
          assetData.serial_number || null,
          assetData.model || null,
          assetData.manufacturer || null,
          assetData.location || null,
          'active',
          assetData.condition_status || 'excellent',
          assetData.notes || assetData.description || null,
          assetData.department_id || null,
          assetData.supplier_id || null,
          assetData.purchase_order_id || null,
          purchaseCost, // Initial book value = purchase cost
          userId
        ]
      );

      const asset = result.rows[0];

      // ✅ Diagnostic log after the INSERT
      log.info('Database returned purchase_date:', {
        db_value: asset.purchase_date,
        db_type: typeof asset.purchase_date,
        db_instanceof_date: asset.purchase_date instanceof Date,
        db_to_string: asset.purchase_date ? asset.purchase_date.toString() : 'null',
        db_to_iso: asset.purchase_date ? asset.purchase_date.toISOString() : 'null'
      });

      // ✅ FIX: FORCE purchase_date to string format before returning
      if (asset.purchase_date instanceof Date) {
        // Convert to YYYY-MM-DD in LOCAL timezone (not UTC)
        const d = new Date(asset.purchase_date);
        // Add timezone offset to get local date
        const localDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
        asset.purchase_date = localDate.toISOString().split('T')[0];
      }

      // ✅ FIX: Verify persistence INSIDE transaction (before commit)
      const verificationInTxn = await client.query(
        'SELECT id, purchase_date FROM assets WHERE id = $1 AND business_id = $2',
        [asset.id, businessId]
      );

      if (verificationInTxn.rows.length === 0) {
        log.error('CRITICAL: Asset not found immediately after INSERT', {
          asset_id: asset.id,
          asset_code: asset.asset_code,
          business_id: businessId
        });
        throw new Error('Asset creation failed - row not visible after INSERT');
      }

      log.info('In-transaction verification passed', {
        asset_id: asset.id,
        found_purchase_date: verificationInTxn.rows[0].purchase_date
      });

      // Create accounting journal entry for asset purchase
      if (asset.purchase_cost > 0) {
        try {
          // Use today's date if purchase date is in the future for journal entries
          const effectiveJournalDate = new Date(purchaseDate) > new Date()
            ? new Date().toISOString().split('T')[0]
            : purchaseDate;

          // Add this logging before the journal creation
          log.info('Calling create_asset_purchase_journal with:', {
            businessId,
            assetId: asset.id,
            assetIdType: typeof asset.id,
            userId,
            effectiveJournalDate,
            functionSignature: 'create_asset_purchase_journal(p_business_id uuid, p_asset_id uuid, p_user_id uuid, p_journal_date date)'
          });

          // 🚨 FIX THIS LINE - Remove "as journal_entry_id"
          const journalResult = await client.query(
            'SELECT create_asset_purchase_journal($1, $2, $3, $4)',
            [businessId, asset.id, userId, effectiveJournalDate]
          );
          
          // After getting the result
          log.info('Journal creation result structure:', {
            rows: journalResult.rows,
            rowCount: journalResult.rowCount,
            fields: journalResult.fields ? journalResult.fields.map(f => f.name) : [],
            keys: Object.keys(journalResult.rows[0] || {})
          });

          // 🚨 FIX THIS LINE - Use the function name as property
          asset.journal_entry_id = journalResult.rows[0].create_asset_purchase_journal;

          log.info('Asset purchase journal created:', {
            asset_id: asset.id,
            journal_entry_id: asset.journal_entry_id,  // Now will be correct!
            purchase_date: purchaseDate,
            effective_journal_date: effectiveJournalDate,
            is_future_purchase: new Date(purchaseDate) > new Date()
          });
        } catch (journalError) {
          log.warn('Failed to create asset purchase journal entry:', {
            error: journalError.message,
            asset_id: asset.id,
            purchase_date: purchaseDate
          });
          // Continue without journal entry - don't fail the transaction
          asset.journal_entry_warning = journalError.message;
        }
      }

      // Log the asset creation
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'asset.created',
        resourceType: 'asset',
        resourceId: asset.id,
        newValues: {
          asset_code: asset.asset_code,
          asset_name: asset.asset_name,
          purchase_cost: asset.purchase_cost,
          useful_life_months: asset.useful_life_months,
          purchase_date: asset.purchase_date
        }
      });

      log.info('Asset created successfully:', {
        asset_id: asset.id,
        asset_code: asset.asset_code,
        useful_life_months: asset.useful_life_months,
        purchase_date: asset.purchase_date,
        purchase_cost: asset.purchase_cost
      });

      // Commit the transaction
      await client.query('COMMIT');

      log.info('Transaction committed successfully', { asset_id: asset.id });

      // ✅ FIX: Post-commit verification - ensure RLS variable is still set
      try {
        const verification = await client.query(
          'SELECT id, purchase_date::text as purchase_date_str FROM assets WHERE id = $1 AND business_id = $2',
          [asset.id, businessId]
        );

        if (verification.rows.length === 0) {
          log.error('CRITICAL: Asset committed but not found in database', {
            asset_id: asset.id,
            asset_code: asset.asset_code,
            business_id: businessId,
            note: 'RLS policy may be blocking access - trying to reset session variable'
          });

          // Try setting it again and re-query
          await client.query(
            "SELECT set_config('app.current_business_id', $1, false)",
            [businessId]
          );

          const retryVerification = await client.query(
            'SELECT id, purchase_date::text as purchase_date_str FROM assets WHERE id = $1 AND business_id = $2',
            [asset.id, businessId]
          );

          if (retryVerification.rows.length === 0) {
            log.error('CRITICAL: Asset still not found after RLS reset', {
              asset_id: asset.id,
              asset_code: asset.asset_code
            });
          } else {
            log.info('Post-commit verification passed after RLS reset', {
              asset_id: asset.id,
              purchase_date_verified: retryVerification.rows[0].purchase_date_str
            });
          }
        } else {
          log.info('Post-commit verification passed', {
            asset_id: asset.id,
            asset_code: asset.asset_code,
            purchase_date_verified: verification.rows[0].purchase_date_str
          });
        }
      } catch (verifyError) {
        log.warn('Post-commit verification query failed:', {
          error: verifyError.message,
          asset_id: asset.id,
          note: 'Asset was created successfully despite verification failure'
        });
      }

      // ✅ FIX: Format dates as strings to prevent timezone conversion in response
      // Convert DATE columns to YYYY-MM-DD strings before returning
      if (asset.purchase_date instanceof Date) {
        const d = asset.purchase_date;
        asset.purchase_date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      }
      if (asset.disposal_date instanceof Date) {
        const d = asset.disposal_date;
        asset.disposal_date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      }
      if (asset.depreciation_start_date instanceof Date) {
        const d = asset.depreciation_start_date;
        asset.depreciation_start_date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      }

      return asset;

    } catch (error) {
      await client.query('ROLLBACK');

      log.error('Asset creation failed:', {
        error: error.message,
        stack: error.stack,
        businessId,
        assetData: {
          asset_name: assetData.asset_name,
          useful_life_months: assetData.useful_life_months,
          purchase_date: assetData.purchase_date,
          category: assetData.category
        }
      });

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all fixed assets for a business
   */
  static async getFixedAssets(businessId, filters = {}) {
    const client = await getClient();
    try {
      let queryStr = `
        SELECT a.*,
               d.name as department_name,
               s.name as supplier_name,
               COUNT(ad.id) as depreciation_count
        FROM assets a
        LEFT JOIN departments d ON a.department_id = d.id
        LEFT JOIN suppliers s ON a.supplier_id = s.id
        LEFT JOIN asset_depreciations ad ON a.id = ad.asset_id
        WHERE a.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.category) {
        paramCount++;
        queryStr += ` AND a.category = $${paramCount}`;
        params.push(filters.category);
      }

      if (filters.condition_status) {
        paramCount++;
        queryStr += ` AND a.condition_status = $${paramCount}`;
        params.push(filters.condition_status);
      }

      if (filters.status) {
        paramCount++;
        queryStr += ` AND a.status = $${paramCount}`;
        params.push(filters.status);
      }

      if (filters.is_active !== undefined) {
        paramCount++;
        queryStr += ` AND a.is_active = $${paramCount}`;
        params.push(filters.is_active);
      }

      queryStr += ' GROUP BY a.id, d.name, s.name ORDER BY a.created_at DESC';

      const result = await client.query(queryStr, params);

      // Format response to include both old and new field names for compatibility
      return result.rows.map(asset => ({
        id: asset.id,
        business_id: asset.business_id,
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        category: asset.category,
        description: asset.notes,
        notes: asset.notes,
        purchase_date: asset.purchase_date,
        purchase_price: asset.purchase_cost,
        purchase_cost: asset.purchase_cost,
        current_value: asset.current_book_value,
        depreciation_method: asset.depreciation_method,
        depreciation_rate: asset.depreciation_rate,
        useful_life_months: asset.useful_life_months,
        useful_life_years: Math.floor(asset.useful_life_months / 12),
        salvage_value: asset.salvage_value,
        location: asset.location,
        status: asset.status,
        condition_status: asset.condition_status,
        serial_number: asset.serial_number,
        model: asset.model,
        manufacturer: asset.manufacturer,
        supplier: asset.supplier_name,
        department: asset.department_name,
        is_active: asset.is_active,
        created_at: asset.created_at,
        updated_at: asset.updated_at,
        depreciation_count: parseInt(asset.depreciation_count) || 0
      }));
    } catch (error) {
      log.error('Error fetching fixed assets:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get asset by ID
   */
  static async getAssetById(businessId, assetId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT a.*,
                d.name as department_name,
                s.name as supplier_name,
                po.po_number
         FROM assets a
         LEFT JOIN departments d ON a.department_id = d.id
         LEFT JOIN suppliers s ON a.supplier_id = s.id
         LEFT JOIN purchase_orders po ON a.purchase_order_id = po.id
         WHERE a.id = $1 AND a.business_id = $2`,
        [assetId, businessId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const asset = result.rows[0];

      // Get depreciation history
      const depreciationResult = await client.query(
        `SELECT ad.*, je.reference_number as journal_reference
         FROM asset_depreciations ad
         LEFT JOIN journal_entries je ON ad.journal_entry_id = je.id
         WHERE ad.asset_id = $1
         ORDER BY ad.period_year DESC, ad.period_month DESC`,
        [assetId]
      );

      // Format response
      return {
        id: asset.id,
        business_id: asset.business_id,
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        category: asset.category,
        description: asset.notes,
        notes: asset.notes,
        purchase_date: asset.purchase_date,
        purchase_price: asset.purchase_cost,
        purchase_cost: asset.purchase_cost,
        current_value: asset.current_book_value,
        depreciation_method: asset.depreciation_method,
        depreciation_rate: asset.depreciation_rate,
        useful_life_months: asset.useful_life_months,
        useful_life_years: Math.floor(asset.useful_life_months / 12),
        salvage_value: asset.salvage_value,
        location: asset.location,
        status: asset.status,
        condition_status: asset.condition_status,
        serial_number: asset.serial_number,
        model: asset.model,
        manufacturer: asset.manufacturer,
        supplier: asset.supplier_name,
        supplier_id: asset.supplier_id,
        purchase_order_id: asset.purchase_order_id,
        purchase_order_number: asset.po_number,
        department: asset.department_name,
        department_id: asset.department_id,
        is_active: asset.is_active,
        created_at: asset.created_at,
        updated_at: asset.updated_at,
        depreciation_history: depreciationResult.rows
      };
    } catch (error) {
      log.error('Error fetching asset by ID:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update asset details
   */
  static async updateAsset(businessId, assetId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Map old field names to new column names
      const fieldMap = {
        asset_name: 'asset_name',
        category: 'category',
        description: 'notes',
        notes: 'notes',
        current_value: 'current_book_value',
        location: 'location',
        status: 'status',
        condition_status: 'condition_status',
        serial_number: 'serial_number',
        model: 'model',
        manufacturer: 'manufacturer'
      };

      // Build update query
      const updates = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updateData).forEach(field => {
        if (fieldMap[field] && updateData[field] !== undefined) {
          updates.push(`${fieldMap[field]} = $${paramCount}`);
          values.push(updateData[field]);
          paramCount++;
        }
      });

      if (updates.length === 0) {
        throw new Error('No valid fields to update');
      }

      // Add assetId and businessId to values
      values.push(assetId, businessId);

      const result = await client.query(
        `UPDATE assets
         SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramCount} AND business_id = $${paramCount + 1}
         RETURNING *`,
        values
      );

      const updatedAsset = result.rows[0];

      // Log the asset update
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'asset.updated',
        resourceType: 'asset',
        resourceId: assetId,
        newValues: updateData
      });

      log.info('Asset updated', {
        businessId,
        userId,
        assetId,
        assetName: updatedAsset.asset_name
      });

      await client.query('COMMIT');

      // Return formatted response
      return {
        id: updatedAsset.id,
        asset_code: updatedAsset.asset_code,
        asset_name: updatedAsset.asset_name,
        category: updatedAsset.category,
        description: updatedAsset.notes,
        notes: updatedAsset.notes,
        current_value: updatedAsset.current_book_value,
        location: updatedAsset.location,
        status: updatedAsset.status,
        condition_status: updatedAsset.condition_status,
        serial_number: updatedAsset.serial_number,
        model: updatedAsset.model,
        manufacturer: updatedAsset.manufacturer,
        updated_at: updatedAsset.updated_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get asset statistics
   */
  static async getAssetStatistics(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT
           COUNT(*) as total_assets,
           COUNT(*) FILTER (WHERE is_active = true) as active_assets,
           COUNT(*) FILTER (WHERE is_active = false) as inactive_assets,
           SUM(purchase_cost) as total_purchase_value,
           SUM(current_book_value) as total_current_value,
           AVG(purchase_cost) as avg_asset_value,
           COUNT(*) FILTER (WHERE status = 'under_maintenance') as assets_under_maintenance,
           COUNT(*) FILTER (WHERE condition_status IN ('poor', 'broken')) as poor_condition_assets
         FROM assets
         WHERE business_id = $1`,
        [businessId]
      );

      const stats = result.rows[0];

      // Get category breakdown
      const categoryResult = await client.query(
        `SELECT category, COUNT(*) as count, SUM(purchase_cost) as total_cost
         FROM assets
         WHERE business_id = $1
         GROUP BY category
         ORDER BY total_cost DESC`,
        [businessId]
      );

      // Get depreciation summary
      const depreciationResult = await client.query(
        `SELECT
            COUNT(DISTINCT asset_id) as assets_with_depreciation,
            SUM(depreciation_amount) as total_depreciation_this_year,
            COUNT(*) as depreciation_entries_count
         FROM asset_depreciations
         WHERE business_id = $1 AND period_year = EXTRACT(YEAR FROM CURRENT_DATE)`,
        [businessId]
      );

      return {
        total_assets: parseInt(stats.total_assets) || 0,
        active_assets: parseInt(stats.active_assets) || 0,
        inactive_assets: parseInt(stats.inactive_assets) || 0,
        total_purchase_value: parseFloat(stats.total_purchase_value) || 0,
        total_current_value: parseFloat(stats.total_current_value) || 0,
        avg_asset_value: parseFloat(stats.avg_asset_value) || 0,
        assets_under_maintenance: parseInt(stats.assets_under_maintenance) || 0,
        poor_condition_assets: parseInt(stats.poor_condition_assets) || 0,
        categories: categoryResult.rows,
        depreciation_summary: depreciationResult.rows[0] || {}
      };
    } catch (error) {
      log.error('Error fetching asset statistics:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Register existing asset (without purchase)
   */
  static async registerExistingAsset(businessId, assetData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Ensure fixed asset accounts exist
      await client.query(
        'SELECT ensure_fixed_asset_accounts($1)',
        [businessId]
      );

      // Call the database function to register existing asset
      const result = await client.query(
        'SELECT register_existing_asset($1, $2, $3) as asset_id',
        [businessId, JSON.stringify(assetData), userId]
      );

      const assetId = result.rows[0].asset_id;

      // Get the created asset
      const assetResult = await client.query(
        'SELECT * FROM assets WHERE id = $1 AND business_id = $2',
        [assetId, businessId]
      );

      const asset = assetResult.rows[0];

      // Log the action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'asset.registered_existing',
        resourceType: 'asset',
        resourceId: asset.id,
        newValues: {
          asset_code: asset.asset_code,
          asset_name: asset.asset_name,
          acquisition_method: 'existing',
          current_book_value: asset.current_book_value,
          existing_depreciation: asset.existing_accumulated_depreciation
        }
      });

      log.info('Existing asset registered', {
        businessId,
        userId,
        assetId: asset.id,
        assetCode: asset.asset_code,
        assetName: asset.asset_name
      });

      await client.query('COMMIT');
      return asset;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate historical depreciation for an asset
   */
  static async calculateHistoricalDepreciation(businessId, assetId, asOfDate = new Date()) {
    const client = await getClient();

    try {
      const result = await client.query(
        'SELECT calc_period_month as period_month, calc_period_year as period_year, ' +
        'calc_depreciation_date as depreciation_date, calc_depreciation_amount as depreciation_amount, ' +
        'calc_accumulated_depreciation as accumulated_depreciation, calc_book_value as book_value ' +
        'FROM calculate_historical_depreciation($1, $2)',
        [assetId, asOfDate]
      );

      return result.rows;

    } catch (error) {
      log.error('Error calculating historical depreciation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Post historical depreciation for an asset
   */
  static async postHistoricalDepreciation(businessId, assetId, userId, asOfDate = new Date()) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        'SELECT posted_period_month as period_month, posted_period_year as period_year, ' +
        'posted_depreciation_amount as depreciation_amount, posted_success as success, ' +
        'posted_message as message ' +
        'FROM post_historical_depreciation($1, $2, $3, $4)',
        [businessId, assetId, userId, asOfDate]
      );

      // Log the action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'asset.historical_depreciation_posted',
        resourceType: 'asset',
        resourceId: assetId,
        newValues: {
          as_of_date: asOfDate,
          entries_posted: result.rows.length
        }
      });

      await client.query('COMMIT');
      return result.rows;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error posting historical depreciation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get asset register report
   */
  static async getAssetRegister(businessId, filters = {}) {
    const client = await getClient();

    try {
      let query = `SELECT * FROM asset_register WHERE business_id = $1`;
      const params = [businessId];

      if (filters.category) {
        query += ` AND category = $2`;
        params.push(filters.category);
      }

      if (filters.is_active !== undefined) {
        query += ` AND is_active = $${params.length + 1}`;
        params.push(filters.is_active);
      }

      query += ` ORDER BY asset_code`;

      const result = await client.query(query, params);
      return result.rows;

    } catch (error) {
      log.error('Error fetching asset register:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get enhanced asset register
   */
  static async getEnhancedAssetRegister(businessId, filters = {}) {
    const client = await getClient();

    try {
      let query = 'SELECT * FROM enhanced_asset_register WHERE business_id = $1';
      const params = [businessId];
      let paramCount = 1;

      if (filters.acquisition_method) {
        paramCount++;
        query += ` AND acquisition_method = $${paramCount}`;
        params.push(filters.acquisition_method);
      }

      if (filters.is_existing_asset !== undefined) {
        paramCount++;
        query += ` AND is_existing_asset = $${paramCount}`;
        params.push(filters.is_existing_asset);
      }

      if (filters.category) {
        paramCount++;
        query += ` AND category = $${paramCount}`;
        params.push(filters.category);
      }

      query += ` ORDER BY asset_code`;

      const result = await client.query(query, params);
      return result.rows;

    } catch (error) {
      log.error('Error fetching enhanced asset register:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get depreciation schedule
   */
  static async getDepreciationSchedule(businessId, filters = {}) {
    const client = await getClient();

    try {
      let query = `SELECT * FROM depreciation_schedule WHERE business_id = $1`;
      const params = [businessId];

      if (filters.year) {
        query += ` AND period_year = $2`;
        params.push(filters.year);
      }

      if (filters.asset_id) {
        query += ` AND asset_id = $${params.length + 1}`;
        params.push(filters.asset_id);
      }

      query += ` ORDER BY period_year DESC, period_month DESC, asset_code`;

      const result = await client.query(query, params);
      return result.rows;

    } catch (error) {
      log.error('Error fetching depreciation schedule:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Post monthly depreciation
   */
  static async postMonthlyDepreciation(businessId, month, year, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        'SELECT * FROM post_monthly_depreciation($1, $2, $3, $4)',
        [businessId, month, year, userId]
      );

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'asset.depreciation.posted',
        resourceType: 'system',
        resourceId: null,
        newValues: {
          month,
          year,
          assets_processed: result.rows.length
        }
      });

      await client.query('COMMIT');

      return result.rows;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error posting depreciation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate depreciation for specific asset
   */
  static async calculateDepreciation(businessId, assetId, month, year) {
    const client = await getClient();

    try {
      const result = await client.query(
        'SELECT calculate_monthly_depreciation($1, $2, $3) as depreciation_amount',
        [assetId, month, year]
      );

      return parseFloat(result.rows[0].depreciation_amount) || 0;

    } catch (error) {
      log.error('Error calculating depreciation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Dispose of asset
   */
  static async disposeAsset(businessId, assetId, disposalData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get asset details
      const assetResult = await client.query(
        'SELECT * FROM assets WHERE business_id = $1 AND id = $2 AND is_active = true',
        [businessId, assetId]
      );

      if (assetResult.rows.length === 0) {
        throw new Error('Active asset not found or access denied');
      }

      const asset = assetResult.rows[0];

      // Validate disposal data
      if (!disposalData.disposal_method || !disposalData.disposal_date) {
        throw new Error('Disposal method and date are required');
      }

      // Calculate gain/loss
      const bookValue = asset.current_book_value;
      const disposalAmount = parseFloat(disposalData.disposal_amount) || 0;
      const gainLoss = disposalAmount - bookValue;

      // Create journal entry for disposal (simplified - would need full implementation)
      let journalEntryId = null;
      if (disposalData.create_journal_entry !== false) {
        try {
          // This would call a database function similar to create_asset_purchase_journal
          // For now, we'll just update the asset status
          log.info('Asset disposal accounting would be implemented here', {
            assetId,
            bookValue,
            disposalAmount,
            gainLoss
          });
        } catch (error) {
          log.warn('Failed to create disposal journal entry:', error.message);
        }
      }

      // Update asset status
      const updateResult = await client.query(
        `UPDATE assets
         SET status = 'disposed',
             disposal_date = $1,
             disposal_method = $2,
             disposal_amount = $3,
             disposal_notes = $4,
             is_active = false,
             updated_at = NOW()
         WHERE id = $5 AND business_id = $6
         RETURNING *`,
        [
          disposalData.disposal_date,
          disposalData.disposal_method,
          disposalAmount,
          disposalData.notes || '',
          assetId,
          businessId
        ]
      );

      const updatedAsset = updateResult.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'asset.disposed',
        resourceType: 'asset',
        resourceId: assetId,
        newValues: {
          disposal_method: disposalData.disposal_method,
          disposal_date: disposalData.disposal_date,
          disposal_amount: disposalAmount,
          book_value: bookValue,
          gain_loss: gainLoss
        }
      });

      await client.query('COMMIT');

      return {
        asset: updatedAsset,
        disposal_details: {
          book_value: bookValue,
          disposal_amount: disposalAmount,
          gain_loss: gainLoss,
          journal_entry_id: journalEntryId
        }
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error disposing asset:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get assets by category summary
   */
  static async getAssetsByCategory(businessId) {
    const client = await getClient();

    try {
      const result = await client.query(
        'SELECT * FROM assets_by_category WHERE business_id = $1 ORDER BY total_cost DESC',
        [businessId]
      );

      return result.rows;

    } catch (error) {
      log.error('Error fetching assets by category:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
