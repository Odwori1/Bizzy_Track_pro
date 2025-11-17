import Joi from 'joi';

export const apiKeyCreateSchema = Joi.object({
  name: Joi.string().required().max(255),
  description: Joi.string().allow('').optional(),
  permissions: Joi.array().items(Joi.string()).default([]),
  rate_limit_per_minute: Joi.number().integer().min(1).max(1000).default(60),
  allowed_ips: Joi.array().items(Joi.string().ip()).default([]),
  allowed_origins: Joi.array().items(Joi.string().uri()).default([]),
  expires_at: Joi.date().iso().greater('now').optional()
});

export const apiKeyUpdateSchema = Joi.object({
  name: Joi.string().max(255).optional(),
  description: Joi.string().allow('').optional(),
  permissions: Joi.array().items(Joi.string()).optional(),
  rate_limit_per_minute: Joi.number().integer().min(1).max(1000).optional(),
  allowed_ips: Joi.array().items(Joi.string().ip()).optional(),
  allowed_origins: Joi.array().items(Joi.string().uri()).optional(),
  is_active: Joi.boolean().optional()
});

export const webhookEndpointCreateSchema = Joi.object({
  name: Joi.string().required().max(255),
  description: Joi.string().allow('').optional(),
  url: Joi.string().uri().required().max(500),
  events: Joi.array().items(Joi.string()).required(),
  content_type: Joi.string().valid('application/json', 'application/x-www-form-urlencoded').default('application/json'),
  retry_config: Joi.object({
    max_attempts: Joi.number().integer().min(1).max(10).default(3),
    backoff_multiplier: Joi.number().integer().min(1).max(5).default(2)
  }).default()
});

export const externalIntegrationCreateSchema = Joi.object({
  service_name: Joi.string().required().max(100),
  provider: Joi.string().required().max(100),
  config: Joi.object().required(),
  permissions: Joi.array().items(Joi.string()).default([])
});

export const apiSecurityPolicyCreateSchema = Joi.object({
  name: Joi.string().required().max(255),
  description: Joi.string().allow('').optional(),
  policy_type: Joi.string().valid('rate_limiting', 'ip_restriction', 'permission_scope').required(),
  rules: Joi.object().required(),
  applies_to: Joi.string().valid('all', 'specific_keys', 'specific_integrations').default('all'),
  target_ids: Joi.array().items(Joi.string().uuid()).default([])
});

export const webhookSignatureSchema = Joi.object({
  provider_name: Joi.string().required().max(100),
  secret_key: Joi.string().required().min(10).max(255),
  signature_algorithm: Joi.string().valid('sha256', 'sha512').default('sha256'),
  verification_rules: Joi.object().optional()
});

// Add this schema for webhook signature verification (different from creation)
export const webhookVerificationSchema = Joi.object({
  provider_name: Joi.string().required().max(100),
  payload: Joi.string().required(),
  signature: Joi.string().required(),
  timestamp: Joi.string().optional()
  // Note: secret_key is NOT required here - it's fetched from database
});
