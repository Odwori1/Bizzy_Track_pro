import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/lib/api';
import { User, AuthResponse, LoginData, RegisterData, Business } from '@/types/auth';

interface AuthState {
  user: User | null;
  business: Business | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (credentials: LoginData, isStaffLogin?: boolean) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      business: null,
      isAuthenticated: false,
      loading: false,
      error: null,

      // FIXED: Works with apiClient unwrapping response.data
      login: async (credentials: LoginData, isStaffLogin: boolean = false) => {
        set({ loading: true, error: null });
        console.log('🔐 Login attempt:', { email: credentials.email, isStaffLogin });

        try {
          let endpoint = '/businesses/login';
          if (isStaffLogin) {
            endpoint = '/staff/login';
            console.log('🔄 Using staff login endpoint:', endpoint);
          }

          // apiClient returns the UNWRAPPED data (just the "data" part)
          const responseData = await apiClient.post<any>(endpoint, credentials);

          console.log('📥 apiClient response (unwrapped data):', responseData);

          // Check if we have the required data
          if (!responseData) {
            throw new Error('No response data received');
          }

          // For staff login, responseData should contain: user, business, token
          // For business login, responseData might be different
          const userData = responseData.user || responseData;
          const businessData = responseData.business;
          const token = responseData.token;

          console.log('🔍 Extracted from response:', {
            userData: userData ? 'Present' : 'Missing',
            businessData: businessData ? 'Present' : 'Missing',
            token: token ? 'Present' : 'Missing'
          });

          if (!token) {
            throw new Error('No authentication token received from server');
          }

          if (!userData.id || !userData.email) {
            throw new Error('Invalid user data received');
          }

          const transformedUser: User = {
            id: userData.id,
            email: userData.email,
            fullName: userData.full_name || userData.fullName || userData.email.split('@')[0],
            role: userData.role || 'staff',
            businessId: userData.business_id || (businessData?.id),
            permissions: [],
            timezone: userData.timezone || 'UTC',
            isStaff: isStaffLogin || userData.is_staff || false
          };

          console.log('✅ Transformed user:', transformedUser);

          localStorage.setItem('token', token);
          localStorage.setItem('user_type', isStaffLogin ? 'staff' : 'business');

          set({
            user: transformedUser,
            business: businessData || null,
            isAuthenticated: true,
            loading: false,
            error: null
          });

          console.log('🎉 Login successful!');
          return;

        } catch (error: any) {
          console.error('💥 Login error:', {
            message: error.message,
            name: error.name,
            stack: error.stack
          });

          let errorMessage = 'Login failed. Please check your credentials.';

          if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
            errorMessage = 'Cannot connect to server. Please check if backend is running.';
          } else if (error.message.includes('401') || error.message.includes('Invalid email or password')) {
            errorMessage = 'Invalid email or password.';
          } else if (error.message) {
            errorMessage = error.message;
          }

          set({
            error: errorMessage,
            loading: false
          });

          throw new Error(errorMessage);
        }
      },

      register: async (userData: RegisterData) => {
        set({ loading: true, error: null });
        try {
          // apiClient unwraps the response.data
          const responseData = await apiClient.post<any>('/businesses/register', userData);

          const userDataFromResponse = responseData.user || responseData;
          const businessData = responseData.business;
          const token = responseData.token;

          if (!token) {
            throw new Error('No token received from server');
          }

          const transformedUser: User = {
            id: userDataFromResponse.id,
            email: userDataFromResponse.email,
            fullName: userDataFromResponse.fullName || userDataFromResponse.full_name,
            role: userDataFromResponse.role,
            businessId: userDataFromResponse.business_id || businessData?.id,
            permissions: [],
            timezone: userDataFromResponse.timezone || 'UTC',
            isStaff: false
          };

          localStorage.setItem('token', token);
          localStorage.setItem('user_type', 'business');

          set({
            user: transformedUser,
            business: businessData || null,
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
        localStorage.removeItem('user_type');
        set({
          user: null,
          business: null,
          isAuthenticated: false,
          loading: false,
          error: null
        });
        console.log('👋 User logged out');
      },

      clearError: () => set({ error: null }),

      checkAuth: async () => {
        const token = localStorage.getItem('token');
        const userType = localStorage.getItem('user_type');
        
        console.log('🔐 checkAuth called:', { 
          hasToken: !!token, 
          userType
        });

        if (!token) {
          set({ isAuthenticated: false, user: null, business: null, loading: false });
          return;
        }

        set({ loading: true });
        
        // Simple JWT token validation (just check format)
        try {
          const tokenParts = token.split('.');
          if (tokenParts.length === 3) {
            // Valid JWT format
            console.log('✅ Token format valid, user authenticated');
            set({ isAuthenticated: true, loading: false });
          } else {
            throw new Error('Invalid token format');
          }
        } catch (error) {
          console.log('❌ Token invalid, logging out');
          localStorage.removeItem('token');
          localStorage.removeItem('user_type');
          set({
            isAuthenticated: false,
            user: null,
            business: null,
            loading: false
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        business: state.business,
        isAuthenticated: state.isAuthenticated
      }),
    }
  )
);
