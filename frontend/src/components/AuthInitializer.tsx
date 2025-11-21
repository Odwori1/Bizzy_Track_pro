'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

export function AuthInitializer() {
  const checkAuth = useAuthStore(state => state.checkAuth);

  useEffect(() => {
    // Initialize auth state when component mounts
    checkAuth();
  }, [checkAuth]);

  return null;
}
