'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useServiceStore } from '@/store/serviceStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';

export default function ServicesPage() {
  const { services, serviceCategories, loading, error, actions } = useServiceStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    actions.fetchServices();
    actions.fetchServiceCategories();
  }, [actions]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const newFilters: any = {};
    if (searchTerm) newFilters.search = searchTerm;
    if (selectedCategory) newFilters.category = selectedCategory;
    actions.fetchServices(newFilters);
  };

  const handleDeleteService = async (serviceId: string, serviceName: string) => {
    if (!confirm(`Are you sure you want to delete "${serviceName}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(serviceId);
    try {
      await actions.deleteService(serviceId);
      // Service list will automatically update via store
    } catch (error) {
      console.error('Failed to delete service:', error);
      alert('Failed to delete service. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatCurrency = (amount: string) => {
    return `USh ${parseFloat(amount).toLocaleString()}`;
  };

  if (loading && services.length === 0) {
    return <Loading />;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Services</h1>
          <p className="text-gray-600">Manage your service catalog and pricing</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/management/services/categories">
            <Button variant="outline">
              Manage Categories
            </Button>
          </Link>
          <Link href="/dashboard/management/services/new">
            <Button>Add Service</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-red-800 text-sm">{error}</div>
          <Button variant="secondary" size="sm" onClick={() => actions.fetchServices()} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {/* Search and Filters */}
      <Card className="p-4 mb-6">
        <form onSubmit={handleSearch} className="flex gap-4 flex-wrap">
          <Input
            placeholder="Search services..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[200px]"
          />
          <select 
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="border rounded-md px-3 py-2 min-w-[150px]"
          >
            <option value="">All Categories</option>
            {serviceCategories.map(category => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </Card>

      {/* Services Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <Card key={service.id} className="p-4">
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-semibold text-lg">{service.name}</h3>
              <span className={`px-2 py-1 rounded-full text-xs ${
                service.is_active 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {service.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            
            <p className="text-gray-600 text-sm mb-3">{service.description}</p>
            
            <div className="flex justify-between items-center text-sm">
              <div>
                <div className="font-semibold">{formatCurrency(service.base_price)}</div>
                <div className="text-gray-500">{service.duration_minutes} mins</div>
              </div>
              {service.display_category && (
                <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                  {service.display_category}
                </span>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <Link href={`/dashboard/management/services/${service.id}`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">View</Button>
              </Link>
              <Link href={`/dashboard/management/services/${service.id}/edit`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">Edit</Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteService(service.id, service.name)}
                disabled={deletingId === service.id}
                className="text-red-600 border-red-200 hover:bg-red-50 flex-1"
              >
                {deletingId === service.id ? '...' : 'Delete'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {services.length === 0 && !loading && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No services found</p>
          <Link href="/dashboard/management/services/new">
            <Button className="mt-4">Add Your First Service</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
