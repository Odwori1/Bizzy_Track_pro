import { dateUtils } from '../utils/dateUtils.js';
import { log } from '../utils/logger.js';

/**
 * Middleware to handle timezone context for all requests
 * Follows the existing middleware pattern (like rlsContext.js)
 */

export const timezoneMiddleware = {
  /**
   * Set timezone context for the request
   */
  setTimezoneContext(req, res, next) {
    try {
      // Get timezone from user preferences
      const userTimezone = req.user?.timezone;

      // Use user timezone if available, otherwise default to UTC
      const timezone = userTimezone || 'UTC';

      // Validate timezone
      const isValidTimezone = dateUtils.isValidTimezone(timezone);

      req.timezone = isValidTimezone ? timezone : 'UTC';
      req.timezoneInfo = {
        detected: timezone,
        isValid: isValidTimezone,
        currentTime: dateUtils.getCurrentTime(timezone)
      };

      log.debug('Timezone context set', {
        userId: req.user?.userId,
        userTimezone,
        finalTimezone: req.timezone,
        isValid: isValidTimezone
      });

      next();
    } catch (error) {
      log.error('Timezone context error', error);
      // Set default timezone on error
      req.timezone = 'UTC';
      req.timezoneInfo = {
        detected: 'UTC',
        isValid: true,
        currentTime: dateUtils.getCurrentTime('UTC')
      };
      next();
    }
  },

  /**
   * Format response dates to local timezone
   */
  formatResponseDates(req, res, next) {
    // Only format responses that have timezone context (protected routes)
    if (!req.timezone) {
      return next();
    }

    const originalJson = res.json;

    res.json = function(data) {
      try {
        if (data && typeof data === 'object') {
          const formattedData = recursivelyFormatDates(data, req.timezone);
          return originalJson.call(this, formattedData);
        }
        return originalJson.call(this, data);
      } catch (error) {
        log.error('Response date formatting error:', error);
        return originalJson.call(this, data);
      }
    };

    next();
  }
};

/**
 * Recursively format dates in an object
 */
function recursivelyFormatDates(obj, timezone) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => recursivelyFormatDates(item, timezone));
  }

  const formatted = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if this field should be formatted as a date
    const shouldFormat = isDateString(value, key);
    
    if (shouldFormat) {
      try {
        // Convert to ISO string if it's a Date object
        const dateValue = value instanceof Date ? value.toISOString() : value;
        const formattedDate = dateUtils.formatDateForTimezone(dateValue, timezone);
        formatted[key] = formattedDate;
      } catch (error) {
        log.error(`Error formatting date field ${key}:`, error);
        formatted[key] = value; // Keep original value on error
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively process nested objects
      formatted[key] = recursivelyFormatDates(value, timezone);
    } else {
      formatted[key] = value;
    }
  }

  return formatted;
}

/**
 * Check if a value should be formatted as a date
 * @param {*} value - Value to check
 * @param {string} key - Field name
 * @returns {boolean} True if it's a date value
 */
function isDateString(value, key) {
  // Check if it's a Date object
  if (value instanceof Date) {
    return true;
  }

  // Check if it's a date string
  if (typeof value === 'string') {
    // Common date patterns in the system
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO format with time
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/, // ISO format with milliseconds
    ];

    // Common date field names in the system
    const dateFields = [
      'created_at', 'updated_at', 'scheduled_date', 'due_date',
      'invoice_date', 'payment_date', 'started_at', 'completed_at',
      'granted_at', 'expires_at', 'last_visit', 'valid_from', 'valid_until'
    ];

    const isDatePattern = datePatterns.some(pattern => pattern.test(value));
    const isDateField = dateFields.some(field => key === field);

    return isDatePattern && isDateField;
  }

  return false;
}
