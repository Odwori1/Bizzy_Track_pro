'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { apiClient } from '@/lib/api';
import { useCurrency } from '@/lib/currency'; // ✅ CORRECT IMPORT

interface RecurringInvoice {
  id: string;
  name: string;
  description: string;
  customer_id: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  customer_full_name: string;
  total_amount: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  next_invoice_date: string;
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  start_date: string;
  end_date?: string;
  created_at: string;
}

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_name?: string;
}

const frequencyLabels = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly'
};

const statusColors = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  cancelled: 'bg-red-100 text-red-800',
  completed: 'bg-gray-100 text-gray-800'
};

export default function RecurringInvoicesPage() {
  const [invoices, setInvoices] = useState<RecurringInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newInvoice, setNewInvoice] = useState({
    name: '',
    description: '',
    customer_id: '',
    frequency: 'monthly' as 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    start_date: '',
    next_invoice_date: '',
    total_amount: ''
  });
  const { format } = useCurrency(); // ✅ CORRECT HOOK USAGE

  const fetchRecurringInvoices = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/recurring-invoices');
      console.log('Recurring invoices API response:', response); // Debug log

      // Handle different response structures
      if (response.data && Array.isArray(response.data)) {
        setInvoices(response.data);
      } else if (Array.isArray(response)) {
        setInvoices(response);
      } else {
        setInvoices([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load recurring invoices');
      console.error('Error fetching recurring invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      setCustomersLoading(true);
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
      alert('Failed to load customers: ' + err.message);
    } finally {
      setCustomersLoading(false);
    }
  };

  useEffect(() => {
    fetchRecurringInvoices();
    fetchCustomers();
  }, []);

  const handleCreateRecurringInvoice = async () => {
    try {
      if (!newInvoice.name || !newInvoice.customer_id || !newInvoice.start_date || !newInvoice.total_amount) {
        alert('Please fill in all required fields');
        return;
      }

      const invoiceData = {
        name: newInvoice.name,
        description: newInvoice.description,
        customer_id: newInvoice.customer_id,
        frequency: newInvoice.frequency,
        start_date: newInvoice.start_date,
        next_invoice_date: newInvoice.next_invoice_date || newInvoice.start_date,
        total_amount: parseFloat(newInvoice.total_amount)
      };

      await apiClient.post('/recurring-invoices', invoiceData);

      // Reset form and refresh data
      setNewInvoice({
        name: '',
        description: '',
        customer_id: '',
        frequency: 'monthly',
        start_date: '',
        next_invoice_date: '',
        total_amount: ''
      });
      setShowCreateForm(false);
      await fetchRecurringInvoices();

      alert('Recurring invoice created successfully!');
    } catch (err: any) {
      alert('Failed to create recurring invoice: ' + err.message);
    }
  };

  const filteredInvoices = invoices.filter(invoice =>
    invoice.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (invoice.customer_full_name && invoice.customer_full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (invoice.description && invoice.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const toggleInvoiceStatus = async (invoiceId: string, currentStatus: string) => {
    try {
      if (currentStatus === 'active') {
        // Call pause endpoint
        await apiClient.post(`/recurring-invoices/${invoiceId}/pause`);
      } else if (currentStatus === 'paused') {
        // Call resume endpoint
        await apiClient.post(`/recurring-invoices/${invoiceId}/resume`);
      }
      // Refresh data
      await fetchRecurringInvoices();
    } catch (err) {
      console.error('Failed to update invoice status:', err);
      alert('Failed to update invoice status');
    }
  };

  const calculateMonthlyRevenue = () => {
    return invoices
      .filter(invoice => invoice.status === 'active')
      .reduce((total, invoice) => {
        const amount = parseFloat(invoice.total_amount);
        switch (invoice.frequency) {
          case 'weekly': return total + (amount * 4.33); // Average weeks per month
          case 'monthly': return total + amount;
          case 'quarterly': return total + (amount / 3);
          case 'yearly': return total + (amount / 12);
          default: return total;
        }
      }, 0);
  };

  // Set default dates
  useEffect(() => {
    if (showCreateForm) {
      const today = new Date().toISOString().split('T')[0];
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextMonthStr = nextMonth.toISOString().split('T')[0];

      setNewInvoice(prev => ({
        ...prev,
        start_date: today,
        next_invoice_date: nextMonthStr
      }));
    }
  }, [showCreateForm]);

  // Format date safely
  const formatDateSafely = (dateString: string) => {
    if (!dateString) return 'Invalid Date';
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleDateString();
    } catch {
      return 'Invalid Date';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-lg text-gray-600">Loading recurring invoices...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="text-red-700 font-medium">Error loading recurring invoices</div>
        <div className="text-red-600 text-sm mt-1">{error}</div>
        <Button
          variant="primary"
          className="mt-4"
          onClick={fetchRecurringInvoices}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create Recurring Invoice Form */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="absolute inset-0 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
                <CardHeader className="flex-shrink-0 bg-white border-b">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900">Create Recurring Invoice</h2>
                    <Button variant="outline" onClick={() => setShowCreateForm(false)}>×</Button>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto p-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Invoice Name *
                      </label>
                      <Input
                        required
                        placeholder="e.g., Monthly Maintenance Service"
                        value={newInvoice.name}
                        onChange={(e) => setNewInvoice({...newInvoice, name: e.target.value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <Input
                        placeholder="Describe the recurring service"
                        value={newInvoice.description}
                        onChange={(e) => setNewInvoice({...newInvoice, description: e.target.value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer *
                      </label>
                      {customersLoading ? (
                        <div className="text-gray-500">Loading customers...</div>
                      ) : customers.length === 0 ? (
                        <div className="text-red-600 bg-red-50 p-3 rounded border">
                          No customers found. Please create customers first before creating recurring invoices.
                          <Link href="/dashboard/management/customers" className="block mt-2">
                            <Button variant="primary" size="sm">
                              Go to Customers
                            </Button>
                          </Link>
                        </div>
                      ) : (
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={newInvoice.customer_id}
                          onChange={(e) => setNewInvoice({...newInvoice, customer_id: e.target.value})}
                          required
                        >
                          <option value="">Select a customer</option>
                          {customers.map(customer => (
                            <option key={customer.id} value={customer.id}>
                              {customer.first_name} {customer.last_name} {customer.company_name ? `(${customer.company_name})` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Frequency *
                        </label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={newInvoice.frequency}
                          onChange={(e) => setNewInvoice({...newInvoice, frequency: e.target.value as any})}
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
                          placeholder="0.00"
                          value={newInvoice.total_amount}
                          onChange={(e) => setNewInvoice({...newInvoice, total_amount: e.target.value})}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Start Date *
                        </label>
                        <Input
                          type="date"
                          value={newInvoice.start_date}
                          onChange={(e) => setNewInvoice({...newInvoice, start_date: e.target.value})}
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Next Invoice Date
                        </label>
                        <Input
                          type="date"
                          value={newInvoice.next_invoice_date}
                          onChange={(e) => setNewInvoice({...newInvoice, next_invoice_date: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="flex gap-4 pt-4 border-t">
                      <Button
                        variant="primary"
                        onClick={handleCreateRecurringInvoice}
                        disabled={!newInvoice.name || !newInvoice.customer_id || !newInvoice.start_date || !newInvoice.total_amount || customers.length === 0}
                      >
                        Create Recurring Invoice
                      </Button>
                      <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recurring Invoices</h1>
          <p className="text-gray-600">Manage automated recurring invoices</p>
        </div>
        <div className="flex space-x-4">
          <Button
            variant="primary"
            onClick={() => setShowCreateForm(true)}
          >
            Create Recurring Invoice
          </Button>
          <Link href="/dashboard/management/invoices">
            <Button variant="secondary">
              Back to Invoices
            </Button>
          </Link>
        </div>
      </div>

      {/* Debug info for recurring invoices */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-6">
            <div className="text-yellow-800 text-sm">
              <strong>Debug Info:</strong> {invoices.length} recurring invoices found in state
              {invoices.length > 0 && (
                <div className="mt-2">
                  Invoice names: {invoices.map(i => i.name).join(', ')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{invoices.length}</div>
              <div className="text-gray-600">Total</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {invoices.filter(i => i.status === 'active').length}
              </div>
              <div className="text-gray-600">Active</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {invoices.filter(i => i.status === 'paused').length}
              </div>
              <div className="text-gray-600">Paused</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {format(calculateMonthlyRevenue())} {/* ✅ CORRECT: Using format function */}
              </div>
              <div className="text-gray-600">Monthly Revenue</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search recurring invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSearchTerm('')}>
                All
              </Button>
              <Button variant="outline">
                Active Only
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recurring Invoices List */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">
            Recurring Invoices ({filteredInvoices.length})
          </h2>
        </CardHeader>
        <CardContent>
          {filteredInvoices.length === 0 && invoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No recurring invoices created yet
            </div>
          ) : filteredInvoices.length === 0 && invoices.length > 0 ? (
            <div className="text-center py-8 text-gray-500">
              No recurring invoices match your search
            </div>
          ) : (
            <div className="space-y-4">
              {filteredInvoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <h3 className="font-semibold text-gray-900">{invoice.name}</h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[invoice.status]}`}>
                        {invoice.status.toUpperCase()}
                      </span>
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        {frequencyLabels[invoice.frequency]}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>Customer: {invoice.customer_full_name} ({invoice.customer_email})</p>
                      <p>Amount: {format(parseFloat(invoice.total_amount))} • Next: {formatDateSafely(invoice.next_invoice_date)}</p> {/* ✅ CORRECT: Using format function */}
                      {invoice.description && <p>Description: {invoice.description}</p>}
                      <p>Started: {formatDateSafely(invoice.start_date)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {invoice.status === 'active' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleInvoiceStatus(invoice.id, invoice.status)}
                      >
                        Pause
                      </Button>
                    ) : invoice.status === 'paused' ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => toggleInvoiceStatus(invoice.id, invoice.status)}
                      >
                        Resume
                      </Button>
                    ) : null}
                    <Link href={`/dashboard/management/invoices/recurring/${invoice.id}/edit`}>
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    </Link>
                    <Button variant="danger" size="sm">
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
