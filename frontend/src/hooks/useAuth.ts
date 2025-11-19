'use client';

import { useAuthStore } from '@/store/authStore';

// Re-export everything from the store with the hook interface
export const useAuth = () => {
  const { 
    user, 
    isAuthenticated, 
    loading, 
    error, 
    login, 
    register, 
    logout, 
    clearError,
    checkAuth  // Add this missing function
  } = useAuthStore();

  return {
    user,
    isAuthenticated,
    loading,
    error,
    login,
    register,
    logout,
    clearError,
    checkAuth,  // Now it will be available
  };
};
