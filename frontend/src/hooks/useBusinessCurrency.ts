import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

export function useBusinessCurrency() {
  const [currencySymbol, setCurrencySymbol] = useState('$'); // Default fallback
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getBusinessCurrency = async () => {
      try {
        const response = await apiClient.get('/api/businesses/current');
        if (response?.data?.currencySymbol) {
          setCurrencySymbol(response.data.currencySymbol);
        } else if (response?.data?.currency) {
          // Fallback: map currency code to symbol
          const symbolMap: Record<string, string> = {
            'UGX': 'Ush',
            'USD': '$',
            'EUR': '€',
            'GBP': '£',
            'KES': 'KSh',
            'GHS': 'GH₵',
            'NGN': '₦'
          };
          setCurrencySymbol(symbolMap[response.data.currency] || '$');
        }
      } catch (error) {
        console.log('Using default currency symbol');
      } finally {
        setLoading(false);
      }
    };

    getBusinessCurrency();
  }, []);

  const formatCurrency = (amount: string | number) => {
    const numericAmount = typeof amount === 'string' ? parseFloat(amount || '0') : amount;
    return `${currencySymbol} ${numericAmount.toLocaleString()}`;
  };

  return { currencySymbol, formatCurrency, loading };
}
