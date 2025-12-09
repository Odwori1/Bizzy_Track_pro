import { StaffService } from '../services/staffService.js';
import { log } from '../utils/logger.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export const staffController = {
  /**
   * Create a new staff account
   */
  async createStaff(req, res, next) {
    try {
      const staffData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating staff account', {
        businessId,
        createdBy: userId,
        staffEmail: staffData.email
      });

      const staffAccount = await StaffService.createStaff(businessId, staffData, userId);

      res.status(201).json({
        success: true,
        message: 'Staff account created successfully',
        data: staffAccount
      });

    } catch (error) {
      log.error('Staff creation controller error', error);
      next(error);
    }
  },

  /**
   * Get all staff for a business
   */
  async getStaff(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      const staff = await StaffService.getStaff(businessId, filters);

      res.json({
        success: true,
        data: staff,
        count: staff.length,
        message: 'Staff fetched successfully'
      });

    } catch (error) {
      log.error('Staff fetch controller error', error);
      next(error);
    }
  },

  /**
   * Get staff by ID
   */
  async getStaffById(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { id } = req.params;

      const staff = await StaffService.getStaffById(businessId, id);

      res.json({
        success: true,
        data: staff,
        message: 'Staff details fetched successfully'
      });

    } catch (error) {
      log.error('Staff details fetch controller error', error);
      next(error);
    }
  },

  /**
   * Update staff account
   */
  async updateStaff(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating staff account', {
        businessId,
        updatedBy: userId,
        staffId: id
      });

      const updatedStaff = await StaffService.updateStaff(businessId, id, updateData, userId);

      res.json({
        success: true,
        message: 'Staff account updated successfully',
        data: updatedStaff
      });

    } catch (error) {
      log.error('Staff update controller error', error);
      next(error);
    }
  },

  /**
   * Delete staff account (soft delete)
   */
  async deleteStaff(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Deleting staff account', {
        businessId,
        deletedBy: userId,
        staffId: id
      });

      const deletedStaff = await StaffService.deleteStaff(businessId, id, userId);

      res.json({
        success: true,
        message: 'Staff account deleted successfully',
        data: deletedStaff
      });

    } catch (error) {
      log.error('Staff deletion controller error', error);
      next(error);
    }
  },

  /**
   * Invite staff via email
   */
  async inviteStaff(req, res, next) {
    try {
      const inviteData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Inviting staff', {
        businessId,
        invitedBy: userId,
        staffEmail: inviteData.email
      });

      const invitation = await StaffService.inviteStaff(businessId, inviteData, userId);

      res.status(201).json({
        success: true,
        message: 'Staff invitation sent successfully',
        data: invitation
      });

    } catch (error) {
      log.error('Staff invitation controller error', error);
      next(error);
    }
  },

  /**
   * Resend invitation
   */
  async resendInvitation(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Resending staff invitation', {
        businessId,
        resentBy: userId,
        staffId: id
      });

      const invitation = await StaffService.resendInvitation(businessId, id, userId);

      res.json({
        success: true,
        message: 'Invitation resent successfully',
        data: invitation
      });

    } catch (error) {
      log.error('Resend invitation controller error', error);
      next(error);
    }
  },

  /**
   * Get staff roles and permissions
   */
  async getStaffRoles(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const roles = await StaffService.getStaffRoles(businessId);

      res.json({
        success: true,
        data: roles,
        message: 'Staff roles fetched successfully'
      });

    } catch (error) {
      log.error('Staff roles fetch controller error', error);
      next(error);
    }
  },

  /**
   * Assign role to staff
   */
  async assignRole(req, res, next) {
    try {
      const { staffId } = req.params;
      const { roleId } = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Assigning role to staff', {
        businessId,
        assignedBy: userId,
        staffId,
        roleId
      });

      const assignment = await StaffService.assignRole(businessId, staffId, roleId, userId);

      res.json({
        success: true,
        message: 'Role assigned successfully',
        data: assignment
      });

    } catch (error) {
      log.error('Role assignment controller error', error);
      next(error);
    }
  },

  /**
   * Get staff performance metrics
   */
  async getStaffPerformance(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { staffId } = req.params;
      const filters = req.query;

      const performance = await StaffService.getStaffPerformance(businessId, staffId, filters);

      res.json({
        success: true,
        data: performance,
        message: 'Staff performance fetched successfully'
      });

    } catch (error) {
      log.error('Staff performance fetch controller error', error);
      next(error);
    }
  },

  /**
   * Staff login (for staff accounts) - UPDATED: No business_id required
   */
  async staffLogin(req, res, next) {
    try {
      const { email, password } = req.body; // Only email and password

      log.info('Staff login attempt', { email });

      const result = await StaffService.staffLogin(email, password); // Only 2 parameters

      // Generate proper JWT token (same as business login)
      const tokenData = {
        userId: result.user.id,
        businessId: result.user.business_id,
        email: result.user.email,
        role: result.user.role,
        roleId: result.user.role_id,
        isStaff: true,
        timezone: 'UTC' // Default timezone for staff
      };

      // Use the same JWT system as business login
      const token = jwt.sign(tokenData, process.env.JWT_SECRET, {
        expiresIn: '24h'
      });

      res.json({
        success: true,
        message: 'Staff login successful',
        data: {
          ...result,
          token: token
        }
      });

    } catch (error) {
      log.error('Staff login controller error', error);
      next(error);
    }
  },

  /**
   * Get staff dashboard data
   */
  async getStaffDashboard(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const staffId = req.user.userId;
      const filters = req.query;

      const dashboard = await StaffService.getStaffDashboard(businessId, staffId, filters);

      res.json({
        success: true,
        data: dashboard,
        message: 'Staff dashboard fetched successfully'
      });

    } catch (error) {
      log.error('Staff dashboard fetch controller error', error);
      next(error);
    }
  }
};
