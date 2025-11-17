import Joi from 'joi';

// Base schemas
const idSchema = Joi.string().uuid().required();
const businessIdSchema = Joi.string().uuid().required();

// Mobile Device Schemas
export const registerMobileDeviceSchema = Joi.object({
  staff_profile_id: idSchema,
  device_id: Joi.string().max(255).required(),
  device_type: Joi.string().max(100).required(),
  app_version: Joi.string().max(50).required(),
  push_token: Joi.string().max(500).optional().allow(''),
  os_version: Joi.string().max(50).optional().allow(''),
  screen_resolution: Joi.string().max(50).optional().allow('')
});

export const mobileAppSettingsSchema = Joi.object({
  theme: Joi.string().valid('light', 'dark', 'auto').optional(),
  language: Joi.string().max(10).optional(),
  offline_mode_enabled: Joi.boolean().optional(),
  auto_sync_enabled: Joi.boolean().optional(),
  sync_frequency_minutes: Joi.number().integer().min(1).max(1440).optional(),
  gps_tracking_enabled: Joi.boolean().optional(),
  camera_upload_quality: Joi.string().valid('low', 'medium', 'high').optional(),
  job_assignments: Joi.boolean().optional(),
  job_reminders: Joi.boolean().optional(),
  sync_notifications: Joi.boolean().optional(),
  system_alerts: Joi.boolean().optional(),
  marketing: Joi.boolean().optional(),
  quiet_hours_start: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
  quiet_hours_end: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null)
});

// Offline Sync Schemas
export const startOfflineSyncSchema = Joi.object({
  staff_profile_id: idSchema,
  device_id: Joi.string().max(255).required(),
  total_records: Joi.number().integer().min(0).optional().default(0)
});

export const completeOfflineSyncSchema = Joi.object({
  synced_records: Joi.number().integer().min(0).required(),
  sync_status: Joi.string().valid('completed', 'failed').optional().default('completed'),
  error_message: Joi.string().optional().allow('')
});

// Camera & Media Schemas
export const createCameraTemplateSchema = Joi.object({
  name: Joi.string().max(255).required(),
  description: Joi.string().optional().allow(''),
  template_type: Joi.string().valid('equipment_check', 'proof_of_work', 'damage_report').required(),
  required_photos: Joi.array().items(Joi.string()).optional().default([]),
  quality_requirements: Joi.object().optional().default({})
});

export const uploadMediaAttachmentSchema = Joi.object({
  staff_profile_id: idSchema,
  field_job_assignment_id: idSchema.optional().allow(null),
  asset_id: idSchema.optional().allow(null),
  file_name: Joi.string().max(255).required(),
  file_path: Joi.string().max(500).required(),
  file_size: Joi.number().integer().min(0).required(),
  mime_type: Joi.string().max(100).required(),
  media_type: Joi.string().valid('photo', 'video', 'document', 'signature').required(),
  thumbnail_path: Joi.string().max(500).optional().allow(''),
  gps_latitude: Joi.number().min(-90).max(90).optional().allow(null),
  gps_longitude: Joi.number().min(-180).max(180).optional().allow(null),
  device_id: Joi.string().max(255).optional().allow(''),
  description: Joi.string().optional().allow('')
});

// Notification Schemas
export const sendPushNotificationSchema = Joi.object({
  title: Joi.string().max(255).required(),
  message: Joi.string().required(),
  notification_type: Joi.string().valid('job_assigned', 'job_reminder', 'sync_complete', 'system_alert').required(),
  target_audience: Joi.object({
    staff_ids: Joi.array().items(idSchema).optional().default([]),
    roles: Joi.array().items(Joi.string()).optional().default([]),
    departments: Joi.array().items(idSchema).optional().default([])
  }).required(),
  data: Joi.object().optional().default({}),
  scheduled_for: Joi.date().optional().allow(null)
});

export const targetAudienceSchema = Joi.object({
  staff_ids: Joi.array().items(idSchema).optional().default([]),
  roles: Joi.array().items(Joi.string()).optional().default([]),
  departments: Joi.array().items(idSchema).optional().default([])
});

// Performance Logging Schema
export const mobilePerformanceSchema = Joi.object({
  staff_profile_id: idSchema,
  device_id: Joi.string().max(255).required(),
  app_version: Joi.string().max(50).required(),
  event_type: Joi.string().max(100).required(),
  event_data: Joi.object().optional().default({}),
  performance_metrics: Joi.object().optional().default({}),
  network_type: Joi.string().valid('wifi', 'cellular', 'offline').optional().allow(null),
  battery_level: Joi.number().integer().min(0).max(100).optional().allow(null)
});

// Query parameter schemas
export const mobileQuerySchema = Joi.object({
  template_type: Joi.string().valid('equipment_check', 'proof_of_work', 'damage_report').optional(),
  is_active: Joi.boolean().optional(),
  staff_profile_id: idSchema.optional(),
  field_job_assignment_id: idSchema.optional(),
  media_type: Joi.string().valid('photo', 'video', 'document', 'signature').optional(),
  notification_type: Joi.string().valid('job_assigned', 'job_reminder', 'sync_complete', 'system_alert').optional(),
  delivery_status: Joi.string().valid('pending', 'sent', 'delivered', 'failed').optional()
});
