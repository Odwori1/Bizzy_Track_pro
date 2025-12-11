import { ApiResponse, ApiError } from '@/types/api';
import { cleanParams, cleanValue } from './api-utils';

class ApiClient {
  private baseURL: string;
  private defaultHeaders: HeadersInit;

  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // FIX: Ensure endpoint starts with /api
    const fullEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
    const url = `${this.baseURL}${fullEndpoint}`;

    console.log('API Request:', {
      url,
      endpoint: fullEndpoint,
      method: options.method
    });

    // FIX: Public endpoints that should NEVER have tokens
    const publicEndpoints = ['/api/businesses/register', '/api/businesses/login', '/api/staff/login'];
    const isPublicEndpoint = publicEndpoints.some(publicEndpoint =>
      fullEndpoint.includes(publicEndpoint)
    );

    // Only get token for protected endpoints
    const token = !isPublicEndpoint && typeof window !== 'undefined'
      ? localStorage.getItem('token')
      : null;

    const headers: HeadersInit = {
      ...this.defaultHeaders,
      ...options.headers,
    };

    // Only add Authorization header if we have a token AND it's not a public endpoint
    if (token && !isPublicEndpoint) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      console.log('API Response:', {
        url,
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type')
      });

      // Handle non-JSON responses
      if (!response.ok) {
        if (response.status === 401) {
          throw new ApiError(401, 'Authentication required');
        }
        throw new ApiError(response.status, `HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new ApiError(response.status, 'Invalid response format');
      }

      const data = await response.json();
      console.log('API Response Data:', data);

      // FIX: Handle different response formats
      // Backend might return { success: true, data: {...} } OR direct object
      if (data.success === false) {
        throw new ApiError(response.status, data.error || data.message || 'Request failed');
      }

      // If backend returns { success: true, data: {...} } return data.data
      // If backend returns direct object, return the object
      return data.data !== undefined ? data.data : data;

    } catch (error) {
      console.error('API Request failed:', error);
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Network error occurred');
    }
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    // Clean parameters before sending
    const cleanedParams = cleanParams(params || {});
    const queryString = Object.keys(cleanedParams).length > 0 
      ? '?' + new URLSearchParams(cleanedParams as Record<string, string>).toString()
      : '';
    
    console.log('GET request with cleaned params:', { endpoint, cleanedParams });
    
    return this.request<T>(endpoint + queryString, {
      method: 'GET',
    });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    // Clean data before sending
    const cleanedData = cleanParams(data || {});
    
    console.log('POST request with cleaned data:', { endpoint, cleanedData });
    
    return this.request<T>(endpoint, {
      method: 'POST',
      body: Object.keys(cleanedData).length > 0 ? JSON.stringify(cleanedData) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    // Clean data before sending
    const cleanedData = cleanParams(data || {});
    
    console.log('PUT request with cleaned data:', { endpoint, cleanedData });
    
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: Object.keys(cleanedData).length > 0 ? JSON.stringify(cleanedData) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: any): Promise<T> {
    // Clean data before sending
    const cleanedData = cleanParams(data || {});
    
    console.log('PATCH request with cleaned data:', { endpoint, cleanedData });
    
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: Object.keys(cleanedData).length > 0 ? JSON.stringify(cleanedData) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  // Add these methods INSIDE the ApiClient class, after the existing methods
  async getAccountingProfitLoss(startDate: string, endDate: string): Promise<any> {
    return this.get('/accounting/profit-loss', {
      start_date: startDate,
      end_date: endDate
    });
  }

  async getJournalEntries(params?: {
    limit?: number;
    page?: number;
    start_date?: string;
    end_date?: string;
    reference_type?: string;
  }): Promise<any> {
    return this.get('/accounting/journal-entries', params);
  }

  async getTrialBalance(asOfDate?: string): Promise<any> {
    const params: any = {};
    if (asOfDate) {
      params.as_of_date = asOfDate;
    }
    return this.get('/accounting/trial-balance', params);
  }

  async getGeneralLedger(accountCode: string, params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<any> {
    const queryParams: any = {};
    if (params?.start_date) queryParams.start_date = params.start_date;
    if (params?.end_date) queryParams.end_date = params.end_date;

    return this.get(`/accounting/general-ledger/${accountCode}`, queryParams);
  }
}

export const apiClient = new ApiClient();

// ============================================
// ACCOUNTING API METHODS (Standalone exports)
// ============================================

export const accountingApi = {
  getProfitLoss: async (startDate: string, endDate: string) => {
    return apiClient.getAccountingProfitLoss(startDate, endDate);
  },

  getJournalEntries: async (params?: any) => {
    return apiClient.getJournalEntries(params);
  },

  getTrialBalance: async (asOfDate?: string) => {
    return apiClient.getTrialBalance(asOfDate);
  },

  getGeneralLedger: async (accountCode: string, params?: any) => {
    return apiClient.getGeneralLedger(accountCode, params);
  },
};
