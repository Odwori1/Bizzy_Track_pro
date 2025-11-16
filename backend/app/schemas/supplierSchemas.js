import Joi from 'joi';

export const createSupplierSchema = Joi.object({
  name: Joi.string().max(255).required(),
  contact_person: Joi.string().max(255).optional().allow(''),
  email: Joi.string().email().optional().allow(''),
  phone: Joi.string().max(50).optional().allow(''),
  address: Joi.string().max(1000).optional().allow(''),
  tax_id: Joi.string().max(100).optional().allow(''),
  payment_terms: Joi.string().max(100).optional().allow(''),
  rating: Joi.number().integer().min(1).max(5).default(5),
  is_active: Joi.boolean().default(true)
});

export const updateSupplierSchema = Joi.object({
  name: Joi.string().max(255).optional(),
  contact_person: Joi.string().max(255).optional().allow(''),
  email: Joi.string().email().optional().allow(''),
  phone: Joi.string().max(50).optional().allow(''),
  address: Joi.string().max(1000).optional().allow(''),
  tax_id: Joi.string().max(100).optional().allow(''),
  payment_terms: Joi.string().max(100).optional().allow(''),
  rating: Joi.number().integer().min(1).max(5).optional(),
  is_active: Joi.boolean().optional()
});

export const supplierQuerySchema = Joi.object({
  is_active: Joi.boolean().optional(),
  search: Joi.string().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});
