/**
 * Date formatting utility for consistent date handling
 * Handles both string dates and complex date objects from backend
 */

export interface BackendDate {
  utc: string;
  local: string;
  iso_local: string;
  formatted: string;
  timestamp: number;
}

/**
 * Safely format a date from backend
 */
export function formatDate(
  dateInput: string | BackendDate | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!dateInput) return 'N/A';

  try {
    let date: Date;

    if (typeof dateInput === 'string') {
      // Handle ISO string
      date = new Date(dateInput);
    } else if (typeof dateInput === 'object' && dateInput !== null) {
      if ('utc' in dateInput) {
        // Handle backend date object
        date = new Date(dateInput.utc);
      } else if (dateInput instanceof Date) {
        date = dateInput;
      } else {
        return 'Invalid date';
      }
    } else {
      return 'Invalid date';
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }

    // Default options
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...options
    };

    return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
  } catch (error) {
    console.error('Date formatting error:', error, dateInput);
    return 'Invalid date';
  }
}

/**
 * Format date for display (short format)
 */
export function formatDisplayDate(dateInput: string | BackendDate | Date | null | undefined): string {
  return formatDate(dateInput, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format date for input fields (YYYY-MM-DD)
 */
export function formatInputDate(dateInput: string | BackendDate | Date | null | undefined): string {
  if (!dateInput) return '';

  try {
    let date: Date;

    if (typeof dateInput === 'string') {
      date = new Date(dateInput);
    } else if (typeof dateInput === 'object' && dateInput !== null) {
      if ('utc' in dateInput) {
        date = new Date(dateInput.utc);
      } else if (dateInput instanceof Date) {
        date = dateInput;
      } else {
        return '';
      }
    } else {
      return '';
    }

    if (isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('Input date formatting error:', error);
    return '';
  }
}

/**
 * Get date only (without time) for comparisons
 */
export function getDateOnly(dateInput: string | BackendDate | Date | null | undefined): Date | null {
  if (!dateInput) return null;

  try {
    let date: Date;

    if (typeof dateInput === 'string') {
      date = new Date(dateInput);
    } else if (typeof dateInput === 'object' && dateInput !== null) {
      if ('utc' in dateInput) {
        date = new Date(dateInput.utc);
      } else if (dateInput instanceof Date) {
        date = dateInput;
      } else {
        return null;
      }
    } else {
      return null;
    }

    if (isNaN(date.getTime())) return null;

    // Strip time component
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  } catch (error) {
    console.error('Get date only error:', error);
    return null;
  }
}

/**
 * Check if a date is today
 */
export function isToday(dateInput: string | BackendDate | Date | null | undefined): boolean {
  const date = getDateOnly(dateInput);
  if (!date) return false;

  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return date.getTime() === todayOnly.getTime();
}

/**
 * Check if a date is in the past
 */
export function isPastDate(dateInput: string | BackendDate | Date | null | undefined): boolean {
  const date = getDateOnly(dateInput);
  if (!date) return false;

  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return date.getTime() < todayOnly.getTime();
}

// For chart labels - simplified date format
export const formatDateForChart = (dateData: any): string => {
  if (!dateData) return '';

  // Use backend's formatted string if available
  if (typeof dateData === 'object' && dateData.formatted) {
    const date = new Date(dateData.utc || dateData.local);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Fallback: parse string directly
  if (typeof dateData === 'string') {
    try {
      const date = new Date(dateData);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  return '';
};

// Alternative name for backward compatibility
export const formatDateShort = formatDateForChart;

/**
 * Format time only (hours and minutes)
 */
export function formatTime(dateInput: string | BackendDate | Date | null | undefined): string {
  if (!dateInput) return 'N/A';

  try {
    let date: Date;

    if (typeof dateInput === 'string') {
      date = new Date(dateInput);
    } else if (typeof dateInput === 'object' && dateInput !== null) {
      if ('utc' in dateInput) {
        date = new Date(dateInput.utc);
      } else if (dateInput instanceof Date) {
        date = dateInput;
      } else {
        return 'Invalid time';
      }
    } else {
      return 'Invalid time';
    }

    if (isNaN(date.getTime())) {
      return 'Invalid time';
    }

    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    console.error('Time formatting error:', error);
    return 'Invalid time';
  }
}

/**
 * Format date and time together
 */
export function formatDateTime(dateInput: string | BackendDate | Date | null | undefined): string {
  const dateStr = formatDisplayDate(dateInput);
  const timeStr = formatTime(dateInput);
  
  if (dateStr === 'N/A' || timeStr === 'N/A') return 'N/A';
  if (dateStr.includes('Invalid') || timeStr.includes('Invalid')) return 'Invalid date/time';
  
  return `${dateStr} at ${timeStr}`;
}
