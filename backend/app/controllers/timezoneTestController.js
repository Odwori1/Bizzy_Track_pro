import { dateUtils } from '../utils/dateUtils.js';
import { log } from '../utils/logger.js';

export const timezoneTestController = {
  /**
   * Test endpoint to verify timezone functionality
   */
  async testTimezone(req, res) {
    try {
      const userTimezone = req.user.timezone;
      const businessTimezone = req.business?.timezone;
      const requestTimezone = req.timezone;
      
      const now = new Date();
      const testDates = {
        now: now.toISOString(),
        yesterday: new Date(now.setDate(now.getDate() - 1)).toISOString(),
        tomorrow: new Date(now.setDate(now.getDate() + 2)).toISOString()
      };

      const formattedDates = {};
      for (const [key, date] of Object.entries(testDates)) {
        formattedDates[key] = dateUtils.formatDateForTimezone(date, requestTimezone);
      }

      res.json({
        success: true,
        timezoneInfo: {
          userTimezone,
          businessTimezone,
          requestTimezone,
          isValid: dateUtils.isValidTimezone(requestTimezone),
          currentTime: dateUtils.getCurrentTime(requestTimezone)
        },
        testDates: formattedDates,
        message: 'Timezone test completed successfully'
      });

    } catch (error) {
      log.error('Timezone test error', error);
      res.status(500).json({
        success: false,
        error: 'Timezone test failed'
      });
    }
  }
};
