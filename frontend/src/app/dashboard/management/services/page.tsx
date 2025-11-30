'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useServiceStore } from '@/store/serviceStore';
import { useUniversalCartStore } from '@/store/universal-cart-store';
import { posEngine } from '@/lib/pos-engine';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { useCurrency } from '@/lib/currency'; // ✅ CORRECT IMPORT

export default function ServicesPage() {
  const { services, serviceCategories, loading, error, actions } = useServiceStore();
  const { addItem } = useUniversalCartStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);
  const { format } = useCurrency(); // ✅ CORRECT HOOK USAGE

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
    } catch (error) {
      console.error('Failed to delete service:', error);
      alert('Failed to delete service. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddToCart = async (service: any) => {
    setAddingToCart(service.id);

    try {
      // Create universal sellable item
      const sellableItem = {
        id: service.id,
        type: 'service' as const,
        sourceModule: 'services' as const,
        name: service.name,
        description: service.description,
        unitPrice: parseFloat(service.base_price) || 0,
        quantity: 1,
        category: service.category_name || service.category,
        metadata: {
          service_id: service.id,
          duration_minutes: service.duration_minutes,
          service_category_id: service.service_category_id
        },
        business_id: '' // Will be set by backend based on auth
      };

      // Add to universal cart using POS engine
      posEngine.addItem(sellableItem);

      // Show success feedback
      console.log(`✅ Added "${service.name}" to cart`);

      // Optional: Show toast notification here
      // toast.success(`Added ${service.name} to cart`);

    } catch (error: any) {
      console.error('❌ Failed to add service to cart:', error);
      alert(`Failed to add service to cart: ${error.message}`);
    } finally {
      setAddingToCart(null);
    }
  };

  if (loading && services.length === 0) {
    return <Loading />;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Services</h1>
          <p className="text-gray-600">Browse and book professional services</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/management/pos/cart">
            <Button variant="outline">
              View Cart
            </Button>
          </Link>
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
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <Card key={service.id} className="p-6 hover:shadow-lg transition-shadow duration-200">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2">{service.name}</h3>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    service.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {service.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {service.display_category && (
                    <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                      {service.display_category}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className="text-gray-600 text-sm mb-4 line-clamp-2">
              {service.description}
            </p>

            <div className="flex justify-between items-center mb-4">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {format(service.base_price)} {/* ✅ CORRECT: Using format function */}
                </div>
                <div className="text-gray-500 text-sm">
                  {service.duration_minutes} minutes
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Link href={`/dashboard/management/services/${service.id}`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">Details</Button>
              </Link>
              <Link href={`/dashboard/management/services/${service.id}/edit`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">Edit</Button>
              </Link>
              <Button
                onClick={() => handleAddToCart(service)}
                size="sm"
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                disabled={!service.is_active || addingToCart === service.id}
              >
                {addingToCart === service.id ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Adding...
                  </span>
                ) : (
                  service.is_active ? 'Add to Cart' : 'Unavailable'
                )}
              </Button>
            </div>

            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteService(service.id, service.name)}
                disabled={deletingId === service.id}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {deletingId === service.id ? 'Deleting...' : 'Delete'}
              </Button>

              {/* Quick cart info */}
              <div className="text-xs text-gray-500">
                Click "Add to Cart" to book this service
              </div>
            </div>
          </Card>
        ))}
      </div>

      {services.length === 0 && !loading && (
        <Card className="p-8 text-center">
          <div className="text-6xl mb-4">🔧</div>
          <h3 className="text-xl font-semibold mb-2">No services found</h3>
          <p className="text-gray-600 mb-6">Get started by creating your first service offering</p>
          <Link href="/dashboard/management/services/new">
            <Button>Add Your First Service</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
