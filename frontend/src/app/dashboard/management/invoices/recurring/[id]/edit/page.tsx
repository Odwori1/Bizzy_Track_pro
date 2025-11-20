'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { apiClient } from '@/lib/api';

interface RecurringInvoice {
  id: string;
  name: string;
  description: string;
  customer_id: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  total_amount: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  start_date: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  next_invoice_date: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  status: 'active' | 'paused' | 'cancelled';
}

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_name?: string;
}

export default function EditRecurringInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<RecurringInvoice | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    customer_id: '',
    frequency: 'monthly' as 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    total_amount: '',
    start_date: '',
    next_invoice_date: '',
    status: 'active' as 'active' | 'paused' | 'cancelled'
  });

  useEffect(() => {
    fetchInvoice();
    fetchCustomers();
  }, [invoiceId]);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 Fetching invoice with ID:', invoiceId);
      
      // Use the single recurring invoice endpoint
      const response = await apiClient.get(`/recurring-invoices/${invoiceId}`);
      
      console.log('🔍 Full API Response:', response);

      // Handle the API response - the apiClient might return the data directly
      let invoiceData;

      if (response && response.data) {
        // Case 1: { data: { ... } } structure
        invoiceData = response.data;
      } else if (response && response.id) {
        // Case 2: Direct invoice object
        invoiceData = response;
      } else {
        // Case 3: Response is the invoice data directly
        invoiceData = response;
      }

      console.log('🔍 Extracted invoice data:', invoiceData);

      // Validate that we have the required data
      if (!invoiceData || !invoiceData.id) {
        console.error('❌ Invalid invoice data received:', invoiceData);
        throw new Error('Invalid invoice data received from server');
      }

      setInvoice(invoiceData);
      setFormData({
        name: invoiceData.name || '',
        description: invoiceData.description || '',
        customer_id: invoiceData.customer_id || '',
        frequency: invoiceData.frequency || 'monthly',
        total_amount: invoiceData.total_amount || '',
        // Extract date string from the date object for input fields
        start_date: invoiceData.start_date?.iso_local?.split('T')[0] || '',
        next_invoice_date: invoiceData.next_invoice_date?.iso_local?.split('T')[0] || '',
        status: invoiceData.status || 'active'
      });

      console.log('✅ Form data set successfully');

    } catch (err: any) {
      console.error('❌ Error fetching recurring invoice:', err);
      console.error('❌ Error details:', err.response || err.message);
      setError('Failed to load recurring invoice: ' + (err.message || 'Check console for details'));
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await apiClient.get('/customers');
      // Handle the API response structure - data is in response.data array
      if (response.data && Array.isArray(response.data)) {
        setCustomers(response.data);
      } else if (Array.isArray(response)) {
        setCustomers(response);
      } else {
        setCustomers([]);
      }
    } catch (err: any) {
      console.error('Error fetching customers:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);

      const updateData = {
        ...formData,
        total_amount: parseFloat(formData.total_amount)
      };

      console.log('📤 Sending update data:', updateData);

      // Send update request
      const response = await apiClient.put(`/recurring-invoices/${invoiceId}`, updateData);
      
      console.log('📥 Update response:', response);
      
      // Handle the response structure - backend returns { success: true, message: "...", data: {...} }
      if (response && response.success === true) {
        console.log('✅ Update successful');
        
        // Show success message
        alert(response.message || 'Recurring invoice updated successfully!');
        
        // Redirect back to recurring invoices page
        router.push('/dashboard/management/invoices/recurring');
        router.refresh();
        
      } else {
        // Handle unexpected response structure
        console.warn('⚠️ Unexpected response structure:', response);
        throw new Error(response?.message || 'Update failed - unexpected response');
      }
      
    } catch (err: any) {
      console.error('❌ Error updating invoice:', err);
      console.error('❌ Error details:', err.response || err.message);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to update recurring invoice';
      
      if (err.message?.includes('network') || err.message?.includes('fetch')) {
        errorMessage = 'Network error - please check your connection';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-lg text-gray-600">Loading recurring invoice...</div>
      </div>
    );
  }

  if (error && !invoice) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="text-red-700 font-medium">Error</div>
        <div className="text-red-600 text-sm mt-1">{error}</div>
        <div className="flex gap-4 mt-4">
          <Button variant="primary" onClick={fetchInvoice}>
            Retry
          </Button>
          <Link href="/dashboard/management/invoices/recurring">
            <Button variant="secondary">
              Back to Recurring Invoices
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Recurring Invoice</h1>
          <p className="text-gray-600">Update recurring invoice details</p>
        </div>
        <Link href="/dashboard/management/invoices/recurring">
          <Button variant="secondary">
            Back to Recurring Invoices
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-red-700 text-sm">{error}</div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Name *
                </label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer *
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.customer_id}
                  onChange={(e) => handleChange('customer_id', e.target.value)}
                  required
                >
                  <option value="">Select a customer</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.first_name} {customer.last_name}
                      {customer.company_name ? ` (${customer.company_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frequency *
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.frequency}
                  onChange={(e) => handleChange('frequency', e.target.value)}
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={formData.total_amount}
                  onChange={(e) => handleChange('total_amount', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date *
                </label>
                <Input
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={(e) => handleChange('start_date', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Next Invoice Date *
                </label>
                <Input
                  type="date"
                  required
                  value={formData.next_invoice_date}
                  onChange={(e) => handleChange('next_invoice_date', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.status}
                  onChange={(e) => handleChange('status', e.target.value as any)}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Describe the recurring service..."
              />
            </div>

            <div className="flex gap-4 pt-4 border-t">
              <Button
                type="submit"
                variant="primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Update Recurring Invoice'}
              </Button>
              <Link href="/dashboard/management/invoices/recurring">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
