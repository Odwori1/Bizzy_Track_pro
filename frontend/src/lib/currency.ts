// src/lib/currency.ts - CORRECTED VERSION
import { useAuthStore } from '@/store/authStore';

// Dynamic currency formatting using business context
export const formatCurrency = (
  amount: number | string | null | undefined,
  business: any | null = null
): string => {
  if (amount === null || amount === undefined) return '';
  
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) return '';
  
  // Get currency from business or use fallback from auth store
  const currencySymbol = business?.currencySymbol || 
                        useAuthStore.getState().business?.currencySymbol || 
                        'USh';
  
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(numericAmount);
  
  return `${currencySymbol} ${formatted}`;
};

// Hook for components
export const useCurrency = () => {
  const { business } = useAuthStore();
  
  const format = (amount: number | string | null | undefined, customBusiness?: any) => {
    return formatCurrency(amount, customBusiness || business);
  };
  
  return { format };
};
