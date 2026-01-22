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
   * @param {string} businessId - Business UUID
   * @param {object} assetData - Asset data including payment_method
   * @param {string} userId - User UUID
   * @param {string} [assetData.payment_method] - Payment method: cash, bank, mobile_money, credit (default: cash)
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

      // Determine if it's an existing asset
      const isExistingAsset = assetData.acquisition_method === 'existing';

      // Calculate the correct initial book value
      let purchaseCost = parseFloat(assetData.purchase_cost || assetData.purchase_price || 0);
      let initialBookValue = purchaseCost;
      let currentBookValue = purchaseCost;

      // Handle existing assets differently
      if (isExistingAsset && assetData.initial_book_value) {
        initialBookValue = parseFloat(assetData.initial_book_value);
        currentBookValue = initialBookValue;

        // For existing assets, calculate purchase_cost from initial_book_value + accumulated depreciation
        if (assetData.existing_accumulated_depreciation) {
          purchaseCost = initialBookValue + parseFloat(assetData.existing_accumulated_depreciation);
        }
      }

      // Insert into assets table - CORRECTED VERSION with proper column/placeholder count
      const result = await client.query(
        `INSERT INTO assets (
          business_id, asset_code, asset_name, category, asset_type,
          purchase_date, purchase_cost, salvage_value, useful_life_months,
          depreciation_method, depreciation_rate,
          serial_number, model, manufacturer, location,
          status, condition_status, notes,
          department_id, supplier_id, purchase_order_id,
          current_book_value, initial_book_value,
          existing_accumulated_depreciation, acquisition_method,
          is_existing_asset,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
        RETURNING *`,
        [
          businessId,                    // $1
          assetCode,                     // $2
          assetData.asset_name,          // $3
          assetData.category,            // $4
          'tangible',                    // $5
          purchaseDate,                  // $6
          purchaseCost,                  // $7
          parseFloat(assetData.salvage_value || 0), // $8
          usefulLifeMonths,              // $9
          assetData.depreciation_method || 'straight_line', // $10
          assetData.depreciation_rate || null, // $11
          assetData.serial_number || null, // $12
          assetData.model || null,       // $13
          assetData.manufacturer || null, // $14
          assetData.location || null,    // $15
          'active',                      // $16
          assetData.condition_status || 'excellent', // $17
          assetData.notes || assetData.description || null, // $18
          assetData.department_id || null, // $19
          assetData.supplier_id || null, // $20
          assetData.purchase_order_id || null, // $21
          currentBookValue,              // $22
          initialBookValue,              // $23
          parseFloat(assetData.existing_accumulated_depreciation || 0), // $24
          assetData.acquisition_method || 'purchase', // $25
          isExistingAsset,               // $26
          userId                         // $27
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

      // ✅ FIX: Ensure purchase_date is string in YYYY-MM-DD format
      if (asset.purchase_date) {
        if (asset.purchase_date instanceof Date) {
          // Get the date as stored in database (already correct)
          const year = asset.purchase_date.getFullYear();
          const month = String(asset.purchase_date.getMonth() + 1).padStart(2, '0');
          const day = String(asset.purchase_date.getDate()).padStart(2, '0');
          asset.purchase_date = `${year}-${month}-${day}`;
        }
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
      // ONLY for purchased assets, not for existing assets
      if (asset.purchase_cost > 0 && assetData.acquisition_method !== 'existing') {
        try {
          // Use today's date if purchase date is in the future for journal entries
          const effectiveJournalDate = new Date(purchaseDate) > new Date()
            ? new Date().toISOString().split('T')[0]
            : purchaseDate;

          // Extract payment method from assetData, default to 'cash' for backward compatibility
          const paymentMethod = assetData.payment_method || assetData.paymentMethod || 'cash';

          // Add this logging before the journal creation
          log.info('Calling create_asset_purchase_journal_v2 with:', {
            businessId,
            assetId: asset.id,
            assetIdType: typeof asset.id,
            userId,
            effectiveJournalDate,
            paymentMethod,
            functionSignature: 'create_asset_purchase_journal_v2(p_business_id uuid, p_asset_id uuid, p_user_id uuid, p_journal_date date, p_payment_method text)'
          });

          // 🚨 UPDATED: Call V2 function with payment method parameter
          const journalResult = await client.query(
            'SELECT create_asset_purchase_journal_v2($1, $2, $3, $4, $5)',
            [businessId, asset.id, userId, effectiveJournalDate, paymentMethod]
          );

          // After getting the result
          log.info('Journal creation result structure:', {
            rows: journalResult.rows,
            rowCount: journalResult.rowCount,
            fields: journalResult.fields ? journalResult.fields.map(f => f.name) : [],
            keys: Object.keys(journalResult.rows[0] || {})
          });

          // 🚨 FIX THIS LINE - Use the function name as property
          asset.journal_entry_id = journalResult.rows[0].create_asset_purchase_journal_v2;

          log.info('Asset purchase journal created with payment method:', {
            asset_id: asset.id,
            journal_entry_id: asset.journal_entry_id,
            payment_method: paymentMethod,
            purchase_date: purchaseDate,
            effective_journal_date: effectiveJournalDate,
            is_future_purchase: new Date(purchaseDate) > new Date()
          });
        } catch (journalError) {
          log.warn('Failed to create asset purchase journal entry:', {
            error: journalError.message,
            asset_id: asset.id,
            purchase_date: purchaseDate,
            payment_method: assetData.payment_method
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
          purchase_date: asset.purchase_date,
          acquisition_method: asset.acquisition_method,
          is_existing_asset: asset.is_existing_asset,
          payment_method: assetData.payment_method || 'cash'
        }
      });

      log.info('Asset created successfully:', {
        asset_id: asset.id,
        asset_code: asset.asset_code,
        useful_life_months: asset.useful_life_months,
        purchase_date: asset.purchase_date,
        purchase_cost: asset.purchase_cost,
        initial_book_value: asset.initial_book_value,
        acquisition_method: asset.acquisition_method,
        is_existing_asset: asset.is_existing_asset,
        payment_method: assetData.payment_method || 'cash'
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
          category: assetData.category,
          acquisition_method: assetData.acquisition_method,
          payment_method: assetData.payment_method
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

      if (filters.acquisition_method) {
        paramCount++;
        queryStr += ` AND a.acquisition_method = $${paramCount}`;
        params.push(filters.acquisition_method);
      }

      if (filters.is_existing_asset !== undefined) {
        paramCount++;
        queryStr += ` AND a.is_existing_asset = $${paramCount}`;
        params.push(filters.is_existing_asset);
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
        initial_book_value: asset.initial_book_value,
        existing_accumulated_depreciation: asset.existing_accumulated_depreciation,
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
        acquisition_method: asset.acquisition_method,
        is_existing_asset: asset.is_existing_asset,
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

      // FIX 1: Format depreciation history dates
      const formattedDepreciationHistory = depreciationResult.rows.map(dep => {
        const formatted = { ...dep };

        // Format depreciation_date
        if (formatted.depreciation_date instanceof Date) {
          const d = formatted.depreciation_date;
          formatted.depreciation_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        // Format other date fields
        ['posted_at', 'calculated_at', 'created_at', 'updated_at'].forEach(field => {
          if (formatted[field] instanceof Date) {
            const d = formatted[field];
            formatted[field] = {
              date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
              time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
            };
          }
        });

        return formatted;
      });

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
        initial_book_value: asset.initial_book_value,
        existing_accumulated_depreciation: asset.existing_accumulated_depreciation,
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
        acquisition_method: asset.acquisition_method,
        is_existing_asset: asset.is_existing_asset,
        is_active: asset.is_active,
        created_at: asset.created_at,
        updated_at: asset.updated_at,
        depreciation_history: formattedDepreciationHistory
      };
    } catch (error) {
      log.error('Error fetching asset by ID:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get asset by asset code
   */
  static async getAssetByCode(businessId, assetCode) {
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
       WHERE a.asset_code = $1 AND a.business_id = $2`,
        [assetCode, businessId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const asset = result.rows[0];

      // Fix date formats
      if (asset.purchase_date instanceof Date) {
        const year = asset.purchase_date.getFullYear();
        const month = String(asset.purchase_date.getMonth() + 1).padStart(2, '0');
        const day = String(asset.purchase_date.getDate()).padStart(2, '0');
        asset.purchase_date = `${year}-${month}-${day}`;
      }

      // Also fix other date fields if they exist
      if (asset.depreciation_start_date instanceof Date) {
        const d = asset.depreciation_start_date;
        asset.depreciation_start_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }

      // Get depreciation history
      const depreciationResult = await client.query(
        `SELECT ad.*, je.reference_number as journal_reference
       FROM asset_depreciations ad
       LEFT JOIN journal_entries je ON ad.journal_entry_id = je.id
       WHERE ad.asset_id = $1
       ORDER BY ad.period_year DESC, ad.period_month DESC`,
        [asset.id]
      );

      // FIX 1: Format depreciation history dates
      const formattedDepreciationHistory = depreciationResult.rows.map(dep => {
        const formatted = { ...dep };

        // Format depreciation_date
        if (formatted.depreciation_date instanceof Date) {
          const d = formatted.depreciation_date;
          formatted.depreciation_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        // Format other date fields
        ['posted_at', 'calculated_at', 'created_at', 'updated_at'].forEach(field => {
          if (formatted[field] instanceof Date) {
            const d = formatted[field];
            formatted[field] = {
              date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
              time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
            };
          }
        });

        return formatted;
      });

      // Format response same as getAssetById
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
        depreciation_history: formattedDepreciationHistory
      };
    } catch (error) {
      log.error('Error fetching asset by code:', error);
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
        manufacturer: 'manufacturer',
        acquisition_method: 'acquisition_method',
        initial_book_value: 'initial_book_value',
        existing_accumulated_depreciation: 'existing_accumulated_depreciation'
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

      // Update is_existing_asset based on acquisition_method if provided
      if (updateData.acquisition_method) {
        const isExistingAsset = updateData.acquisition_method === 'existing';
        updates.push(`is_existing_asset = $${paramCount}`);
        values.push(isExistingAsset);
        paramCount++;
      }

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
        initial_book_value: updatedAsset.initial_book_value,
        existing_accumulated_depreciation: updatedAsset.existing_accumulated_depreciation,
        location: updatedAsset.location,
        status: updatedAsset.status,
        condition_status: updatedAsset.condition_status,
        serial_number: updatedAsset.serial_number,
        model: updatedAsset.model,
        manufacturer: updatedAsset.manufacturer,
        acquisition_method: updatedAsset.acquisition_method,
        is_existing_asset: updatedAsset.is_existing_asset,
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
           COUNT(*) FILTER (WHERE is_existing_asset = true) as existing_assets,
           SUM(purchase_cost) as total_purchase_value,
           SUM(current_book_value) as total_current_value,
           SUM(initial_book_value) as total_initial_value,
           SUM(existing_accumulated_depreciation) as total_existing_depreciation,
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

      // Get acquisition method breakdown
      const acquisitionResult = await client.query(
        `SELECT acquisition_method, COUNT(*) as count, SUM(purchase_cost) as total_cost
         FROM assets
         WHERE business_id = $1
         GROUP BY acquisition_method
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
        existing_assets: parseInt(stats.existing_assets) || 0,
        total_purchase_value: parseFloat(stats.total_purchase_value) || 0,
        total_current_value: parseFloat(stats.total_current_value) || 0,
        total_initial_value: parseFloat(stats.total_initial_value) || 0,
        total_existing_depreciation: parseFloat(stats.total_existing_depreciation) || 0,
        avg_asset_value: parseFloat(stats.avg_asset_value) || 0,
        assets_under_maintenance: parseInt(stats.assets_under_maintenance) || 0,
        poor_condition_assets: parseInt(stats.poor_condition_assets) || 0,
        categories: categoryResult.rows,
        acquisition_methods: acquisitionResult.rows,
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

      // Set acquisition_method to 'existing' by default
      assetData.acquisition_method = 'existing';

      // If purchase_date not provided, use today
      if (!assetData.purchase_date) {
        assetData.purchase_date = new Date().toISOString().split('T')[0];
      }

      // Use the same createFixedAsset logic
      const asset = await this.createFixedAsset(businessId, assetData, userId);

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

      if (filters.acquisition_method) {
        query += ` AND acquisition_method = $${params.length + 1}`;
        params.push(filters.acquisition_method);
      }

      if (filters.is_existing_asset !== undefined) {
        query += ` AND is_existing_asset = $${params.length + 1}`;
        params.push(filters.is_existing_asset);
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

      if (filters.acquisition_method) {
        query += ` AND acquisition_method = $${params.length + 1}`;
        params.push(filters.acquisition_method);
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

      // ✅ Use the DATE-FIXED function
      const result = await client.query(
        'SELECT * FROM post_monthly_depreciation_fixed_bug($1, $2, $3, $4)',
        [businessId, month, year, userId]
      );

      // Check if any assets were already posted
      const alreadyPostedAssets = result.rows.filter(row =>
        row.message && row.message.includes('already posted') ||
        row.success === false
      );

      if (alreadyPostedAssets.length > 0) {
        log.warn('Some assets already had depreciation posted', {
          month, year, alreadyPostedCount: alreadyPostedAssets.length
        });
      }

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
          assets_processed: result.rows.length,
          already_posted: alreadyPostedAssets.length
        }
      });

      await client.query('COMMIT');

      // Enhance response with better information
      const enhancedResult = result.rows.map(row => ({
        ...row,
        note: row.success === false ? 'Already posted or not eligible' : 'Depreciation posted successfully'
      }));

      return enhancedResult;

    } catch (error) {
      await client.query('ROLLBACK');

      // FIX 2: Better error message for already-posted months
      if (error.message.includes('already') || error.message.includes('duplicate') || error.message.includes('exists')) {
        log.warn('Attempt to post already-posted depreciation', { month, year, error: error.message });
        throw new Error(`Cannot post depreciation for ${month}/${year}. This period may already be posted. Check depreciation history or use correction workflow.`);
      }

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

      const depreciationAmount = parseFloat(result.rows[0].depreciation_amount) || 0;

      // FIX 3: Get asset details to provide context for January depreciation issue
      const assetResult = await client.query(
        'SELECT purchase_date, depreciation_start_date FROM assets WHERE id = $1',
        [assetId]
      );

      const asset = assetResult.rows[0];
      let note = '';

      if (depreciationAmount === 0 && asset.purchase_date) {
        const purchaseDate = new Date(asset.purchase_date);
        const depreciationDate = new Date(year, month - 1, 1); // Month is 0-indexed

        // Check if it's the first month after purchase
        if (purchaseDate.getMonth() === depreciationDate.getMonth() &&
            purchaseDate.getFullYear() === depreciationDate.getFullYear()) {
          note = 'No depreciation in purchase month (GAAP compliant)';
        }
      }

      return {
        amount: depreciationAmount,
        note: note
      };

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
   * Transfer asset to different department/location
   */
  static async transferAsset(businessId, assetIdentifier, transferData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if assetIdentifier is UUID or asset_code
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let assetId = assetIdentifier;

      if (!uuidRegex.test(assetIdentifier)) {
        // It's an asset_code, look up the UUID
        const codeResult = await client.query(
          'SELECT id FROM assets WHERE business_id = $1 AND asset_code = $2 AND is_active = true',
          [businessId, assetIdentifier]
        );

        if (codeResult.rows.length === 0) {
          throw new Error(`Asset with code ${assetIdentifier} not found`);
        }

        assetId = codeResult.rows[0].id;
      }

      // Get current asset details including current department and location
      const assetResult = await client.query(
        `SELECT a.id, a.asset_code, a.asset_name, a.department_id, a.location,
                d.name as current_department_name
         FROM assets a
         LEFT JOIN departments d ON a.department_id = d.id
         WHERE a.id = $1 AND a.business_id = $2 AND a.is_active = true`,
        [assetId, businessId]
      );

      if (assetResult.rows.length === 0) {
        throw new Error('Active asset not found or access denied');
      }

      const asset = assetResult.rows[0];
      const fromDepartmentId = asset.department_id;
      const fromLocation = asset.location;
      const currentDepartmentName = asset.current_department_name || 'No Department';

      // Validate target department exists (if provided)
      if (transferData.to_department_id) {
        const departmentExists = await client.query(
          'SELECT id, name FROM departments WHERE business_id = $1 AND id = $2',
          [businessId, transferData.to_department_id]
        );

        if (departmentExists.rows.length === 0) {
          throw new Error(`Department with ID ${transferData.to_department_id} not found`);
        }
      }

      // Build update query dynamically based on what's being transferred
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (transferData.to_department_id) {
        updates.push(`department_id = $${paramCount}`);
        values.push(transferData.to_department_id);
        paramCount++;
      }

      if (transferData.to_location) {
        updates.push(`location = $${paramCount}`);
        values.push(transferData.to_location);
        paramCount++;
      }

      if (updates.length === 0) {
        throw new Error('No valid transfer fields provided');
      }

      // Add assetId and businessId to values
      values.push(assetId, businessId);

      // Use proper date handling - same pattern as in createFixedAsset
      const transferDate = transferData.transfer_date || new Date().toISOString().split('T')[0];

      const updateResult = await client.query(
        `UPDATE assets
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${paramCount} AND business_id = $${paramCount + 1}
         RETURNING *,
           (SELECT name FROM departments WHERE id = department_id) as new_department_name`,
        values
      );

      const updatedAsset = updateResult.rows[0];

      // Create comprehensive transfer record
      const transferResult = await client.query(
        `INSERT INTO asset_transfers (
          business_id, asset_id, from_department_id, to_department_id,
          from_location, to_location, transfer_date, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          businessId,
          assetId,
          fromDepartmentId,
          transferData.to_department_id || null,
          fromLocation,
          transferData.to_location || null,
          transferDate,  // Already formatted as YYYY-MM-DD string
          transferData.notes || '',
          userId
        ]
      );

      const transferRecord = transferResult.rows[0];

      // Get new department name if transferred to a department
      let newDepartmentName = null;
      if (transferData.to_department_id) {
        const deptResult = await client.query(
          'SELECT name FROM departments WHERE id = $1',
          [transferData.to_department_id]
        );
        newDepartmentName = deptResult.rows[0]?.name || null;
      }

      // Format dates in transfer record (same pattern as asset creation)
      if (transferRecord.transfer_date instanceof Date) {
        const d = transferRecord.transfer_date;
        transferRecord.transfer_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }

      // Format created_at date (same pattern as in getAssetByCode)
      if (transferRecord.created_at instanceof Date) {
        const d = transferRecord.created_at;
        transferRecord.created_at = {
          date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
          time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
        };
      }

      // Audit log with comprehensive details
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'asset.transferred',
        resourceType: 'asset',
        resourceId: assetId,
        oldValues: {
          department_id: fromDepartmentId,
          department_name: currentDepartmentName,
          location: fromLocation
        },
        newValues: {
          department_id: transferData.to_department_id,
          department_name: newDepartmentName,
          location: transferData.to_location
        },
        metadata: {
          asset_code: asset.asset_code,
          transfer_id: transferRecord.id,
          transfer_date: transferRecord.transfer_date
        }
      });

      log.info('Asset transferred successfully', {
        businessId,
        userId,
        assetId,
        assetCode: asset.asset_code,
        fromDepartmentId,
        toDepartmentId: transferData.to_department_id,
        fromLocation,
        toLocation: transferData.to_location,
        transferId: transferRecord.id,
        updates: updates
      });

      await client.query('COMMIT');

      // Format response following existing patterns
      const response = {
        asset: {
          id: updatedAsset.id,
          asset_code: updatedAsset.asset_code,
          asset_name: updatedAsset.asset_name,
          department_id: updatedAsset.department_id,
          department_name: updatedAsset.new_department_name,
          location: updatedAsset.location,
          updated_at: updatedAsset.updated_at
        },
        transfer: transferRecord,
        summary: {
          message: 'Asset transferred successfully',
          changes: updates.map(update => update.split(' = ')[0])
        }
      };

      // Format dates in asset response (same as getAssetById)
      if (response.asset.updated_at instanceof Date) {
        const d = response.asset.updated_at;
        response.asset.updated_at = {
          date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
          time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
        };
      }

      return response;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error transferring asset:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get asset transfer history
   */
  static async getAssetTransferHistory(businessId, assetIdentifier, filters = {}) {
    const client = await getClient();

    try {
      // Check if assetIdentifier is UUID or asset_code
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let assetId = assetIdentifier;

      if (!uuidRegex.test(assetIdentifier)) {
        // It's an asset_code, look up the UUID
        const codeResult = await client.query(
          'SELECT id FROM assets WHERE business_id = $1 AND asset_code = $2',
          [businessId, assetIdentifier]
        );

        if (codeResult.rows.length === 0) {
          throw new Error(`Asset with code ${assetIdentifier} not found`);
        }

        assetId = codeResult.rows[0].id;
      }

      let query = `
        SELECT at.*,
               ad.name as to_department_name,
               ad2.name as from_department_name,
               u.email as created_by_email
        FROM asset_transfers at
        LEFT JOIN departments ad ON at.to_department_id = ad.id
        LEFT JOIN departments ad2 ON at.from_department_id = ad2.id
        LEFT JOIN users u ON at.created_by = u.id
        WHERE at.business_id = $1 AND at.asset_id = $2
      `;

      const params = [businessId, assetId];
      let paramCount = 2;

      if (filters.start_date) {
        paramCount++;
        query += ` AND at.transfer_date >= $${paramCount}`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        paramCount++;
        query += ` AND at.transfer_date <= $${paramCount}`;
        params.push(filters.end_date);
      }

      query += ' ORDER BY at.transfer_date DESC, at.created_at DESC';

      const result = await client.query(query, params);

      // Format dates in response (same pattern as depreciation history)
      const formattedTransfers = result.rows.map(transfer => {
        const formatted = { ...transfer };

        // Format transfer_date as YYYY-MM-DD string
        if (formatted.transfer_date instanceof Date) {
          const d = formatted.transfer_date;
          formatted.transfer_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        // Format other date fields (same as in getAssetByCode)
        ['created_at'].forEach(field => {
          if (formatted[field] instanceof Date) {
            const d = formatted[field];
            formatted[field] = {
              date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
              time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
            };
          }
        });

        return formatted;
      });

      return formattedTransfers;

    } catch (error) {
      log.error('Error fetching transfer history:', error);
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

  /**
   * Override/correct posted depreciation
   */
  static async overrideDepreciation(businessId, assetIdentifier, overrideData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if assetIdentifier is UUID or asset_code
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let assetId = assetIdentifier;

      if (!uuidRegex.test(assetIdentifier)) {
        // It's an asset_code, look up the UUID
        const codeResult = await client.query(
          'SELECT id FROM assets WHERE business_id = $1 AND asset_code = $2 AND is_active = true',
          [businessId, assetIdentifier]
        );

        if (codeResult.rows.length === 0) {
          throw new Error(`Asset with code ${assetIdentifier} not found`);
        }

        assetId = codeResult.rows[0].id;
      }

      // Validate required fields
      if (!overrideData.month || !overrideData.year || !overrideData.override_amount || !overrideData.reason) {
        throw new Error('month, year, override_amount, and reason are required');
      }

      // Apply the override using the database function
      const result = await client.query(
        'SELECT * FROM apply_depreciation_override($1, $2, $3, $4, $5, $6, $7)',
        [
          businessId,
          assetId,
          overrideData.month,
          overrideData.year,
          overrideData.override_amount,
          overrideData.reason,
          userId
        ]
      );

      const overrideResult = result.rows[0];

      if (!overrideResult.success) {
        throw new Error(overrideResult.message);
      }

      // Get the override record with details
      const overrideRecordResult = await client.query(
        `SELECT dpo.*,
                a.asset_code,
                a.asset_name,
                u.email as created_by_email,
                u2.email as approved_by_email
         FROM depreciation_overrides dpo
         JOIN assets a ON dpo.asset_id = a.id
         JOIN users u ON dpo.created_by = u.id
         LEFT JOIN users u2 ON dpo.approved_by = u2.id
         WHERE dpo.id = $1 AND dpo.business_id = $2`,
        [overrideResult.override_id, businessId]
      );

      const overrideRecord = overrideRecordResult.rows[0];

      // Format dates (same pattern as other methods)
      if (overrideRecord.created_at instanceof Date) {
        const d = overrideRecord.created_at;
        overrideRecord.created_at = {
          date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
          time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
        };
      }

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'depreciation.overridden',
        resourceType: 'asset',
        resourceId: assetId,
        oldValues: {
          original_amount: overrideResult.original_amount
        },
        newValues: {
          new_amount: overrideResult.new_amount,
          period_month: overrideData.month,
          period_year: overrideData.year,
          reason: overrideData.reason
        },
        metadata: {
          asset_code: overrideRecord.asset_code,
          override_id: overrideResult.override_id
        }
      });

      log.info('Depreciation override applied', {
        businessId,
        userId,
        assetId,
        assetCode: overrideRecord.asset_code,
        period: `${overrideData.month}/${overrideData.year}`,
        original_amount: overrideResult.original_amount,
        new_amount: overrideResult.new_amount,
        override_id: overrideResult.override_id
      });

      await client.query('COMMIT');

      return {
        success: true,
        override: overrideRecord,
        summary: {
          original_amount: overrideResult.original_amount,
          new_amount: overrideResult.new_amount,
          difference: overrideResult.new_amount - overrideResult.original_amount,
          message: overrideResult.message
        }
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error overriding depreciation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get depreciation overrides for an asset
   */
  static async getDepreciationOverrides(businessId, assetIdentifier, filters = {}) {
    const client = await getClient();

    try {
      // Check if assetIdentifier is UUID or asset_code
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let assetId = assetIdentifier;

      if (!uuidRegex.test(assetIdentifier)) {
        // It's an asset_code, look up the UUID
        const codeResult = await client.query(
          'SELECT id FROM assets WHERE business_id = $1 AND asset_code = $2',
          [businessId, assetIdentifier]
        );

        if (codeResult.rows.length === 0) {
          throw new Error(`Asset with code ${assetIdentifier} not found`);
        }

        assetId = codeResult.rows[0].id;
      }

      let query = `
        SELECT dpo.*,
               a.asset_code,
               a.asset_name,
               u.email as created_by_email,
               u2.email as approved_by_email,
               ad.depreciation_amount as current_depreciation_amount
        FROM depreciation_overrides dpo
        JOIN assets a ON dpo.asset_id = a.id
        JOIN users u ON dpo.created_by = u.id
        LEFT JOIN users u2 ON dpo.approved_by = u2.id
        LEFT JOIN asset_depreciations ad ON dpo.asset_id = ad.asset_id
          AND dpo.period_month = ad.period_month
          AND dpo.period_year = ad.period_year
        WHERE dpo.business_id = $1 AND dpo.asset_id = $2
      `;

      const params = [businessId, assetId];
      let paramCount = 2;

      if (filters.start_date) {
        paramCount++;
        query += ` AND dpo.created_at >= $${paramCount}`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        paramCount++;
        query += ` AND dpo.created_at <= $${paramCount}`;
        params.push(filters.end_date);
      }

      query += ' ORDER BY dpo.period_year DESC, dpo.period_month DESC, dpo.created_at DESC';

      const result = await client.query(query, params);

      // Format dates (same pattern as other methods)
      const formattedOverrides = result.rows.map(override => {
        const formatted = { ...override };

        // Format created_at
        if (formatted.created_at instanceof Date) {
          const d = formatted.created_at;
          formatted.created_at = {
            date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
            time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
          };
        }

        return formatted;
      });

      return formattedOverrides;

    } catch (error) {
      log.error('Error fetching depreciation overrides:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
