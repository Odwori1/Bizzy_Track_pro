import Joi from 'joi';
import { log } from '../utils/logger.js';

/**
 * ACCOUNTING-SPECIFIC VALIDATION MIDDLEWARE
 * Handles RESTful conventions properly for accounting endpoints
 */
export const validateAccountingRequest = (schema, source = 'auto') => {
  return (req, res, next) => {
    try {
      // Determine data source
      let dataSource;
      let validationSource;

      if (source === 'auto') {
        // Auto-detect based on HTTP method
        switch (req.method) {
          case 'GET':
            // For GET, combine query and params
            dataSource = { ...req.query, ...req.params };
            validationSource = 'query/params';
            break;
          case 'POST':
          case 'PUT':
          case 'PATCH':
          case 'DELETE':
            dataSource = req.body;
            validationSource = 'body';
            break;
          default:
            dataSource = {};
            validationSource = 'unknown';
        }
      } else {
        // Explicit source specified
        dataSource = req[source] || {};
        validationSource = source;
      }

      // Handle businessId/business_id naming conflict
      if (!dataSource.business_id) {
        if (req.user?.businessId) {
          dataSource.business_id = req.user.businessId;
        } else if (req.user?.business_id) {
          dataSource.business_id = req.user.business_id;
        }
      }

      // 🆕 FIX: Allow GET endpoints without schema validation
      if (req.method === 'GET' && Object.keys(dataSource).length === 0 && !schema) {
        // No data to validate for GET endpoints without parameters
        req.validatedData = {};
        return next();
      }

      // If no schema provided, skip validation
      if (!schema) {
        req.validatedData = dataSource;
        return next();
      }

      log.debug('Accounting validation:', {
        method: req.method,
        source: validationSource,
        path: req.path,
        dataKeys: Object.keys(dataSource)
      });

      // Validate only if we have a schema AND data to validate
      const { error, value } = schema.validate(dataSource, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });

      if (error) {
        log.warn('Accounting validation failed:', {
          path: req.path,
          errors: error.details.map(d => d.message),
          data: dataSource
        });

        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.details.map(detail => detail.message)
        });
      }

      // Attach validated data to request
      req.validatedData = value;

      // Also update original request objects for backward compatibility
      if (req.method === 'GET') {
        req.query = { ...req.query, ...value };
      } else {
        req.body = { ...req.body, ...value };
      }

      log.debug('Accounting validation passed:', {
        path: req.path,
        validatedFields: Object.keys(value)
      });

      next();
    } catch (validationError) {
      log.error('Validation middleware error:', validationError);
      return res.status(500).json({
        success: false,
        error: 'Validation system error',
        message: validationError.message
      });
    }
  };
};
