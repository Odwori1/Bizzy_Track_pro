import { ApiResponse, ApiError } from '@/types/api';

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
    const publicEndpoints = ['/api/businesses/register', '/api/businesses/login'];
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

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<T>(endpoint + queryString, {
      method: 'GET',
    });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }
}

export const apiClient = new ApiClient();
