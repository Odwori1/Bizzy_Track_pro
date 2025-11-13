import Joi from 'joi';

export const financialSummarySchema = {
  query: Joi.object({
    period: Joi.string().valid('week', 'month', 'quarter', 'year').default('month')
  })
};

export const activityTimelineSchema = {
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};
