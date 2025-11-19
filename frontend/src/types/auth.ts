export interface User {
  id: string;
  email: string;
  fullName: string; // CHANGED: from firstName/lastName to match backend
  role: string;
  businessId: string;
  permissions: string[];
  timezone: string; // ADDED: to match backend response
}

export interface Business {
  id: string;
  name: string;
  currency: string;
  currencySymbol: string;
  timezone: string;
}

export interface AuthResponse {
  user: User;
  business: Business; // ADDED: to match backend response
  token: string;
  timezoneInfo: { // ADDED: to match backend response
    detected: string;
    currentTime: string;
    isValid: boolean;
  };
  // REMOVED: refreshToken (not in backend response)
}

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  businessName: string;
  ownerName: string; // CHANGED: from firstName/lastName
  email: string;
  password: string;
  timezone: string; // ADDED: required by backend
  currency?: string; // ADDED: optional, defaults to 'GHS'
  // REMOVED: firstName, lastName, phone (not in backend schema)
}
