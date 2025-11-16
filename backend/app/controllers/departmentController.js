import { DepartmentService } from '../services/departmentService.js';
import { log } from '../utils/logger.js';

export const departmentController = {
  async createDepartment(req, res, next) {
    try {
      const departmentData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating department', {
        businessId,
        userId,
        departmentName: departmentData.name
      });

      const newDepartment = await DepartmentService.createDepartment(businessId, departmentData, userId);

      res.status(201).json({
        success: true,
        message: 'Department created successfully',
        data: newDepartment
      });

    } catch (error) {
      log.error('Department creation controller error', error);
      next(error);
    }
  },

  async getDepartments(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const {
        department_type,
        is_active,
        include_children,
        page,
        limit
      } = req.query;

      const filters = {};
      if (department_type) filters.department_type = department_type;
      if (is_active !== undefined) filters.is_active = is_active === 'true';
      if (page) filters.page = parseInt(page);
      if (limit) filters.limit = parseInt(limit);

      const departments = await DepartmentService.getDepartments(businessId, filters);

      res.json({
        success: true,
        data: departments,
        count: departments.length,
        message: 'Departments fetched successfully'
      });

    } catch (error) {
      log.error('Departments fetch controller error', error);
      next(error);
    }
  },

  async getDepartmentById(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { id } = req.params;

      const department = await DepartmentService.getDepartmentById(businessId, id);

      res.json({
        success: true,
        data: department,
        message: 'Department fetched successfully'
      });

    } catch (error) {
      log.error('Department fetch by ID controller error', error);
      next(error);
    }
  },

  async updateDepartment(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating department', { businessId, userId, departmentId: id });

      const updatedDepartment = await DepartmentService.updateDepartment(businessId, id, updateData, userId);

      res.json({
        success: true,
        message: 'Department updated successfully',
        data: updatedDepartment
      });

    } catch (error) {
      log.error('Department update controller error', error);
      next(error);
    }
  },

  async deleteDepartment(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Deleting department', { businessId, userId, departmentId: id });

      const deletedDepartment = await DepartmentService.deleteDepartment(businessId, id, userId);

      res.json({
        success: true,
        message: 'Department deleted successfully',
        data: deletedDepartment
      });

    } catch (error) {
      log.error('Department deletion controller error', error);
      next(error);
    }
  },

  async getDepartmentHierarchy(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const hierarchy = await DepartmentService.getDepartmentHierarchy(businessId);

      res.json({
        success: true,
        data: hierarchy,
        message: 'Department hierarchy fetched successfully'
      });

    } catch (error) {
      log.error('Department hierarchy fetch controller error', error);
      next(error);
    }
  }
};
