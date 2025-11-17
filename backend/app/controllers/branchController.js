import { BranchService } from '../services/branchService.js';
import { log } from '../utils/logger.js';

export class BranchController {
  
  // Create a new branch
  static async createBranch(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const branchData = req.body;
      
      log.info('Creating new branch', { businessId, userId, branchData: { name: branchData.name, code: branchData.code } });
      
      const branch = await BranchService.createBranch(businessId, branchData, userId);
      
      res.status(201).json({
        success: true,
        message: 'Branch created successfully',
        data: branch
      });
      
    } catch (error) {
      log.error('Error creating branch', { error: error.message, businessId: req.user.businessId });
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Get all branches for business
  static async getBranches(req, res) {
    try {
      const businessId = req.user.businessId;
      
      log.info('Fetching branches for business', { businessId });
      
      const branches = await BranchService.getBranches(businessId);
      
      res.json({
        success: true,
        data: branches
      });
      
    } catch (error) {
      log.error('Error fetching branches', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Get specific branch
  static async getBranch(req, res) {
    try {
      const businessId = req.user.businessId;
      const { branchId } = req.params;
      
      log.info('Fetching branch', { businessId, branchId });
      
      const branch = await BranchService.getBranchById(businessId, branchId);
      
      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        });
      }
      
      res.json({
        success: true,
        data: branch
      });
      
    } catch (error) {
      log.error('Error fetching branch', { error: error.message, businessId: req.user.businessId, branchId: req.params.branchId });
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Update branch
  static async updateBranch(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { branchId } = req.params;
      const updateData = req.body;
      
      log.info('Updating branch', { businessId, branchId, updateData });
      
      const branch = await BranchService.updateBranch(businessId, branchId, updateData, userId);
      
      res.json({
        success: true,
        message: 'Branch updated successfully',
        data: branch
      });
      
    } catch (error) {
      log.error('Error updating branch', { error: error.message, businessId: req.user.businessId, branchId: req.params.branchId });
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Create branch permission set
  static async createBranchPermissionSet(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const permissionData = req.body;
      
      log.info('Creating branch permission set', { businessId, permissionData: { name: permissionData.name, branch_id: permissionData.branch_id } });
      
      const permissionSet = await BranchService.createBranchPermissionSet(businessId, permissionData, userId);
      
      res.status(201).json({
        success: true,
        message: 'Branch permission set created successfully',
        data: permissionSet
      });
      
    } catch (error) {
      log.error('Error creating branch permission set', { error: error.message, businessId: req.user.businessId });
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Assign user to branch
  static async assignUserToBranch(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const assignmentData = req.body;
      
      log.info('Assigning user to branch', { businessId, assignmentData: { user_id: assignmentData.user_id, branch_id: assignmentData.branch_id } });
      
      const assignment = await BranchService.assignUserToBranch(businessId, assignmentData, userId);
      
      res.status(201).json({
        success: true,
        message: 'User assigned to branch successfully',
        data: assignment
      });
      
    } catch (error) {
      log.error('Error assigning user to branch', { error: error.message, businessId: req.user.businessId });
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Get user branch assignments
  static async getUserBranchAssignments(req, res) {
    try {
      const businessId = req.user.businessId;
      const { userId } = req.params;
      
      log.info('Fetching user branch assignments', { businessId, userId });
      
      const assignments = await BranchService.getUserBranchAssignments(businessId, userId);
      
      res.json({
        success: true,
        data: assignments
      });
      
    } catch (error) {
      log.error('Error fetching user branch assignments', { error: error.message, businessId: req.user.businessId, userId: req.params.userId });
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Create cross-branch access rule
  static async createCrossBranchAccess(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const accessData = req.body;
      
      log.info('Creating cross-branch access rule', { businessId, accessData });
      
      const accessRule = await BranchService.createCrossBranchAccess(businessId, accessData, userId);
      
      res.status(201).json({
        success: true,
        message: 'Cross-branch access rule created successfully',
        data: accessRule
      });
      
    } catch (error) {
      log.error('Error creating cross-branch access rule', { error: error.message, businessId: req.user.businessId });
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}
