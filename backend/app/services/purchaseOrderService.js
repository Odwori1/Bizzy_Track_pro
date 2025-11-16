import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class PurchaseOrderService {
  /**
   * Generate unique PO number
   */
  static async generatePONumber(businessId) {
    const client = await getClient();
    
    try {
      // Get business prefix
      const businessResult = await client.query(
        'SELECT name FROM businesses WHERE id = $1',
        [businessId]
      );
      
      let prefix = 'PO';
      if (businessResult.rows.length > 0) {
        prefix = businessResult.rows[0].name.substring(0, 3).toUpperCase();
      }
      
      // Get next sequence
      const sequenceResult = await client.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM '[0-9]+$') AS INTEGER)), 0) + 1 as next_sequence
         FROM purchase_orders 
         WHERE business_id = $1 AND po_number ~ ('^' || $2 || '-[0-9]+$')`,
        [businessId, prefix]
      );
      
      const nextSequence = sequenceResult.rows[0].next_sequence;
      return `${prefix}-${String(nextSequence).padStart(6, '0')}`;
    } finally {
      client.release();
    }
  }

  /**
   * Create a new purchase order
   */
  static async createPurchaseOrder(businessId, orderData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify supplier belongs to business
      const supplierCheck = await client.query(
        'SELECT id FROM suppliers WHERE id = $1 AND business_id = $2',
        [orderData.supplier_id, businessId]
      );

      if (supplierCheck.rows.length === 0) {
        throw new Error('Supplier not found or access denied');
      }

      // Generate PO number
      const poNumber = await this.generatePONumber(businessId);

      // Calculate total amount
      const totalAmount = orderData.items.reduce((sum, item) => sum + parseFloat(item.total_cost), 0);

      // Insert purchase order
      const orderResult = await client.query(
        `INSERT INTO purchase_orders (
          business_id, supplier_id, po_number, order_date, 
          expected_delivery_date, total_amount, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          businessId,
          orderData.supplier_id,
          poNumber,
          orderData.order_date,
          orderData.expected_delivery_date || null,
          totalAmount,
          orderData.notes || '',
          userId
        ]
      );

      const purchaseOrder = orderResult.rows[0];

      // Insert purchase order items
      for (const item of orderData.items) {
        await client.query(
          `INSERT INTO purchase_order_items (
            business_id, purchase_order_id, product_id, inventory_item_id,
            item_name, quantity, unit_cost, total_cost
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            businessId,
            purchaseOrder.id,
            item.product_id || null,
            item.inventory_item_id || null,
            item.item_name,
            item.quantity,
            item.unit_cost,
            item.total_cost
          ]
        );
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'purchase_order.created',
        resourceType: 'purchase_order',
        resourceId: purchaseOrder.id,
        newValues: {
          po_number: purchaseOrder.po_number,
          supplier_id: purchaseOrder.supplier_id,
          total_amount: purchaseOrder.total_amount
        }
      });

      await client.query('COMMIT');

      // Get complete purchase order with items
      const completeOrder = await this.getPurchaseOrderById(businessId, purchaseOrder.id);
      return completeOrder;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all purchase orders with optional filters
   */
  static async getPurchaseOrders(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT 
          po.*,
          s.name as supplier_name,
          s.contact_person as supplier_contact,
          COUNT(poi.id) as item_count,
          SUM(poi.received_quantity) as total_received
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
        WHERE po.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.supplier_id) {
        paramCount++;
        queryStr += ` AND po.supplier_id = $${paramCount}`;
        params.push(filters.supplier_id);
      }

      if (filters.status) {
        paramCount++;
        queryStr += ` AND po.status = $${paramCount}`;
        params.push(filters.status);
      }

      if (filters.start_date && filters.end_date) {
        paramCount++;
        queryStr += ` AND po.order_date BETWEEN $${paramCount}`;
        params.push(filters.start_date);

        paramCount++;
        queryStr += ` AND $${paramCount}`;
        params.push(filters.end_date);
      }

      queryStr += ' GROUP BY po.id, s.name, s.contact_person ORDER BY po.order_date DESC';

      if (filters.page && filters.limit) {
        const offset = (filters.page - 1) * filters.limit;
        paramCount++;
        queryStr += ` LIMIT $${paramCount}`;
        params.push(filters.limit);

        paramCount++;
        queryStr += ` OFFSET $${paramCount}`;
        params.push(offset);
      }

      const result = await client.query(queryStr, params);
      return result.rows;
    } catch (error) {
      log.error('Purchase orders query failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get purchase order by ID with items
   */
  static async getPurchaseOrderById(businessId, orderId) {
    const client = await getClient();

    try {
      // Get order details
      const orderQuery = `
        SELECT 
          po.*,
          s.name as supplier_name,
          s.contact_person as supplier_contact,
          s.email as supplier_email,
          s.phone as supplier_phone
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        WHERE po.business_id = $1 AND po.id = $2
      `;

      const orderResult = await client.query(orderQuery, [businessId, orderId]);

      if (orderResult.rows.length === 0) {
        throw new Error('Purchase order not found or access denied');
      }

      const purchaseOrder = orderResult.rows[0];

      // Get order items
      const itemsQuery = `
        SELECT 
          poi.*,
          p.name as product_name,
          ii.name as inventory_item_name
        FROM purchase_order_items poi
        LEFT JOIN products p ON poi.product_id = p.id
        LEFT JOIN inventory_items ii ON poi.inventory_item_id = ii.id
        WHERE poi.business_id = $1 AND poi.purchase_order_id = $2
        ORDER BY poi.created_at
      `;

      const itemsResult = await client.query(itemsQuery, [businessId, orderId]);
      purchaseOrder.items = itemsResult.rows;

      return purchaseOrder;
    } catch (error) {
      log.error('Purchase order query failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ... additional methods for update, receive, etc.
}
