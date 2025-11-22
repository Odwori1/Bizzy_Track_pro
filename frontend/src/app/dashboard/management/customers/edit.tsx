'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useCustomerStore } from '@/store/customerStore';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Loading } from '@/components/ui/Loading';

export default function EditCustomerPage() {
  const router = useRouter();
  const params = useParams();
  const customerId = params.customerId as string;
  
  const { actions, selectedCustomer, customerCategories, loading } = useCustomerStore();
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company_name: '',
    tax_number: '',
    address: '',
    notes: '',
    category_id: '',
    is_active: true
  });

  useEffect(() => {
    if (customerId) {
      actions.fetchCustomer(customerId);
      actions.fetchCustomerCategories();
    }
  }, [customerId, actions]);

  useEffect(() => {
    if (selectedCustomer) {
      setFormData({
        first_name: selectedCustomer.first_name || '',
        last_name: selectedCustomer.last_name || '',
        email: selectedCustomer.email || '',
        phone: selectedCustomer.phone || '',
        company_name: selectedCustomer.company_name || '',
        tax_number: selectedCustomer.tax_number || '',
        address: selectedCustomer.address || '',
        notes: selectedCustomer.notes || '',
        category_id: selectedCustomer.category_id || '',
        is_active: selectedCustomer.is_active
      });
    }
  }, [selectedCustomer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await actions.updateCustomer(customerId, formData);
      router.push('/dashboard/management/customers');
    } catch (error) {
      console.error('Failed to update customer:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData({
      ...formData,
      [e.target.name]: value
    });
  };

  if (loading && !selectedCustomer) {
    return <Loading />;
  }

  if (!selectedCustomer && !loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Customer Not Found</h1>
          <Button 
            onClick={() => router.push('/dashboard/management/customers')}
            className="mt-4"
          >
            Back to Customers
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Customer</h1>
          <p className="text-gray-600">Update customer information</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => router.push('/dashboard/management/customers')}
        >
          Back to Customers
        </Button>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Customer Information</h2>
          <p className="text-gray-600 text-sm">Update the customer details below</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ... rest of the form remains the same ... */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input
                  id="first_name"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input
                  id="last_name"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  name="company_name"
                  value={formData.company_name}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax_number">Tax Number</Label>
                <Input
                  id="tax_number"
                  name="tax_number"
                  value={formData.tax_number}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category_id">Customer Category</Label>
              <select
                id="category_id"
                name="category_id"
                value={formData.category_id}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="">No Category</option>
                {customerCategories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_active"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
                className="rounded border-gray-300"
              />
              <Label htmlFor="is_active">Active Customer</Label>
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Updating...' : 'Update Customer'}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => router.push('/dashboard/management/customers')}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
