'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCustomerStore } from '@/store/customerStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';

export default function EditCustomerPage() {
  const router = useRouter();
  const params = useParams();
  const customerId = params.customerId as string;
  
  const { selectedCustomer, customerCategories, loading, actions } = useCustomerStore();
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company_name: '',
    tax_number: '',
    category_id: '',
    address: {
      street: '',
      city: '',
      state: '',
      postal_code: '',
      country: ''
    },
    notes: '',
    is_active: true
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (customerId) {
      actions.fetchCustomer(customerId);
      actions.fetchCustomerCategories();
    }
  }, [customerId, actions]);

  // Populate form when customer data is loaded
  useEffect(() => {
    if (selectedCustomer) {
      setFormData({
        first_name: selectedCustomer.first_name || '',
        last_name: selectedCustomer.last_name || '',
        email: selectedCustomer.email || '',
        phone: selectedCustomer.phone || '',
        company_name: selectedCustomer.company_name || '',
        tax_number: selectedCustomer.tax_number || '',
        category_id: selectedCustomer.category_id || '',
        address: selectedCustomer.address || {
          street: '',
          city: '',
          state: '',
          postal_code: '',
          country: ''
        },
        notes: selectedCustomer.notes || '',
        is_active: selectedCustomer.is_active
      });
    }
  }, [selectedCustomer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Clean up empty address fields
      const cleanedAddress = Object.fromEntries(
        Object.entries(formData.address).filter(([_, value]) => value !== '')
      );

      const customerData = {
        ...formData,
        address: Object.keys(cleanedAddress).length > 0 ? cleanedAddress : null
      };

      await actions.updateCustomer(customerId, customerData);
      router.push('/dashboard/management/customers');
    } catch (error) {
      console.error('Failed to update customer:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name.startsWith('address.')) {
      const addressField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  if (loading && !selectedCustomer) {
    return <Loading />;
  }

  if (!selectedCustomer) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Customer not found</div>
        <Link href="/dashboard/management/customers">
          <Button className="mt-4">Back to Customers</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Edit {selectedCustomer.first_name} {selectedCustomer.last_name}
          </h1>
          <p className="text-gray-600">Update customer information and preferences</p>
        </div>
        <Link href="/dashboard/management/customers">
          <Button variant="secondary">Back to Customers</Button>
        </Link>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Information */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Personal Information</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
                  First Name *
                </label>
                <Input
                  id="first_name"
                  name="first_name"
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={handleChange}
                  placeholder="John"
                />
              </div>

              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name *
                </label>
                <Input
                  id="last_name"
                  name="last_name"
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={handleChange}
                  placeholder="Doe"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="john.doe@example.com"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+254700000000"
                />
              </div>
            </div>
          </div>

          {/* Business Information */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Business Information</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name
                </label>
                <Input
                  id="company_name"
                  name="company_name"
                  type="text"
                  value={formData.company_name}
                  onChange={handleChange}
                  placeholder="Acme Corporation"
                />
              </div>

              <div>
                <label htmlFor="tax_number" className="block text-sm font-medium text-gray-700 mb-1">
                  Tax Number
                </label>
                <Input
                  id="tax_number"
                  name="tax_number"
                  type="text"
                  value={formData.tax_number}
                  onChange={handleChange}
                  placeholder="TAX-123456"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="category_id" className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Category
                </label>
                <select
                  id="category_id"
                  name="category_id"
                  value={formData.category_id}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a category (optional)</option>
                  {customerCategories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name} ({category.discount_percentage}% discount)
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  Current category: {selectedCustomer.category_name || 'None'}
                </p>
              </div>
            </div>
          </div>

          {/* Address Information */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Address Information</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="address.street" className="block text-sm font-medium text-gray-700 mb-1">
                  Street Address
                </label>
                <Input
                  id="address.street"
                  name="address.street"
                  type="text"
                  value={formData.address.street}
                  onChange={handleChange}
                  placeholder="123 Main Street"
                />
              </div>

              <div>
                <label htmlFor="address.city" className="block text-sm font-medium text-gray-700 mb-1">
                  City
                </label>
                <Input
                  id="address.city"
                  name="address.city"
                  type="text"
                  value={formData.address.city}
                  onChange={handleChange}
                  placeholder="Nairobi"
                />
              </div>

              <div>
                <label htmlFor="address.state" className="block text-sm font-medium text-gray-700 mb-1">
                  State/Region
                </label>
                <Input
                  id="address.state"
                  name="address.state"
                  type="text"
                  value={formData.address.state}
                  onChange={handleChange}
                  placeholder="Nairobi County"
                />
              </div>

              <div>
                <label htmlFor="address.postal_code" className="block text-sm font-medium text-gray-700 mb-1">
                  Postal Code
                </label>
                <Input
                  id="address.postal_code"
                  name="address.postal_code"
                  type="text"
                  value={formData.address.postal_code}
                  onChange={handleChange}
                  placeholder="00100"
                />
              </div>

              <div>
                <label htmlFor="address.country" className="block text-sm font-medium text-gray-700 mb-1">
                  Country
                </label>
                <Input
                  id="address.country"
                  name="address.country"
                  type="text"
                  value={formData.address.country}
                  onChange={handleChange}
                  placeholder="Kenya"
                />
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Additional Information</h2>
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                value={formData.notes}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Any additional notes about this customer..."
              />
            </div>

            <div className="mt-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Customer is active</span>
              </label>
            </div>
          </div>

          {/* Customer Metadata */}
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold mb-4">Customer Metadata</h2>
            <div className="grid gap-4 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Customer ID:</span>
                <span className="font-mono">{selectedCustomer.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Spent:</span>
                <span>USh {parseFloat(selectedCustomer.total_spent).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Member Since:</span>
                <span>{selectedCustomer.created_at.formatted}</span>
              </div>
              <div className="flex justify-between">
                <span>Last Visit:</span>
                <span>{selectedCustomer.last_visit || 'Never'}</span>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 pt-6 border-t">
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1"
            >
              {submitting ? 'Updating Customer...' : 'Update Customer'}
            </Button>
            <Link href={`/dashboard/management/customers/${customerId}`} className="flex-1">
              <Button type="button" variant="outline" className="w-full">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
