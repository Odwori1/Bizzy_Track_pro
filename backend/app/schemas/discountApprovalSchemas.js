import Joi from 'joi';

export const createDiscountApprovalSchema = Joi.object({
  job_id: Joi.string().uuid().required(),
  invoice_id: Joi.string().uuid().optional(),
  original_amount: Joi.number().positive().required(),
  requested_discount: Joi.number().positive().required(),
  discount_percentage: Joi.number().min(0).max(100).required(),
  reason: Joi.string().max(500).required(),
  requires_approval: Joi.boolean().default(true),
  approval_threshold: Joi.number().min(0).max(100).default(20)
});

export const updateDiscountApprovalSchema = Joi.object({
  status: Joi.string().valid('pending', 'approved', 'rejected').required(),
  approval_notes: Joi.string().max(500).allow(''),
  approved_by: Joi.string().uuid().optional()
});

export const approveDiscountSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  approval_notes: Joi.string().max(500).allow('')
});
