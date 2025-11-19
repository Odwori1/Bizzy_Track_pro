import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/lib/api';
import { User, LoginData, RegisterData } from '@/types/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  business: any | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      business: null,
      isLoading: false,
      isAuthenticated: false,

      setLoading: (loading: boolean) => set({ isLoading: loading }),

      login: async (credentials: LoginData) => {
        set({ isLoading: true });
        try {
          const response = await apiClient.request('/api/businesses/login', {
            method: 'POST',
            body: JSON.stringify(credentials),
          });

          const user: User = {
            id: response.user.id,
            email: response.user.email,
            firstName: response.user.fullName?.split(' ')[0] || 'User',
            lastName: response.user.fullName?.split(' ')[1] || '',
            role: response.user.role,
            businessId: response.business.id,
            permissions: []
          };

          set({
            user,
            token: response.token,
            business: response.business,
            isAuthenticated: true,
            isLoading: false,
          });

          if (typeof window !== 'undefined') {
            localStorage.setItem('auth_token', response.token);
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true });
        try {
          const response = await apiClient.request('/api/businesses/register', {
            method: 'POST',
            body: JSON.stringify(data),
          });

          const user: User = {
            id: response.user.id,
            email: response.user.email,
            firstName: response.user.firstName || data.firstName,
            lastName: response.user.lastName || data.lastName,
            role: response.user.role,
            businessId: response.business.id,
            permissions: []
          };

          set({
            user,
            token: response.token,
            business: response.business,
            isAuthenticated: true,
            isLoading: false,
          });

          if (typeof window !== 'undefined') {
            localStorage.setItem('auth_token', response.token);
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          business: null,
          isAuthenticated: false,
        });

        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token');
        }
      },

      checkAuth: async () => {
        const token = get().token || (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
        
        if (!token) {
          set({ isAuthenticated: false });
          return;
        }

        try {
          set({ isLoading: true });
          
          // Verify token with backend by making a simple request
          const response = await apiClient.request('/api/businesses/me', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (response && response.user) {
            const user: User = {
              id: response.user.id,
              email: response.user.email,
              firstName: response.user.fullName?.split(' ')[0] || 'User',
              lastName: response.user.fullName?.split(' ')[1] || '',
              role: response.user.role,
              businessId: response.business?.id,
              permissions: []
            };

            set({
              user,
              token,
              business: response.business,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            throw new Error('Invalid user data');
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          set({
            user: null,
            token: null,
            business: null,
            isAuthenticated: false,
            isLoading: false,
          });
          
          if (typeof window !== 'undefined') {
            localStorage.removeItem('auth_token');
          }
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        business: state.business,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
