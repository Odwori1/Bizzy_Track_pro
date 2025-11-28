import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

export interface PurchaseOrder {
  id: string;
  order_number: string;
  supplier_id: string;
  supplier_name: string;
  status: 'draft' | 'sent' | 'confirmed' | 'received' | 'cancelled';
  total_amount: string;
  order_date: string;
  expected_delivery: string;
  items: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: string;
  total_price: string;
}

export const usePurchaseOrders = () => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<PurchaseOrder[]>('/purchase-orders');
      console.log('📋 Purchase orders data:', data);
      setOrders(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err: any) {
      console.error('❌ Error fetching purchase orders:', err);
      setError(err.message || 'Failed to fetch purchase orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  return {
    orders,
    loading,
    error,
    refetch: fetchOrders
  };
};
