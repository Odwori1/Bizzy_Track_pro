import { config } from './config';
import { ApiResponse, ApiError } from '@/types/api';

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.api.baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(response.status, errorText);
    }

    const data: ApiResponse<T> = await response.json();
    
    if (!data.success) {
      throw new ApiError(response.status, data.message);
    }

    return data.data as T;
  }

  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auth_token');
    }
    return null;
  }

  // Auth endpoints - match backend response exactly
  async login(credentials: { email: string; password: string }) {
    return this.request<{ 
      user: {
        id: string;
        email: string;
        fullName: string;
        role: string;
        timezone: string;
      };
      business: {
        id: string;
        name: string;
        currency: string;
        currencySymbol: string;
        timezone: string;
      };
      token: string;
      timezoneInfo: any;
    }>('/api/businesses/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async register(data: any) {
    return this.request<{ 
      user: any; 
      token: string;
      business: any;
    }>('/api/businesses/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // We don't have a /me endpoint, so we'll remove this for now
}

export const apiClient = new ApiClient();
