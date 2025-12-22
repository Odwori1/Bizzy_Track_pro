const Joi = require('joi');

// Test the shiftQuerySchema
const shiftQuerySchema = Joi.object({
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  department_id: Joi.string().uuid().optional(),
  staff_profile_id: Joi.string().uuid().optional(),
  shift_status: Joi.string().valid('scheduled', 'in_progress', 'completed', 'cancelled').optional()
});

// Test with our parameters
const testParams = {
  start_date: '2025-01-01',
  end_date: '2025-12-31'
};

const { error, value } = shiftQuerySchema.validate(testParams);

if (error) {
  console.log('❌ Validation error:', error.details);
} else {
  console.log('✅ Validation passed:', value);
}
