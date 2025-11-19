import { query, getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class EquipmentHireService {
  /**
   * Create equipment asset (link to fixed asset)
   */
  static async createEquipmentAsset(businessId, equipmentData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO equipment_assets (
          business_id, asset_id, hire_rate_per_day, hire_rate_per_week, hire_rate_per_month,
          minimum_hire_period, deposit_amount, is_available, is_hireable,
          current_location, specifications, photos, condition_notes, operational_instructions,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
          businessId,
          equipmentData.asset_id,
          equipmentData.hire_rate_per_day,
          equipmentData.hire_rate_per_week || null,
          equipmentData.hire_rate_per_month || null,
          equipmentData.minimum_hire_period || 1,
          equipmentData.deposit_amount || 0,
          equipmentData.is_available !== false,
          equipmentData.is_hireable !== false,
          equipmentData.current_location || '',
          equipmentData.specifications ? JSON.stringify(equipmentData.specifications) : null,
          equipmentData.photos ? JSON.stringify(equipmentData.photos) : null,
          equipmentData.condition_notes || '',
          equipmentData.operational_instructions || '',
          userId
        ]
      );

      const equipment = result.rows[0];

      // Log equipment creation
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'equipment.created',
        resourceType: 'equipment',
        resourceId: equipment.id,
        newValues: {
          asset_id: equipmentData.asset_id,
          hire_rate_per_day: equipmentData.hire_rate_per_day
        }
      });

      log.info('Equipment asset created', {
        businessId,
        userId,
        equipmentId: equipment.id,
        assetId: equipmentData.asset_id
      });

      await client.query('COMMIT');
      return equipment;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create equipment hire booking
   */
  static async createHireBooking(businessId, bookingData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Generate booking number
      const bookingNumber = await this.generateNextBookingNumber(client, businessId);

      // Calculate total amount based on hire period
      const totalAmount = await this.calculateHireAmount(
        bookingData.equipment_asset_id,
        bookingData.hire_start_date,
        bookingData.hire_end_date,
        bookingData.hire_rate
      );

      const result = await client.query(
        `INSERT INTO equipment_hire_bookings (
          business_id, booking_number, equipment_asset_id, customer_id, job_id,
          hire_start_date, hire_end_date, hire_rate, total_amount, deposit_paid,
          pre_hire_condition, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          businessId,
          bookingNumber,
          bookingData.equipment_asset_id,
          bookingData.customer_id,
          bookingData.job_id,
          bookingData.hire_start_date,
          bookingData.hire_end_date,
          bookingData.hire_rate,
          totalAmount,
          bookingData.deposit_paid || 0,
          bookingData.pre_hire_condition || '',
          userId
        ]
      );

      const booking = result.rows[0];

      // Update equipment availability
      await client.query(
        'UPDATE equipment_assets SET is_available = false WHERE id = $1',
        [bookingData.equipment_asset_id]
      );

      // Log booking creation
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'equipment_hire.created',
        resourceType: 'equipment_hire',
        resourceId: booking.id,
        newValues: {
          booking_number: bookingNumber,
          equipment_asset_id: bookingData.equipment_asset_id,
          total_amount: totalAmount
        }
      });

      log.info('Equipment hire booking created', {
        businessId,
        userId,
        bookingId: booking.id,
        bookingNumber,
        totalAmount
      });

      await client.query('COMMIT');
      return booking;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate next booking number (HIRE-001, HIRE-002, etc.)
   */
  static async generateNextBookingNumber(client, businessId) {
    const result = await client.query(
      `SELECT booking_number FROM equipment_hire_bookings
       WHERE business_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [businessId]
    );

    if (result.rows.length === 0) {
      return 'HIRE-001';
    }

    const lastNumber = result.rows[0].booking_number;
    const match = lastNumber.match(/HIRE-(\d+)/);

    if (match) {
      const nextNumber = parseInt(match[1]) + 1;
      return `HIRE-${nextNumber.toString().padStart(3, '0')}`;
    }

    return 'HIRE-001';
  }

  /**
   * Calculate hire amount based on period and rate
   */
  static async calculateHireAmount(equipmentAssetId, startDate, endDate, customRate = null) {
    const client = await getClient();
    try {
      const equipment = await client.query(
        'SELECT hire_rate_per_day FROM equipment_assets WHERE id = $1',
        [equipmentAssetId]
      );

      if (!equipment.rows[0]) {
        throw new Error('Equipment asset not found');
      }

      const dailyRate = customRate || equipment.rows[0].hire_rate_per_day;

      // Calculate days between dates
      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

      return dailyRate * days;
    } finally {
      client.release();
    }
  }

  /**
   * Get available equipment for hire
   */
  static async getAvailableEquipment(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT ea.*, fa.asset_name, fa.asset_code, fa.condition_status
         FROM equipment_assets ea
         JOIN fixed_assets fa ON ea.asset_id = fa.id
         WHERE ea.business_id = $1
           AND ea.is_available = true
           AND ea.is_hireable = true
           AND fa.is_active = true
         ORDER BY fa.asset_name`,
        [businessId]
      );
      return result.rows;
    } catch (error) {
      log.error('Error fetching available equipment:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all equipment assets
   */
  static async getAllEquipment(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT ea.*, fa.asset_name, fa.asset_code, fa.condition_status, fa.current_value
         FROM equipment_assets ea
         JOIN fixed_assets fa ON ea.asset_id = fa.id
         WHERE ea.business_id = $1
         ORDER BY fa.asset_name`,
        [businessId]
      );
      return result.rows;
    } catch (error) {
      log.error('Error fetching equipment:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get hire bookings
   */
  static async getHireBookings(businessId, status = null) {
    const client = await getClient();
    try {
      let queryStr = `
        SELECT ehb.*,
               ea.asset_id,
               fa.asset_name,
               fa.asset_code,
               c.first_name || ' ' || c.last_name as customer_name,
               j.job_number
        FROM equipment_hire_bookings ehb
        JOIN equipment_assets ea ON ehb.equipment_asset_id = ea.id
        JOIN fixed_assets fa ON ea.asset_id = fa.id
        LEFT JOIN customers c ON ehb.customer_id = c.id
        LEFT JOIN jobs j ON ehb.job_id = j.id
        WHERE ehb.business_id = $1
      `;

      const params = [businessId];

      if (status) {
        queryStr += ` AND ehb.status = $2`;
        params.push(status);
      }

      queryStr += ` ORDER BY ehb.created_at DESC`;

      const result = await client.query(queryStr, params);
      return result.rows;
    } catch (error) {
      log.error('Error fetching hire bookings:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get hire statistics
   */
  static async getHireStatistics(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT
           COUNT(*) as total_bookings,
           COUNT(*) FILTER (WHERE status = 'active') as active_bookings,
           COUNT(*) FILTER (WHERE status = 'completed') as completed_bookings,
           COUNT(*) FILTER (WHERE status = 'reserved') as reserved_bookings,
           SUM(total_amount) as total_revenue,
           AVG(total_amount) as avg_booking_value,
           COUNT(*) FILTER (WHERE actual_return_date IS NULL AND hire_end_date < CURRENT_DATE) as overdue_bookings
         FROM equipment_hire_bookings
         WHERE business_id = $1`,
        [businessId]
      );

      return result.rows[0];
    } catch (error) {
      log.error('Error fetching hire statistics:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
