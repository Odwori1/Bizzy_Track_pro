// Unified date handling utilities - Follows Jobs system pattern

export interface DateData {
  utc: string;
  local: string;
  iso_local: string;
  formatted: string;
  timestamp: number;
}

export const formatDate = (dateData: any): string => {
  if (!dateData) return 'Not scheduled';
  
  // Handle backend date format (like in Jobs system)
  if (typeof dateData === 'object' && dateData.formatted) {
    return dateData.formatted;
  }
  
  // Handle raw date string
  if (typeof dateData === 'string') {
    try {
      return new Date(dateData).toLocaleString();
    } catch {
      return 'Invalid Date';
    }
  }
  
  // Handle UTC timestamp from backend
  if (dateData.utc) {
    try {
      return new Date(dateData.utc).toLocaleString();
    } catch {
      return 'Invalid Date';
    }
  }
  
  return 'Invalid Date';
};

export const formatDateShort = (dateData: any): string => {
  if (!dateData) return 'N/A';
  
  if (typeof dateData === 'object' && dateData.formatted) {
    const date = new Date(dateData.utc || dateData.local);
    return date.toLocaleDateString();
  }
  
  if (typeof dateData === 'string') {
    return new Date(dateData).toLocaleDateString();
  }
  
  return 'N/A';
};

export const parseBackendDate = (dateObj: any): Date => {
  if (!dateObj) return new Date();
  
  if (dateObj.utc) {
    return new Date(dateObj.utc);
  }
  
  if (dateObj.local) {
    return new Date(dateObj.local);
  }
  
  if (typeof dateObj === 'string') {
    return new Date(dateObj);
  }
  
  return new Date();
};
