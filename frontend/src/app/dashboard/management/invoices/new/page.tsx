'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Link from 'next/link';
import { apiClient } from '@/lib/api';

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface Service {
  id: string;
  name: string;
  base_price: string;
  duration_minutes: number;
}

interface Job {
  id: string;
  job_number: string;
  title: string;
  customer_id: string;
}

interface LineItem {
  service_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

interface InvoiceFormData {
  job_id?: string;
  customer_id: string;
  due_date: string;
  notes?: string;
  terms?: string;
  line_items: LineItem[];
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [formData, setFormData] = useState<InvoiceFormData>({
    customer_id: '',
    due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: '',
    terms: 'Payment due in 30 days',
    line_items: [
      {
        description: '',
        quantity: 1,
        unit_price: 0,
        tax_rate: 0
      }
    ]
  });

  // Fetch data on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setDataLoading(true);

        // Fetch customers, services, and jobs in parallel
        const [customersData, servicesData, jobsData] = await Promise.all([
          apiClient.get<Customer[]>('/api/customers'),
          apiClient.get<Service[]>('/api/services'),
          apiClient.get<Job[]>('/api/jobs')
        ]);

        setCustomers(customersData || []);
        setServices(servicesData || []);
        setJobs(jobsData || []);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('Failed to load required data');
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Prepare the data for API (matching backend expectations)
      const invoiceData = {
        job_id: formData.job_id || undefined,
        customer_id: formData.customer_id,
        due_date: new Date(formData.due_date + 'T12:00:00Z').toISOString(),
        notes: formData.notes || undefined,
        terms: formData.terms || undefined,
        line_items: formData.line_items
      };

      console.log('Submitting invoice creation:', invoiceData);

      const result = await apiClient.post('/api/invoices', invoiceData);

