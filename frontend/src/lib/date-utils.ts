// Unified date handling following backend format
export const formatDate = (dateData: any): string => {
  if (!dateData) return 'Not scheduled';
  
  // Use backend's formatted string if available
  if (typeof dateData === 'object' && dateData.formatted) {
    return dateData.formatted;
  }
  
  // Fallback: parse UTC string
  if (dateData?.utc) {
    try {
      return new Date(dateData.utc).toLocaleDateString();
    } catch {
      return 'Invalid Date';
    }
  }
  
  // Fallback: parse string directly
  if (typeof dateData === 'string') {
    try {
      return new Date(dateData).toLocaleDateString();
    } catch {
      return 'Invalid Date';
    }
  }
  
  return 'Invalid Date';
};

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

// Get date object from backend format
export const getDateFromBackendFormat = (dateData: any): Date | null => {
  if (!dateData) return null;
  
  if (typeof dateData === 'object' && dateData.utc) {
    try {
      return new Date(dateData.utc);
    } catch {
      return null;
    }
  }
  
  if (typeof dateData === 'string') {
    try {
      return new Date(dateData);
    } catch {
      return null;
    }
  }
  
  return null;
};

// Alternative name for backward compatibility
export const formatDateShort = formatDateForChart;
