import Joi from 'joi';

export const createSecurityScanSchema = Joi.object({
  scan_type: Joi.string().valid('permission_audit', 'rls_verification', 'api_security', 'compliance_check').required(),
  scan_name: Joi.string().required().max(255),
  description: Joi.string().allow('').optional(),
  target_branches: Joi.array().items(Joi.string().uuid()).default([])
});

export const createComplianceFrameworkSchema = Joi.object({
  framework_name: Joi.string().required().max(100),
  version: Joi.string().required().max(50),
  description: Joi.string().allow('').optional(),
  requirements: Joi.object().required(),
  applies_to_branches: Joi.array().items(Joi.string().uuid()).default([])
});

export const complianceAuditSchema = Joi.object({
  framework_id: Joi.string().uuid().required(),
  requirement_id: Joi.string().required().max(100),
  status: Joi.string().valid('compliant', 'non_compliant', 'not_applicable').required(),
  evidence: Joi.object().optional(),
  notes: Joi.string().allow('').optional(),
  next_audit_due: Joi.date().iso().greater('now').optional()
});

export const securityTestResultSchema = Joi.object({
  test_type: Joi.string().valid('penetration_test', 'vulnerability_scan', 'code_review', 'configuration_audit').required(),
  test_name: Joi.string().required().max(255),
  severity: Joi.string().valid('critical', 'high', 'medium', 'low').required(),
  description: Joi.string().required(),
  vulnerability_details: Joi.object().optional(),
  remediation_steps: Joi.string().allow('').optional(),
  assigned_to: Joi.string().uuid().optional(),
  due_date: Joi.date().iso().greater('now').optional()
});

export const updateSecurityTestSchema = Joi.object({
  status: Joi.string().valid('open', 'in_progress', 'resolved', 'closed').optional(),
  remediation_steps: Joi.string().allow('').optional(),
  resolved_at: Joi.date().iso().optional()
});

export const auditTrailVerificationSchema = Joi.object({
  verification_type: Joi.string().valid('integrity_check', 'tamper_detection').required(),
  period_start: Joi.date().iso().required(),
  period_end: Joi.date().iso().required().greater(Joi.ref('period_start'))
});