      if (result) {
        // Redirect to invoices list on success
        router.push('/dashboard/management/invoices');
        router.refresh();
      }
    } catch (err: any) {
      console.error('Invoice creation error:', err);
      setError(err.message || 'Failed to create invoice. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Handle line item changes
  const handleLineItemChange = (index: number, field: keyof LineItem, value: any) => {
    const updatedLineItems = [...formData.line_items];
    updatedLineItems[index] = {
      ...updatedLineItems[index],
      [field]: value
    };
    setFormData({ ...formData, line_items: updatedLineItems });
  };

  // Add new line item
  const addLineItem = () => {
    setFormData({
      ...formData,
      line_items: [
        ...formData.line_items,
        { description: '', quantity: 1, unit_price: 0, tax_rate: 0 }
      ]
    });
  };

  // Remove line item
  const removeLineItem = (index: number) => {
    if (formData.line_items.length > 1) {
      const updatedLineItems = formData.line_items.filter((_, i) => i !== index);
      setFormData({ ...formData, line_items: updatedLineItems });
    }
  };

  // Auto-fill service details when service is selected
  const handleServiceSelect = (index: number, serviceId: string) => {
    const selectedService = services.find(s => s.id === serviceId);
    if (selectedService) {
      const updatedLineItems = [...formData.line_items];
      updatedLineItems[index] = {
        ...updatedLineItems[index],
        service_id: serviceId,
        description: selectedService.name,
        unit_price: parseFloat(selectedService.base_price),
        quantity: 1
      };
      setFormData({ ...formData, line_items: updatedLineItems });
    }
  };

  // Calculate totals
  const calculateTotals = () => {
    return formData.line_items.reduce((total, item) => {
      const itemTotal = item.quantity * item.unit_price;
      const taxAmount = itemTotal * (item.tax_rate / 100);
      return total + itemTotal + taxAmount;
    }, 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create New Invoice</h1>
          <p className="text-gray-600">Create a new invoice for your customer</p>
        </div>
        <Link href="/dashboard/management/invoices">
          <Button variant="secondary" disabled={loading}>
            Back to Invoices
          </Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm font-medium">Error</div>
          <div className="text-red-700 text-sm mt-1">{error}</div>
        </div>
      )}

      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Invoice Details</h2>

          {dataLoading ? (
            <div className="text-center py-8">
              <div className="text-gray-500">Loading customers, services, and jobs...</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Customer and Due Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="customer_id" className="block text-sm font-medium text-gray-700">
                    Customer *
                  </label>
                  <select
                    id="customer_id"
                    name="customer_id"
                    value={formData.customer_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    required
                    disabled={loading || customers.length === 0}
                  >
                    <option value="">Select a customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.first_name} {customer.last_name} ({customer.email})
                      </option>
                    ))}
                  </select>
                  {customers.length === 0 && !dataLoading && (
                    <p className="text-sm text-yellow-600">No customers found. Please create customers first.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="due_date" className="block text-sm font-medium text-gray-700">
                    Due Date *
                  </label>
                  <Input
                    type="date"
                    id="due_date"
                    name="due_date"
                    value={formData.due_date}
                    onChange={handleChange}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Job Selection (Optional) */}
              <div className="space-y-2">
                <label htmlFor="job_id" className="block text-sm font-medium text-gray-700">
                  Related Job (Optional)
                </label>
                <select
                  id="job_id"
                  name="job_id"
                  value={formData.job_id || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  disabled={loading || jobs.length === 0}
                >
                  <option value="">No job selected</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.job_number} - {job.title}
                    </option>
                  ))}
                </select>
                {jobs.length === 0 && !dataLoading && (
                  <p className="text-sm text-yellow-600">No jobs found. Create jobs to link them to invoices.</p>
                )}
              </div>

              {/* Line Items */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900">Line Items</h3>
                  <Button type="button" onClick={addLineItem} variant="outline" size="sm">
                    Add Item
                  </Button>
                </div>

                {formData.line_items.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Service Selection */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Service
                        </label>
                        <select
                          value={item.service_id || ''}
                          onChange={(e) => handleServiceSelect(index, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select Service</option>
                          {services.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name} (${service.base_price})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Description */}
                      <div className="space-y-2 lg:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Description *
                        </label>
                        <Input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                          placeholder="Item description"
                          required
                        />
                      </div>

                      {/* Quantity */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Quantity
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleLineItemChange(index, 'quantity', parseInt(e.target.value))}
                        />
                      </div>

                      {/* Unit Price */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Unit Price ($)
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => handleLineItemChange(index, 'unit_price', parseFloat(e.target.value))}
                        />
                      </div>

                      {/* Tax Rate */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Tax Rate (%)
                        </label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={item.tax_rate}
                          onChange={(e) => handleLineItemChange(index, 'tax_rate', parseFloat(e.target.value))}
                        />
                      </div>

                      {/* Item Total */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Item Total
                        </label>
                        <div className="px-3 py-2 bg-gray-50 rounded-md border border-gray-200">
                          ${((item.quantity * item.unit_price) * (1 + item.tax_rate / 100)).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Remove button for extra items */}
                    {formData.line_items.length > 1 && (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          variant="outline"
                          size="sm"
                        >
                          Remove Item
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Notes and Terms */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Additional notes for the invoice"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="terms" className="block text-sm font-medium text-gray-700">
                    Terms & Conditions
                  </label>
                  <textarea
                    id="terms"
                    name="terms"
                    value={formData.terms}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Payment terms and conditions"
                  />
                </div>
              </div>

              {/* Total Display */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold">Total Amount:</span>
                  <span className="text-xl font-bold text-green-600">
                    ${calculateTotals().toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end space-x-4 pt-6 border-t">
                <Link href="/dashboard/management/invoices">
                  <Button type="button" variant="secondary" disabled={loading}>
                    Cancel
                  </Button>
                </Link>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading || !formData.customer_id || formData.line_items.some(item => !item.description)}
                >
                  {loading ? 'Creating Invoice...' : 'Create Invoice'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
