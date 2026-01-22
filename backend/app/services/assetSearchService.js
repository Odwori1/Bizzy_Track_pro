import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';

export class AssetSearchService {
  /**
   * Advanced asset search with filters
   */
  static async searchAssets(businessId, filters = {}) {
    const client = await getClient();
    
    try {
      let query = `
        SELECT 
          a.*,
          d.name as department_name,
          s.name as supplier_name,
          COUNT(ad.id) as depreciation_count,
          COALESCE(SUM(ad.depreciation_amount), 0) as total_depreciation
        FROM assets a
        LEFT JOIN departments d ON a.department_id = d.id
        LEFT JOIN suppliers s ON a.supplier_id = s.id
        LEFT JOIN asset_depreciations ad ON a.id = ad.asset_id
        WHERE a.business_id = $1
      `;
      
      const params = [businessId];
      let paramCount = 1;
      const conditions = [];

      // Text search
      if (filters.search_text) {
        paramCount++;
        conditions.push(`(
          a.asset_code ILIKE '%' || $${paramCount} || '%' OR
          a.asset_name ILIKE '%' || $${paramCount} || '%' OR
          a.serial_number ILIKE '%' || $${paramCount} || '%' OR
          a.model ILIKE '%' || $${paramCount} || '%' OR
          a.manufacturer ILIKE '%' || $${paramCount} || '%' OR
          a.location ILIKE '%' || $${paramCount} || '%'
        )`);
        params.push(filters.search_text);
      }

      // Category filter
      if (filters.category) {
        paramCount++;
        conditions.push(`a.category = $${paramCount}`);
        params.push(filters.category);
      }

      // Value range filters
      if (filters.min_value) {
        paramCount++;
        conditions.push(`a.current_book_value >= $${paramCount}`);
        params.push(parseFloat(filters.min_value));
      }

      if (filters.max_value) {
        paramCount++;
        conditions.push(`a.current_book_value <= $${paramCount}`);
        params.push(parseFloat(filters.max_value));
      }

      // Department filter
      if (filters.department_id) {
        paramCount++;
        conditions.push(`a.department_id = $${paramCount}`);
        params.push(filters.department_id);
      }

      // Status filter
      if (filters.status) {
        paramCount++;
        conditions.push(`a.status = $${paramCount}`);
        params.push(filters.status);
      }

      // Depreciation method filter
      if (filters.depreciation_method) {
        paramCount++;
        conditions.push(`a.depreciation_method = $${paramCount}`);
        params.push(filters.depreciation_method);
      }

      // Acquisition method filter
      if (filters.acquisition_method) {
        paramCount++;
        conditions.push(`a.acquisition_method = $${paramCount}`);
        params.push(filters.acquisition_method);
      }

      // Is existing asset filter
      if (filters.is_existing_asset !== undefined) {
        paramCount++;
        conditions.push(`a.is_existing_asset = $${paramCount}`);
        params.push(filters.is_existing_asset);
      }

      // Condition status filter
      if (filters.condition_status) {
        paramCount++;
        conditions.push(`a.condition_status = $${paramCount}`);
        params.push(filters.condition_status);
      }

      // Is active filter
      if (filters.is_active !== undefined) {
        paramCount++;
        conditions.push(`a.is_active = $${paramCount}`);
        params.push(filters.is_active);
      }

      // Date range filters
      if (filters.purchase_date_from) {
        paramCount++;
        conditions.push(`a.purchase_date >= $${paramCount}`);
        params.push(filters.purchase_date_from);
      }

      if (filters.purchase_date_to) {
        paramCount++;
        conditions.push(`a.purchase_date <= $${paramCount}`);
        params.push(filters.purchase_date_to);
      }

      // Add conditions
      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
      }

      // Group by
      query += ' GROUP BY a.id, d.name, s.name';

      // Sorting
      if (filters.sort_by) {
        const order = filters.sort_order === 'desc' ? 'DESC' : 'ASC';
        query += ` ORDER BY a.${filters.sort_by} ${order}`;
      } else {
        query += ' ORDER BY a.asset_code';
      }

      // Pagination
      const limit = parseInt(filters.limit) || 50;
      const offset = parseInt(filters.offset) || 0;
      
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(limit);

      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(offset);

      const result = await client.query(query, params);

      // Get total count for pagination
      const totalQuery = `
        SELECT COUNT(*) as total 
        FROM assets a
        WHERE a.business_id = $1
        ${conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : ''}
      `;

      const totalParams = [businessId];
      if (conditions.length > 0) {
        // Remove pagination params for count query
        const countParams = params.slice(1, -2); // Remove businessId, limit, offset
        totalParams.push(...countParams);
      }

      const totalResult = await client.query(totalQuery, totalParams);
      const total = parseInt(totalResult.rows[0].total);

      return {
        data: result.rows,
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + result.rows.length < total
        }
      };

    } catch (error) {
      log.error('Error searching assets:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get search options and filters
   */
  static async getSearchOptions(businessId) {
    const client = await getClient();
    
    try {
      // Get distinct categories
      const categoriesResult = await client.query(
        `SELECT DISTINCT category, COUNT(*) as count 
         FROM assets 
         WHERE business_id = $1 AND category IS NOT NULL 
         GROUP BY category 
         ORDER BY category`,
        [businessId]
      );

      // Get distinct depreciation methods
      const methodsResult = await client.query(
        `SELECT DISTINCT depreciation_method, COUNT(*) as count 
         FROM assets 
         WHERE business_id = $1 AND depreciation_method IS NOT NULL 
         GROUP BY depreciation_method 
         ORDER BY depreciation_method`,
        [businessId]
      );

      // Get departments
      const departmentsResult = await client.query(
        `SELECT d.id, d.name, COUNT(a.id) as asset_count 
         FROM departments d
         LEFT JOIN assets a ON d.id = a.department_id AND a.business_id = d.business_id
         WHERE d.business_id = $1 AND d.is_active = true 
         GROUP BY d.id, d.name
         ORDER BY d.name`,
        [businessId]
      );

      // Get value ranges
      const rangesResult = await client.query(
        `SELECT 
           MIN(purchase_cost) as min_cost,
           MAX(purchase_cost) as max_cost,
           MIN(current_book_value) as min_value,
           MAX(current_book_value) as max_value,
           MIN(purchase_date) as oldest_purchase,
           MAX(purchase_date) as newest_purchase
         FROM assets 
         WHERE business_id = $1`,
        [businessId]
      );

      // Get status distribution
      const statusResult = await client.query(
        `SELECT status, COUNT(*) as count 
         FROM assets 
         WHERE business_id = $1 
         GROUP BY status 
         ORDER BY status`,
        [businessId]
      );

      // Get acquisition method distribution
      const acquisitionResult = await client.query(
        `SELECT acquisition_method, COUNT(*) as count 
         FROM assets 
         WHERE business_id = $1 
         GROUP BY acquisition_method 
         ORDER BY acquisition_method`,
        [businessId]
      );

      return {
        categories: categoriesResult.rows,
        depreciation_methods: methodsResult.rows,
        departments: departmentsResult.rows,
        value_ranges: rangesResult.rows[0] || {},
        status_distribution: statusResult.rows,
        acquisition_methods: acquisitionResult.rows,
        sort_options: [
          { value: 'asset_code', label: 'Asset Code' },
          { value: 'asset_name', label: 'Asset Name' },
          { value: 'purchase_date', label: 'Purchase Date' },
          { value: 'purchase_cost', label: 'Purchase Cost' },
          { value: 'current_book_value', label: 'Current Value' },
          { value: 'created_at', label: 'Created Date' }
        ],
        status_options: ['active', 'inactive', 'disposed', 'sold', 'scrapped', 'under_maintenance', 'idle'],
        condition_options: ['excellent', 'good', 'fair', 'poor', 'broken']
      };

    } catch (error) {
      log.error('Error getting search options:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Quick search for autocomplete
   */
  static async quickSearch(businessId, query, limit = 10) {
    const client = await getClient();
    
    try {
      const result = await client.query(
        `SELECT 
          id, asset_code, asset_name, category, 
          current_book_value, status, location
         FROM assets 
         WHERE business_id = $1 AND (
           asset_code ILIKE $2 OR
           asset_name ILIKE $2 OR
           serial_number ILIKE $2
         )
         ORDER BY 
           CASE 
             WHEN asset_code ILIKE $2 THEN 1
             WHEN asset_name ILIKE $2 THEN 2
             ELSE 3
           END,
           asset_code
         LIMIT $3`,
        [businessId, `%${query}%`, limit]
      );

      return result.rows;

    } catch (error) {
      log.error('Error in quick search:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
