import { customerCommunicationService } from '../services/customerCommunicationService.js';
import { log } from '../utils/logger.js';

export const customerCommunicationController = {
  async create(req, res, next) {
    try {
      const communicationData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating customer communication', {
        customerId: communicationData.customer_id,
        type: communicationData.type,
        userId,
        businessId
      });

      const newCommunication = await customerCommunicationService.createCommunication(
        communicationData,
        userId,
        businessId
      );

      res.status(201).json({
        success: true,
        message: 'Customer communication created successfully',
        data: newCommunication
      });

    } catch (error) {
      log.error('Customer communication creation controller error', error);
      next(error);
    }
  },

  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { customerId, type, direction } = req.query;

      log.info('Fetching all customer communications', {
        businessId,
        filters: { customerId, type, direction }
      });

      const options = {};
      if (customerId) options.customerId = customerId;
      if (type) options.type = type;
      if (direction) options.direction = direction;

      const communications = await customerCommunicationService.getAllCommunications(businessId, options);

      res.json({
        success: true,
        data: communications
      });

    } catch (error) {
      log.error('Customer communications fetch controller error', error);
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Fetching customer communication by ID', {
        communicationId: id,
        businessId
      });

      const communication = await customerCommunicationService.getCommunicationById(id, businessId);

      if (!communication) {
        return res.status(404).json({
          success: false,
          message: 'Customer communication not found'
        });
      }

      res.json({
        success: true,
        data: communication
      });

    } catch (error) {
      log.error('Customer communication fetch by ID controller error', error);
      next(error);
    }
  },

  async getByCustomerId(req, res, next) {
    try {
      const { customerId } = req.params;
      const businessId = req.user.businessId;
      const { type, direction, limit } = req.query;

      log.info('Fetching communications for customer', {
        customerId,
        businessId
      });

      const options = {};
      if (type) options.type = type;
      if (direction) options.direction = direction;
      if (limit) options.limit = parseInt(limit);

      const communications = await customerCommunicationService.getCommunicationsByCustomerId(
        customerId,
        businessId,
        options
      );

      res.json({
        success: true,
        data: communications
      });

    } catch (error) {
      log.error('Customer communications by customer ID controller error', error);
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating customer communication', {
        communicationId: id,
        userId,
        businessId
      });

      const updatedCommunication = await customerCommunicationService.updateCommunication(
        id,
        updateData,
        userId,
        businessId
      );

      if (!updatedCommunication) {
        return res.status(404).json({
          success: false,
          message: 'Customer communication not found'
        });
      }

      res.json({
        success: true,
        message: 'Customer communication updated successfully',
        data: updatedCommunication
      });

    } catch (error) {
      log.error('Customer communication update controller error', error);
      next(error);
    }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Deleting customer communication', {
        communicationId: id,
        userId,
        businessId
      });

      const deletedCommunication = await customerCommunicationService.deleteCommunication(
        id,
        userId,
        businessId
      );

      if (!deletedCommunication) {
        return res.status(404).json({
          success: false,
          message: 'Customer communication not found'
        });
      }

      res.json({
        success: true,
        message: 'Customer communication deleted successfully',
        data: deletedCommunication
      });

    } catch (error) {
      log.error('Customer communication deletion controller error', error);
      next(error);
    }
  }
};
