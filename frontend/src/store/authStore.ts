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
          const response = await apiClient.login(credentials);
          
          console.log('Login response:', response); // Debug log
          
          // Map backend response to frontend user structure
          const user: User = {
            id: response.user.id,
            email: response.user.email,
            firstName: response.user.fullName?.split(' ')[0] || 'User',
            lastName: response.user.fullName?.split(' ')[1] || '',
            role: response.user.role,
            businessId: response.business.id,
            permissions: [] // Will be populated from backend in future
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
          console.error('Login error:', error);
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true });
        try {
          const response = await apiClient.register(data);
          
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
        // Since we don't have a /me endpoint, we'll check if we have a valid token
        const token = get().token;
        const user = get().user;
        
        if (token && user) {
          set({ isAuthenticated: true });
        } else {
          set({ isAuthenticated: false });
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
