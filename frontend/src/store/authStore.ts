import { create } from 'zustand';
import { apiClient } from '@/lib/api';
import { User, AuthResponse, LoginData, RegisterData, Business } from '@/types/auth';

interface AuthState {
  user: User | null;
  business: Business | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (credentials: LoginData) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  business: null,
  isAuthenticated: false,
  loading: false,
  error: null,

  login: async (credentials: LoginData) => {
    set({ loading: true, error: null });
    try {
      const result = await apiClient.post<AuthResponse>('/businesses/login', credentials);
      
      // FIX: Handle both response formats
      const response = result as any;
      const { user, business, token, timezoneInfo } = response;

      const transformedUser: User = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        businessId: user.business_id || business.id,
        permissions: [],
        timezone: user.timezone
      };

      localStorage.setItem('token', token);
      set({
        user: transformedUser,
        business,
        isAuthenticated: true,
        loading: false
      });
    } catch (error: any) {
      set({
        error: error.message || 'Login failed',
        loading: false
      });
      throw error;
    }
  },

  register: async (userData: RegisterData) => {
    set({ loading: true, error: null });
    try {
      const result = await apiClient.post<AuthResponse>('/businesses/register', userData);
      
      // FIX: Handle both response formats
      const response = result as any;
      const { user, business, token, timezoneInfo } = response;

      const transformedUser: User = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        businessId: user.business_id || business.id,
        permissions: [],
        timezone: user.timezone
      };

      localStorage.setItem('token', token);
      set({
        user: transformedUser,
        business,
        isAuthenticated: true,
        loading: false
      });
    } catch (error: any) {
      set({
        error: error.message || 'Registration failed',
        loading: false
      });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({
      user: null,
      business: null,
      isAuthenticated: false
    });
  },

  clearError: () => set({ error: null }),

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isAuthenticated: false, user: null, business: null });
      return;
    }

    set({ loading: true });
    try {
      // You might want to add a verify-token endpoint or use current user endpoint
      const response = await apiClient.get('/businesses/profile');
      // Handle profile response if needed
      set({ isAuthenticated: true, loading: false });
    } catch (error) {
      localStorage.removeItem('token');
      set({ isAuthenticated: false, user: null, business: null, loading: false });
    }
  },
}));
