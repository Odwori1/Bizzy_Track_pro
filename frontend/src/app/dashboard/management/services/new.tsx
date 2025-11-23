'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useServiceStore } from '@/store/serviceStore';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { useBusinessCurrency } from '@/hooks/useBusinessCurrency'; // ADDED IMPORT

export default function NewServicePage() {
  const router = useRouter();
  const { formatCurrency, currencySymbol } = useBusinessCurrency(); // ADDED HOOK
  const { actions, serviceCategories, loading } = useServiceStore();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    base_price: '',
    duration_minutes: '',
    service_category_id: '',
    is_active: true
  });

  useEffect(() => {
    actions.fetchServiceCategories();
  }, [actions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await actions.createService({
        ...formData,
        base_price: parseFloat(formData.base_price),
        duration_minutes: parseInt(formData.duration_minutes)
      });
      router.push('/dashboard/management/services');
    } catch (error) {
      console.error('Failed to create service:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData({
      ...formData,
      [e.target.name]: value
    });
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add New Service</h1>
          <p className="text-gray-600">Create a new service for your catalog</p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard/management/services')}
        >
          Back to Services
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Service Information</CardTitle>
          <CardDescription>Enter the service details below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Service Name *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="e.g., Haircut, Massage, Consultation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Describe the service in detail"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="base_price">Base Price ({currencySymbol}) *</Label> {/* FIXED: Dynamic currency symbol */}
                <Input
                  id="base_price"
                  name="base_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.base_price}
                  onChange={handleChange}
                  required
                  placeholder="10000.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration_minutes">Duration (minutes) *</Label>
                <Input
                  id="duration_minutes"
                  name="duration_minutes"
                  type="number"
                  min="1"
                  value={formData.duration_minutes}
                  onChange={handleChange}
                  required
                  placeholder="60"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="service_category_id">Service Category</Label>
              <select
                id="service_category_id"
                name="service_category_id"
                value={formData.service_category_id}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="">No Category</option>
                {serviceCategories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
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
              <Label htmlFor="is_active">Active Service</Label>
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Service'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/dashboard/management/services')}
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
