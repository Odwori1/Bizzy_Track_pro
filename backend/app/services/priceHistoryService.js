import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';

export class PriceHistoryService {
  static async getPriceHistoryByEntity(businessId, entityType, entityId, options = {}) {
    const client = await getClient();
    try {
      let queryStr = `
        SELECT 
          ph.*,
          u.email as changed_by_email,
          u.full_name as changed_by_name
        FROM price_history ph
        LEFT JOIN users u ON ph.changed_by = u.id
        WHERE ph.business_id = $1 
          AND ph.entity_type = $2 
          AND ph.entity_id = $3
      `;
      
      const params = [businessId, entityType, entityId];
      let paramCount = 4;

      if (options.change_type) {
        queryStr += ` AND ph.change_type = $${paramCount}`;
        params.push(options.change_type);
        paramCount++;
      }

      if (options.date_from) {
        queryStr += ` AND ph.created_at >= $${paramCount}`;
        params.push(options.date_from);
        paramCount++;
      }

      if (options.date_to) {
        queryStr += ` AND ph.created_at <= $${paramCount}`;
        params.push(options.date_to);
        paramCount++;
      }

      queryStr += ` ORDER BY ph.created_at DESC`;

      if (options.limit) {
        queryStr += ` LIMIT $${paramCount}`;
        params.push(options.limit);
        paramCount++;
      }

      if (options.offset) {
        queryStr += ` OFFSET $${paramCount}`;
        params.push(options.offset);
        paramCount++;
      }

      const result = await client.query(queryStr, params);
      return result.rows;
    } catch (error) {
      log.error('Error getting price history by entity:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async getPriceHistoryByBusiness(businessId, options = {}) {
    const client = await getClient();
    try {
      // Count query for pagination
      let countQuery = `SELECT COUNT(*) FROM price_history WHERE business_id = $1`;
      let countParams = [businessId];

      // Main query
      let queryStr = `
        SELECT 
          ph.*,
          u.email as changed_by_email,
          u.full_name as changed_by_name
        FROM price_history ph
        LEFT JOIN users u ON ph.changed_by = u.id
        WHERE ph.business_id = $1
      `;
      
      const params = [businessId];
      let paramCount = 2;

      // Apply filters
      if (options.entity_type) {
        queryStr += ` AND ph.entity_type = $${paramCount}`;
        countQuery += ` AND entity_type = $2`;
        params.push(options.entity_type);
        countParams.push(options.entity_type);
        paramCount++;
      }

      if (options.change_type) {
        queryStr += ` AND ph.change_type = $${paramCount}`;
        countQuery += ` AND change_type = $${paramCount}`;
        params.push(options.change_type);
        countParams.push(options.change_type);
        paramCount++;
      }

      if (options.date_from) {
        queryStr += ` AND ph.created_at >= $${paramCount}`;
        countQuery += ` AND created_at >= $${paramCount}`;
        params.push(options.date_from);
        countParams.push(options.date_from);
        paramCount++;
      }

      if (options.date_to) {
        queryStr += ` AND ph.created_at <= $${paramCount}`;
        countQuery += ` AND created_at <= $${paramCount}`;
        params.push(options.date_to);
        countParams.push(options.date_to);
        paramCount++;
      }

      if (options.search) {
        queryStr += ` AND ph.entity_name ILIKE $${paramCount}`;
        countQuery += ` AND entity_name ILIKE $${paramCount}`;
        params.push(`%${options.search}%`);
        countParams.push(`%${options.search}%`);
        paramCount++;
      }

      queryStr += ` ORDER BY ph.created_at DESC`;

      // Apply pagination
      if (options.limit) {
        queryStr += ` LIMIT $${paramCount}`;
        params.push(options.limit);
        paramCount++;
      }

      if (options.offset) {
        queryStr += ` OFFSET $${paramCount}`;
        params.push(options.offset);
        paramCount++;
      }

      // Execute both queries
      const [countResult, dataResult] = await Promise.all([
        client.query(countQuery, countParams),
        client.query(queryStr, params)
      ]);

      return {
        records: dataResult.rows,
        totalCount: parseInt(countResult.rows[0].count)
      };
    } catch (error) {
      log.error('Error getting business price history:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async getPriceHistoryStats(businessId, days = 30) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT
           COUNT(*) as total_changes,
           COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '1 day') as changes_today,
           COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as changes_week,
           COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as changes_month,
           COUNT(*) FILTER (WHERE change_type = 'manual') as manual_changes,
           COUNT(*) FILTER (WHERE change_type = 'bulk_update') as bulk_changes,
           COUNT(*) FILTER (WHERE change_type = 'seasonal') as seasonal_changes,
           COUNT(*) FILTER (WHERE change_type = 'pricing_rule') as rule_changes,
           COUNT(DISTINCT entity_id) as unique_entities_changed,
           AVG(new_price - COALESCE(old_price, new_price)) as avg_price_change,
           MIN(new_price - COALESCE(old_price, new_price)) as min_price_change,
           MAX(new_price - COALESCE(old_price, new_price)) as max_price_change
         FROM price_history
         WHERE business_id = $1
           AND created_at >= CURRENT_DATE - $2 * INTERVAL '1 day'`,
        [businessId, days]
      );

      return result.rows[0];
    } catch (error) {
      log.error('Error getting price history stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async getPriceChangeSummary(businessId, entityType, entityId, days = 365) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT
           -- Current price
           (SELECT new_price FROM price_history 
            WHERE business_id = $1 AND entity_type = $2 AND entity_id = $3
            ORDER BY created_at DESC LIMIT 1) as current_price,
           
           -- Original price
           (SELECT new_price FROM price_history 
            WHERE business_id = $1 AND entity_type = $2 AND entity_id = $3
            ORDER BY created_at ASC LIMIT 1) as original_price,
           
           -- Price change stats
           COUNT(*) as total_changes,
           MIN(new_price) as lowest_price,
           MAX(new_price) as highest_price,
           AVG(new_price) as average_price,
           
           -- Recent changes
           COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as changes_30_days,
           COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '90 days') as changes_90_days,
           
           -- Change type distribution
           COUNT(*) FILTER (WHERE change_type = 'manual') as manual_changes,
           COUNT(*) FILTER (WHERE change_type = 'bulk_update') as bulk_changes,
           COUNT(*) FILTER (WHERE change_type = 'seasonal') as seasonal_changes,
           COUNT(*) FILTER (WHERE change_type = 'pricing_rule') as rule_changes,
           
           -- Last change info
           (SELECT created_at FROM price_history 
            WHERE business_id = $1 AND entity_type = $2 AND entity_id = $3
            ORDER BY created_at DESC LIMIT 1) as last_change_date,
           
           (SELECT change_type FROM price_history 
            WHERE business_id = $1 AND entity_type = $2 AND entity_id = $3
            ORDER BY created_at DESC LIMIT 1) as last_change_type
           
         FROM price_history
         WHERE business_id = $1 AND entity_type = $2 AND entity_id = $3
           AND created_at >= CURRENT_DATE - $4 * INTERVAL '1 day'`,
        [businessId, entityType, entityId, days]
      );

      return result.rows[0];
    } catch (error) {
      log.error('Error getting price change summary:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async exportPriceHistory(businessId, options = {}) {
    const client = await getClient();
    try {
      let queryStr = `
        SELECT 
          ph.entity_type,
          ph.entity_name,
          ph.old_price,
          ph.new_price,
          ph.change_type,
          ph.change_reason,
          ph.effective_from,
          ph.created_at,
          u.email as changed_by_email,
          u.full_name as changed_by_name
        FROM price_history ph
        LEFT JOIN users u ON ph.changed_by = u.id
        WHERE ph.business_id = $1
      `;
      
      const params = [businessId];
      let paramCount = 2;

      if (options.entity_type) {
        queryStr += ` AND ph.entity_type = $${paramCount}`;
        params.push(options.entity_type);
        paramCount++;
      }

      if (options.date_from) {
        queryStr += ` AND ph.created_at >= $${paramCount}`;
        params.push(options.date_from);
        paramCount++;
      }

      if (options.date_to) {
        queryStr += ` AND ph.created_at <= $${paramCount}`;
        params.push(options.date_to);
        paramCount++;
      }

      queryStr += ` ORDER BY ph.created_at DESC`;

      const result = await client.query(queryStr, params);

      if (options.format === 'csv') {
        // Convert to CSV format
        const headers = ['Entity Type', 'Entity Name', 'Old Price', 'New Price', 'Change Type', 'Change Reason', 'Effective From', 'Changed At', 'Changed By Email', 'Changed By Name'];
        const csvRows = result.rows.map(row => [
          row.entity_type,
          `"${row.entity_name.replace(/"/g, '""')}"`,
          row.old_price || '',
          row.new_price,
          row.change_type,
          `"${(row.change_reason || '').replace(/"/g, '""')}"`,
          row.effective_from,
          row.created_at,
          row.changed_by_email,
          row.changed_by_name
        ].join(','));

        return [headers.join(','), ...csvRows].join('\n');
      }

      return result.rows;
    } catch (error) {
      log.error('Error exporting price history:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async logManualPriceChange(businessId, entityType, entityId, entityName, oldPrice, newPrice, changeReason, userId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `INSERT INTO price_history (
          business_id, entity_type, entity_id, entity_name,
          old_price, new_price, change_type, change_reason,
          changed_by, change_source
        ) VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7, $8, 'user')
        RETURNING *`,
        [businessId, entityType, entityId, entityName, oldPrice, newPrice, changeReason, userId]
      );

      log.info('Manual price change logged', {
        businessId,
        userId,
        entityType,
        entityId,
        oldPrice,
        newPrice
      });

      return result.rows[0];
    } catch (error) {
      log.error('Error logging manual price change:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
