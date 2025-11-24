import Joi from 'joi';

export const calculateDepreciationSchema = Joi.object({
  asset_id: Joi.string().uuid().required(),
  period_date: Joi.date().required()
});
