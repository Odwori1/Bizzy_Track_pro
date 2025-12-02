import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class EquipmentHireService {
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

      // Update equipment availability - mark as not available
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
   * Get hire booking by ID
   */
  static async getHireBookingById(businessId, bookingId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT ehb.*,
                ea.id as equipment_asset_id,
                ea.asset_id,
                fa.asset_name,
                fa.asset_code,
                c.first_name || ' ' || c.last_name as customer_name,
                c.email as customer_email,
                c.phone as customer_phone,
                j.job_number
         FROM equipment_hire_bookings ehb
         JOIN equipment_assets ea ON ehb.equipment_asset_id = ea.id
         JOIN fixed_assets fa ON ea.asset_id = fa.id
         LEFT JOIN customers c ON ehb.customer_id = c.id
         LEFT JOIN jobs j ON ehb.job_id = j.id
         WHERE ehb.id = $1 AND ehb.business_id = $2`,
        [bookingId, businessId]
      );

      if (result.rows.length === 0) {
        throw new Error('Booking not found');
      }

      return result.rows[0];
    } catch (error) {
      log.error('Error fetching hire booking by ID:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update hire booking with constraint handling
   */
  static async updateHireBooking(businessId, bookingId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get current booking
      const currentBooking = await client.query(
        'SELECT * FROM equipment_hire_bookings WHERE id = $1 AND business_id = $2',
        [bookingId, businessId]
      );

      if (currentBooking.rows.length === 0) {
        throw new Error('Booking not found');
      }

      const oldValues = { ...currentBooking.rows[0] };

      // Build update query dynamically
      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;

      const allowedFields = [
        'status', 'hire_start_date', 'hire_end_date', 'hire_rate', 'deposit_paid',
        'pre_hire_condition', 'post_hire_condition', 'actual_return_date',
        'damage_notes', 'damage_charges', 'deposit_returned', 'final_amount'
      ];

      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          updateFields.push(`${field} = $${paramCount}`);

          // Handle date formatting and constraint requirements
          if (['hire_start_date', 'hire_end_date', 'actual_return_date'].includes(field) && updateData[field]) {
            const date = new Date(updateData[field]);
            if (isNaN(date.getTime())) {
              throw new Error(`Invalid date format for ${field}: ${updateData[field]}`);
            }

            // For actual_return_date, ensure it's not before hire_start_date (constraint requirement)
            if (field === 'actual_return_date') {
              const hireStartDate = new Date(currentBooking.rows[0].hire_start_date);
              if (date < hireStartDate) {
                log.warn('Actual return date is before hire start date, using hire start date instead', {
                  actualReturnDate: date,
                  hireStartDate: hireStartDate
                });
                // Use hire start date to satisfy constraint
                updateValues.push(hireStartDate.toISOString());
              } else {
                updateValues.push(date.toISOString());
              }
            } else {
              updateValues.push(date.toISOString());
            }
          } else {
            updateValues.push(updateData[field]);
          }
          paramCount++;
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      // Add updated_at and WHERE clause parameters
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(bookingId, businessId);

      const result = await client.query(
        `UPDATE equipment_hire_bookings
         SET ${updateFields.join(', ')}
         WHERE id = $${paramCount} AND business_id = $${paramCount + 1}
         RETURNING *`,
        updateValues
      );

      const updatedBooking = result.rows[0];

      // Handle equipment availability for returns and cancellations
      if (updateData.status === 'completed' || updateData.status === 'cancelled') {
        await client.query(
          'UPDATE equipment_assets SET is_available = true WHERE id = $1',
          [updatedBooking.equipment_asset_id]
        );

        log.info('Equipment marked as available', {
          equipmentAssetId: updatedBooking.equipment_asset_id,
          status: updateData.status
        });
      }

      // Log update
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'equipment_hire.updated',
        resourceType: 'equipment_hire',
        resourceId: bookingId,
        oldValues,
        newValues: updateData
      });

      log.info('Equipment hire booking updated', {
        businessId,
        userId,
        bookingId,
        updatedFields: Object.keys(updateData)
      });

      await client.query('COMMIT');
      return updatedBooking;
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Database error in updateHireBooking:', error);
      throw new Error(`Failed to update booking: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Delete hire booking
   */
  static async deleteHireBooking(businessId, bookingId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get booking details for logging and equipment availability update
      const booking = await client.query(
        'SELECT * FROM equipment_hire_bookings WHERE id = $1 AND business_id = $2',
        [bookingId, businessId]
      );

      if (booking.rows.length === 0) {
        throw new Error('Booking not found');
      }

      const bookingData = booking.rows[0];

      // Make equipment available again
      await client.query(
        'UPDATE equipment_assets SET is_available = true WHERE id = $1',
        [bookingData.equipment_asset_id]
      );

      // Delete the booking
      await client.query(
        'DELETE FROM equipment_hire_bookings WHERE id = $1 AND business_id = $2',
        [bookingId, businessId]
      );

      // Log deletion
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'equipment_hire.deleted',
        resourceType: 'equipment_hire',
        resourceId: bookingId,
        oldValues: bookingData
      });

      log.info('Equipment hire booking deleted', {
        businessId,
        userId,
        bookingId,
        equipmentAssetId: bookingData.equipment_asset_id
      });

      await client.query('COMMIT');
      return { success: true, message: 'Booking deleted successfully' };
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
      console.log('Calculating hire amount for equipment asset ID:', equipmentAssetId);
      
      const equipment = await client.query(
        'SELECT hire_rate_per_day FROM equipment_assets WHERE id = $1',
        [equipmentAssetId]
      );

      if (!equipment.rows[0]) {
        // Log detailed error for debugging
        const allEquipment = await client.query(
          'SELECT id, asset_id FROM equipment_assets LIMIT 10'
        );
        console.error('Equipment not found. Available equipment:', allEquipment.rows);
        throw new Error(`Equipment asset not found for ID: ${equipmentAssetId}`);
      }

      const dailyRate = customRate || equipment.rows[0].hire_rate_per_day;
      console.log('Daily rate:', dailyRate);

      // Calculate days between dates
      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      console.log('Hire period days:', days);

      const total = dailyRate * days;
      console.log('Total amount:', total);

      return total;
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
        `SELECT ea.*, fa.asset_name, fa.asset_code, fa.condition_status, fa.current_value
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
           AND ea.is_hireable = true
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
   * Get hire bookings with optional status filter
   */
  static async getHireBookings(businessId, status = null) {
    const client = await getClient();
    try {
      let queryStr = `
        SELECT ehb.*,
               ea.id as equipment_asset_id,
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
   * Get active hire bookings (not completed)
   */
  static async getActiveHireBookings(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT ehb.*,
                ea.id as equipment_asset_id,
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
           AND ehb.status != 'completed'
         ORDER BY ehb.created_at DESC`,
        [businessId]
      );
      return result.rows;
    } catch (error) {
      log.error('Error fetching active hire bookings:', error);
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
