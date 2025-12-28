// Save as: backend/app/controllers/unifiedEmployeeController.js
import { UnifiedEmployeeService } from '../services/unifiedEmployeeService.js';
import { log } from '../utils/logger.js';

export class UnifiedEmployeeController {
  /**
   * Get all employees with unified data
   */
  static async getEmployees(req, res) {
    try {
      const { businessId } = req.user;
      const filters = req.query;

      log.info(`Fetching employees for business ${businessId}`, { filters });

      const employees = await UnifiedEmployeeService.getEmployees(businessId, filters);

      res.json({
        success: true,
        data: employees,
        count: employees.length,
        message: 'Employees fetched successfully'
      });
    } catch (error) {
      log.error('Error in UnifiedEmployeeController.getEmployees:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get unified employee by ID
   */
  static async getEmployeeById(req, res) {
    try {
      const { businessId } = req.user;
      const { id } = req.params;

      log.info(`Fetching employee ${id} for business ${businessId}`);

      const employee = await UnifiedEmployeeService.getEmployeeById(businessId, id);

      if (!employee) {
        return res.status(404).json({
          success: false,
          error: 'Employee not found'
        });
      }

      res.json({
        success: true,
        data: employee,
        message: 'Employee fetched successfully'
      });
    } catch (error) {
      log.error('Error in UnifiedEmployeeController.getEmployeeById:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Create new employee (user + workforce profile)
   */
  static async createEmployee(req, res) {
    try {
      const { businessId, userId } = req.user;
      const employeeData = req.body;

      log.info(`Creating employee for business ${businessId}`, { employeeData });

      const result = await UnifiedEmployeeService.createEmployee(
        businessId,
        employeeData,
        userId
      );

      res.status(201).json({
        success: true,
        data: result,
        message: 'Employee created successfully with workforce profile'
      });
    } catch (error) {
      log.error('Error in UnifiedEmployeeController.createEmployee:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Update employee
   */
  static async updateEmployee(req, res) {
    try {
      const { businessId } = req.user;
      const { id } = req.params;
      const employeeData = req.body;

      log.info(`Updating employee ${id} for business ${businessId}`, { employeeData });

      const result = await UnifiedEmployeeService.updateEmployee(businessId, id, employeeData);

      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Employee not found'
        });
      }

      res.json({
        success: true,
        data: result,
        message: 'Employee updated successfully'
      });
    } catch (error) {
      log.error('Error in UnifiedEmployeeController.updateEmployee:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Delete employee (soft delete)
   */
  static async deleteEmployee(req, res) {
    try {
      const { businessId } = req.user;
      const { id } = req.params;

      log.info(`Deleting employee ${id} for business ${businessId}`);

      const result = await UnifiedEmployeeService.deleteEmployee(businessId, id);

      res.json({
        success: true,
        data: result,
        message: 'Employee deleted successfully'
      });
    } catch (error) {
      log.error('Error in UnifiedEmployeeController.deleteEmployee:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get workforce-specific data for employee
   */
  static async getWorkforceData(req, res) {
    try {
      const { businessId } = req.user;
      const { id } = req.params;

      log.info(`Fetching workforce data for employee ${id} in business ${businessId}`);

      const workforceData = await UnifiedEmployeeService.getWorkforceData(businessId, id);

      if (!workforceData) {
        return res.status(404).json({
          success: false,
          error: 'Employee not found or missing workforce profile'
        });
      }

      res.json({
        success: true,
        data: workforceData,
        message: 'Workforce data fetched successfully'
      });
    } catch (error) {
      log.error('Error in UnifiedEmployeeController.getWorkforceData:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Clock in for employee
   */
  static async clockIn(req, res) {
    try {
      const { businessId } = req.user;
      const { id } = req.params;
      const { shift_roster_id, gps_latitude, gps_longitude } = req.body;

      log.info(`Clock in for employee ${id} in business ${businessId}`);

      const result = await UnifiedEmployeeService.clockIn(
        businessId,
        id,
        shift_roster_id,
        gps_latitude,
        gps_longitude
      );

      res.json({
        success: true,
        data: result,
        message: 'Clocked in successfully'
      });
    } catch (error) {
      log.error('Error in UnifiedEmployeeController.clockIn:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Clock out for employee
   */
  static async clockOut(req, res) {
    try {
      const { businessId } = req.user;
      const { id } = req.params;
      const { gps_latitude, gps_longitude } = req.body;

      log.info(`Clock out for employee ${id} in business ${businessId}`);

      const result = await UnifiedEmployeeService.clockOut(
        businessId,
        id,
        gps_latitude,
        gps_longitude
      );

      res.json({
        success: true,
        data: result,
        message: 'Clocked out successfully'
      });
    } catch (error) {
      log.error('Error in UnifiedEmployeeController.clockOut:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get clock events for all employees
   */
  static async getClockEvents(req, res) {
    try {
      const { businessId } = req.user;
      const {
        employee_id,
        start_date,
        end_date,
        event_type,
        limit = 50,
        offset = 0
      } = req.query;

      log.info(`Fetching clock events for business ${businessId}`, {
        employee_id, start_date, end_date, event_type, limit, offset
      });

      console.log("=== DEBUG IN CONTROLLER ===");
      console.log("Calling getClockEvents with:");
      console.log("businessId:", businessId);
      console.log("filters:", { employee_id, start_date, end_date, event_type, limit, offset });

      const clockEvents = await UnifiedEmployeeService.getClockEvents(
        businessId,
        { employee_id, start_date, end_date, event_type, limit, offset }
      );

      res.json({
        success: true,
        data: clockEvents,
        count: clockEvents.length,
        message: 'Clock events fetched successfully'
      });
    } catch (error) {
      log.error('Error in UnifiedEmployeeController.getClockEvents:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get clock events for specific employee
   */
  static async getEmployeeClockEvents(req, res) {
    try {
      const { businessId } = req.user;
      const { id } = req.params;
      const {
        start_date,
        end_date,
        event_type,
        limit = 50,
        offset = 0
      } = req.query;

      log.info(`Fetching clock events for employee ${id} in business ${businessId}`, {
        start_date, end_date, event_type, limit, offset
      });

      const clockEvents = await UnifiedEmployeeService.getEmployeeClockEvents(
        businessId,
        id,
        { start_date, end_date, event_type, limit, offset }
      );

      res.json({
        success: true,
        data: clockEvents,
        count: clockEvents.length,
        message: 'Employee clock events fetched successfully'
      });
    } catch (error) {
      log.error('Error in UnifiedEmployeeController.getEmployeeClockEvents:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Start break for employee
   */
  static async startBreak(req, res) {
    try {
      const { businessId } = req.user;
      const { id } = req.params;
      const { notes } = req.body;

      log.info(`Start break for employee ${id} in business ${businessId}`);

      const result = await UnifiedEmployeeService.startBreak(businessId, id, notes);

      res.json({
        success: true,
        data: result,
        message: 'Break started successfully'
      });
    } catch (error) {
      log.error('Error in UnifiedEmployeeController.startBreak:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * End break for employee
   */
  static async endBreak(req, res) {
    try {
      const { businessId } = req.user;
      const { id } = req.params;
      const { notes } = req.body;

      log.info(`End break for employee ${id} in business ${businessId}`);

      const result = await UnifiedEmployeeService.endBreak(businessId, id, notes);

      res.json({
        success: true,
        data: result,
        message: 'Break ended successfully'
      });
    } catch (error) {
      log.error('Error in UnifiedEmployeeController.endBreak:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
}
