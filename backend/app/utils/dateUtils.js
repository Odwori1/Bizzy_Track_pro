import { log } from './logger.js';

/**
 * Timezone utility functions for consistent date handling
 * Follows the existing utility patterns in the codebase
 */

export const dateUtils = {
  /**
   * Convert UTC date to user's local timezone
   * @param {Date|string} utcDate - UTC date to convert
   * @param {string} timezone - Target timezone (e.g., 'Africa/Nairobi')
   * @returns {Object} Formatted date object with both UTC and local time
   */
  formatDateForTimezone(utcDate, timezone) {
    try {
      if (!utcDate) return null;

      // Handle null values
      if (utcDate === null) return null;

      const date = new Date(utcDate);
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return {
          utc: utcDate,
          local: 'Invalid Date',
          iso_local: 'Invalid Date',
          formatted: 'Invalid Date',
          timestamp: null
        };
      }

      // Format all the date components
      const localTime = this.formatToLocalTime(date, timezone);
      const isoLocal = this.toISOLocalString(date, timezone);
      const formatted = this.formatDateTime(date, timezone);

      // Return both UTC and local timezone formatted dates
      return {
        utc: date.toISOString(),
        local: localTime,
        iso_local: isoLocal,
        formatted: formatted,
        timestamp: date.getTime()
      };
    } catch (error) {
      log.error('Date formatting error', { error, utcDate, timezone });
      return {
        utc: utcDate,
        local: 'Format Error',
        iso_local: 'Format Error', 
        formatted: 'Format Error',
        timestamp: null
      };
    }
  },

  /**
   * Format date to local time string
   * @param {Date} date - Date object
   * @param {string} timezone - Target timezone
   * @returns {string} Formatted local time
   */
  formatToLocalTime(date, timezone) {
    try {
      return date.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (error) {
      log.error('formatToLocalTime error:', error);
      // Fallback to UTC if timezone is invalid
      return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
    }
  },

  /**
   * Convert to ISO string with local timezone
   * @param {Date} date - Date object
   * @param {string} timezone - Target timezone
   * @returns {string} ISO-like string in local timezone
   */
  toISOLocalString(date, timezone) {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      const parts = formatter.formatToParts(date);
      const year = parts.find(part => part.type === 'year').value;
      const month = parts.find(part => part.type === 'month').value;
      const day = parts.find(part => part.type === 'day').value;
      const hour = parts.find(part => part.type === 'hour').value;
      const minute = parts.find(part => part.type === 'minute').value;
      const second = parts.find(part => part.type === 'second').value;
      
      return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    } catch (error) {
      log.error('toISOLocalString error:', error);
      return date.toISOString().slice(0, 19);
    }
  },

  /**
   * Format date for display
   * @param {Date} date - Date object
   * @param {string} timezone - Target timezone
   * @returns {string} Human readable date
   */
  formatDateTime(date, timezone) {
    try {
      return date.toLocaleString('en-US', {
        timeZone: timezone,
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      log.error('formatDateTime error:', error);
      return date.toLocaleString();
    }
  },

  /**
   * Format date only (without time)
   * @param {Date} date - Date object
   * @param {string} timezone - Target timezone
   * @returns {string} Formatted date
   */
  formatDateOnly(date, timezone) {
    try {
      return date.toLocaleDateString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      log.error('formatDateOnly error:', error);
      return date.toLocaleDateString();
    }
  },

  /**
   * Get current time in specified timezone
   * @param {string} timezone - Target timezone
   * @returns {Object} Current time in UTC and local
   */
  getCurrentTime(timezone) {
    const now = new Date();
    return this.formatDateForTimezone(now, timezone);
  },

  /**
   * Check if timezone is valid
   * @param {string} timezone - Timezone to validate
   * @returns {boolean} True if valid
   */
  isValidTimezone(timezone) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch (error) {
      log.error('Invalid timezone:', timezone, error);
      return false;
    }
  }
};

export default dateUtils;
