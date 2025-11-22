import Joi from 'joi';

export const createCustomerCommunicationSchema = Joi.object({
  customer_id: Joi.string().uuid().required()
    .messages({
      'string.empty': 'Customer ID is required',
      'string.guid': 'Customer ID must be a valid UUID'
    }),
  type: Joi.string().valid('email', 'sms', 'phone', 'in_person', 'note').required()
    .messages({
      'any.only': 'Type must be one of: email, sms, phone, in_person, note',
      'string.empty': 'Type is required'
    }),
  direction: Joi.string().valid('incoming', 'outgoing').required()
    .messages({
      'any.only': 'Direction must be one of: incoming, outgoing',
      'string.empty': 'Direction is required'
    }),
  subject: Joi.string().trim().max(200).allow('').optional(),
  content: Joi.string().trim().min(1).required()
    .messages({
      'string.empty': 'Content is required',
      'string.min': 'Content must be at least 1 character'
    }),
  status: Joi.string().valid('draft', 'sent', 'delivered', 'read', 'failed').default('sent').optional(),
  related_job_id: Joi.string().uuid().allow(null).optional(),
  related_invoice_id: Joi.string().uuid().allow(null).optional(),
  scheduled_for: Joi.date().iso().allow(null).optional()
});

export const updateCustomerCommunicationSchema = Joi.object({
  type: Joi.string().valid('email', 'sms', 'phone', 'in_person', 'note').optional(),
  direction: Joi.string().valid('incoming', 'outgoing').optional(),
  subject: Joi.string().trim().max(200).allow('').optional(),
  content: Joi.string().trim().min(1).optional(),
  status: Joi.string().valid('draft', 'sent', 'delivered', 'read', 'failed').optional(),
  related_job_id: Joi.string().uuid().allow(null).optional(),
  related_invoice_id: Joi.string().uuid().allow(null).optional(),
  scheduled_for: Joi.date().iso().allow(null).optional(),
  sent_at: Joi.date().iso().allow(null).optional()
});
