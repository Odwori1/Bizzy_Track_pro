'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useServiceStore } from '@/store/serviceStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';

export default function NewServicePage() {
  const router = useRouter();
  const { serviceCategories, loading, actions } = useServiceStore();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    base_price: '',
    duration_minutes: '',
    service_category_id: '',
    is_active: true
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    actions.fetchServiceCategories();
  }, [actions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const serviceData = {
        ...formData,
        base_price: parseFloat(formData.base_price),
        duration_minutes: parseInt(formData.duration_minutes),
        service_category_id: formData.service_category_id || null
      };

      await actions.createService(serviceData);
      router.push('/dashboard/management/services');
    } catch (error) {
      console.error('Failed to create service:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add New Service</h1>
          <p className="text-gray-600">Create a new service for your business</p>
        </div>
        <Link href="/dashboard/management/services">
          <Button variant="secondary">Back to Services</Button>
        </Link>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Service Basic Information */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Service Name *
                </label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., Hair Cutting, Manicure, Photography Session"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe the service in detail..."
                />
              </div>

              <div>
                <label htmlFor="base_price" className="block text-sm font-medium text-gray-700 mb-1">
                  Base Price (USh) *
                </label>
                <Input
                  id="base_price"
                  name="base_price"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.base_price}
                  onChange={handleChange}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label htmlFor="duration_minutes" className="block text-sm font-medium text-gray-700 mb-1">
                  Duration (minutes) *
                </label>
                <Input
                  id="duration_minutes"
                  name="duration_minutes"
                  type="number"
                  min="1"
                  required
                  value={formData.duration_minutes}
                  onChange={handleChange}
                  placeholder="60"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="service_category_id" className="block text-sm font-medium text-gray-700 mb-1">
                  Service Category
                </label>
                <select
                  id="service_category_id"
                  name="service_category_id"
                  value={formData.service_category_id}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a category (optional)</option>
                  {serviceCategories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  Categories help organize your services. You can create new categories in the category management section.
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Service is active and available for booking</span>
                </label>
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
              {submitting ? 'Creating Service...' : 'Create Service'}
            </Button>
            <Link href="/dashboard/management/services" className="flex-1">
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
