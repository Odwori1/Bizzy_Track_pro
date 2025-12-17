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
 * Clean UUID parameter for staff IDs - FIXED VERSION
 * Accepts any UUID version (v1, v3, v4, v5, nil) not just v4
 */
export function cleanStaffIdParam(value: string | undefined | null): string | undefined {
  if (!value || value === 'undefined' || value === 'null') {
    console.warn('cleanStaffIdParam: No value provided');
    return undefined;
  }

  const trimmed = value.toString().trim();
  
  // CRITICAL FIX: Check if it's a route name like "departments", "performance", etc.
  const routeNames = ['departments', 'performance', 'role', 'edit', 'invite', 'create', 'overview'];
  if (routeNames.includes(trimmed.toLowerCase())) {
    console.error(`cleanStaffIdParam: Route name "${trimmed}" passed as staff ID`);
    return undefined;
  }
  
  if (trimmed === 'undefined' || trimmed === 'null' || trimmed === '') {
    console.warn(`cleanStaffIdParam: Invalid value "${trimmed}"`);
    return undefined;
  }

  // Accept any UUID version (v1, v2, v3, v4, v5, nil UUIDs)
  const anyUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  // Also accept UUIDs without hyphens
  const anyUuidNoHyphens = /^[0-9a-f]{32}$/i;
  
  if (anyUuidRegex.test(trimmed) || anyUuidNoHyphens.test(trimmed)) {
    return trimmed;
  }
  
  // Allow other ID formats as fallback (for compatibility) but log warning
  if (trimmed.length >= 8 && trimmed.length <= 64 && /^[a-zA-Z0-9\-_]+$/.test(trimmed)) {
    console.warn(`cleanStaffIdParam: Allowing non-UUID staff ID: ${trimmed}`);
    return trimmed;
  }
  
  console.error(`cleanStaffIdParam: Invalid staff ID format: ${trimmed}`);
  return undefined;
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

/**
 * Safe ID extraction for Next.js params
 */
export function safeExtractId(param: string | string[] | undefined): string | undefined {
  if (!param) return undefined;
  
  if (Array.isArray(param)) {
    return param[0] || undefined;
  }
  
  return param;
}

/**
 * Validate if a string is a valid UUID
 */
export function isValidUuid(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  
  const trimmed = id.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(trimmed);
}
