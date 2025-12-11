/**
 * Utilities for safe API parameter handling
 */

/**
 * Clean API parameters by removing undefined, null, and empty string values
 * Prevents "invalid input syntax for type uuid: 'undefined'" errors
 */
export function cleanParams<T extends Record<string, any>>(params: T): Partial<T> {
  if (!params || typeof params !== 'object') {
    return {};
  }
  
  const cleaned: Partial<T> = {};
  
  Object.keys(params).forEach(key => {
    const value = params[key];
    
    // Only include if value is not undefined, null, or empty string
    // Also exclude 'undefined' and 'null' strings
    if (value !== undefined && 
        value !== null && 
        value !== '' && 
        value !== 'undefined' && 
        value !== 'null') {
      cleaned[key as keyof T] = value;
    }
  });
  
  return cleaned;
}

/**
 * Clean a single value for API calls
 */
export function cleanValue(value: any): any {
  if (value === undefined || value === null || value === '' || value === 'undefined' || value === 'null') {
    return undefined;
  }
  return value;
}

/**
 * Clean UUID parameters specifically
 */
export function cleanUuidParam(value: string | undefined | null): string | undefined {
  if (!value || value === 'undefined' || value === 'null') {
    return undefined;
  }
  
  // Basic UUID validation (v4 format)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    console.warn(`Invalid UUID format: ${value}`);
    return undefined;
  }
  
  return value;
}

/**
 * Clean filters object for staff API calls
 */
export function cleanStaffFilters(filters: any): any {
  if (!filters) return {};
  
  const cleaned = cleanParams(filters);
  
  // Additional cleaning for specific staff filter fields
  if (cleaned.role === 'all' || cleaned.role === '') {
    delete cleaned.role;
  }
  
  if (cleaned.department_id === 'all' || cleaned.department_id === '') {
    delete cleaned.department_id;
  }
  
  return cleaned;
}
