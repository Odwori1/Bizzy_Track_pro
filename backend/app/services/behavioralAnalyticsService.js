import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';

export class BehavioralAnalyticsService {

  // Record customer behavior event
  static async recordCustomerBehavior(businessId, eventData, userId) {
    const client = await getClient();
    try {
      const query = `
        INSERT INTO customer_behavior_events (
          business_id, customer_id, event_type, event_data,
          revenue_impact, session_id, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const values = [
        businessId,
        eventData.customer_id,
        eventData.event_type,
        JSON.stringify(eventData.event_data || {}),
        eventData.revenue_impact || 0,
        eventData.session_id || null,
        eventData.ip_address || null,
        eventData.user_agent || null
      ];

      const result = await client.query(query, values);
      return result.rows[0];

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Calculate customer lifetime value
  static async calculateCustomerLTV(businessId, customerId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Get customer order history
      const orderHistoryQuery = `
        SELECT 
          COUNT(*) as total_orders,
          COALESCE(SUM(final_price), 0) as total_revenue,
          COALESCE(AVG(final_price), 0) as avg_order_value,
          MIN(created_at) as first_order_date,
          MAX(created_at) as last_order_date
        FROM jobs 
        WHERE business_id = $1 
          AND customer_id = $2 
          AND status = 'completed'
      `;

      const orderResult = await client.query(orderHistoryQuery, [businessId, customerId]);
      const orderData = orderResult.rows[0];

      // Calculate metrics
      const totalRevenue = parseFloat(orderData.total_revenue);
      const totalOrders = parseInt(orderData.total_orders);
      const avgOrderValue = parseFloat(orderData.avg_order_value);
      
      const firstOrderDate = orderData.first_order_date;
      const lastOrderDate = orderData.last_order_date;
      
      let customerLifespanDays = 0;
      if (firstOrderDate && lastOrderDate) {
        customerLifespanDays = Math.ceil((new Date(lastOrderDate) - new Date(firstOrderDate)) / (1000 * 60 * 60 * 24));
      }

      const purchaseFrequency = customerLifespanDays > 0 ? (totalOrders / customerLifespanDays) * 30 : 0; // per month
      const predictedLTV = avgOrderValue * purchaseFrequency * 12; // Annual projection

      // Determine segment
      let segment = 'low_value';
      if (predictedLTV > 1000) segment = 'high_value';
      else if (predictedLTV > 500) segment = 'medium_value';

      // Insert LTV calculation
      const ltvQuery = `
        INSERT INTO customer_lifetime_values (
          business_id, customer_id, calculation_date,
          total_revenue, total_orders, avg_order_value,
          purchase_frequency, customer_lifespan_days, predicted_ltv, segment
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (business_id, customer_id, calculation_date) 
        DO UPDATE SET
          total_revenue = EXCLUDED.total_revenue,
          total_orders = EXCLUDED.total_orders,
          avg_order_value = EXCLUDED.avg_order_value,
          purchase_frequency = EXCLUDED.purchase_frequency,
          customer_lifespan_days = EXCLUDED.customer_lifespan_days,
          predicted_ltv = EXCLUDED.predicted_ltv,
          segment = EXCLUDED.segment
        RETURNING *
      `;

      const ltvValues = [
        businessId,
        customerId,
        new Date().toISOString().split('T')[0], // Today's date
        totalRevenue,
        totalOrders,
        avgOrderValue,
        purchaseFrequency,
        customerLifespanDays,
        predictedLTV,
        segment
      ];

      const ltvResult = await client.query(ltvQuery, ltvValues);
      const ltvData = ltvResult.rows[0];

      await client.query('COMMIT');
      return ltvData;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get customer behavior insights
  static async getCustomerInsights(businessId, period = '30 days') {
    const client = await getClient();
    try {
      // Customer engagement by event type
      const engagementQuery = `
        SELECT 
          event_type,
          COUNT(*) as event_count,
          COUNT(DISTINCT customer_id) as unique_customers,
          COALESCE(SUM(revenue_impact), 0) as total_revenue_impact
        FROM customer_behavior_events 
        WHERE business_id = $1 
          AND created_at >= NOW() - ($2 || ' days')::INTERVAL
        GROUP BY event_type
        ORDER BY event_count DESC
      `;

      const engagementResult = await client.query(engagementQuery, [businessId, period]);
      const engagement = engagementResult.rows;

      // Customer retention analysis
      const retentionQuery = `
        WITH customer_activity AS (
          SELECT 
            customer_id,
            DATE_TRUNC('month', created_at) as activity_month,
            COUNT(*) as monthly_events
          FROM customer_behavior_events 
          WHERE business_id = $1 
            AND created_at >= NOW() - ($2 || ' days')::INTERVAL
          GROUP BY customer_id, DATE_TRUNC('month', created_at)
        )
        SELECT 
          activity_month,
          COUNT(DISTINCT customer_id) as active_customers,
          AVG(monthly_events) as avg_events_per_customer
        FROM customer_activity
        GROUP BY activity_month
        ORDER BY activity_month ASC
      `;

      const retentionResult = await client.query(retentionQuery, [businessId, period]);
      const retention = retentionResult.rows;

      // Top customers by engagement
      const topCustomersQuery = `
        SELECT 
          cbe.customer_id,
          c.first_name,
          c.last_name,
          COUNT(cbe.id) as total_events,
          COALESCE(SUM(cbe.revenue_impact), 0) as total_revenue_impact
        FROM customer_behavior_events cbe
        INNER JOIN customers c ON cbe.customer_id = c.id
        WHERE cbe.business_id = $1 
          AND cbe.created_at >= NOW() - ($2 || ' days')::INTERVAL
        GROUP BY cbe.customer_id, c.first_name, c.last_name
        ORDER BY total_events DESC
        LIMIT 10
      `;

      const topCustomersResult = await client.query(topCustomersQuery, [businessId, period]);
      const topCustomers = topCustomersResult.rows;

      return {
        engagement_by_event_type: engagement,
        retention_analysis: retention,
        top_engaged_customers: topCustomers,
        summary: {
          total_events: engagement.reduce((sum, event) => sum + parseInt(event.event_count), 0),
          unique_customers: engagement.reduce((sum, event) => sum + parseInt(event.unique_customers), 0),
          total_revenue_impact: engagement.reduce((sum, event) => sum + parseFloat(event.total_revenue_impact), 0)
        }
      };

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get customer LTV analysis
  static async getCustomerLTVAnalysis(businessId) {
    const client = await getClient();
    try {
      const query = `
        SELECT 
          segment,
          COUNT(*) as customer_count,
          AVG(predicted_ltv) as avg_ltv,
          AVG(total_revenue) as avg_actual_revenue,
          AVG(purchase_frequency) as avg_purchase_frequency
        FROM customer_lifetime_values 
        WHERE business_id = $1 
          AND calculation_date = CURRENT_DATE
        GROUP BY segment
        ORDER BY avg_ltv DESC
      `;

      const result = await client.query(query, [businessId]);
      return result.rows;

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
}
