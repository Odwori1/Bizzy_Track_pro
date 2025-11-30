'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCustomerStore } from '@/store/customerStore';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { useCurrency } from '@/lib/currency';  // ✅ CORRECT IMPORT

export default function CustomersPage() {
  const { customers, customerCategories, loading, error, filters, actions } = useCustomerStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { format } = useCurrency();  // ✅ CORRECT HOOK USAGE

  useEffect(() => {
    actions.fetchCustomers();
    actions.fetchCustomerCategories();
  }, [actions]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const newFilters: any = {};
    if (searchTerm) newFilters.search = searchTerm;
    if (selectedCategory) newFilters.category_id = selectedCategory;
    actions.fetchCustomers(newFilters);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
    actions.fetchCustomers({});
  };

  const handleDeleteCustomer = async (customerId: string, customerName: string) => {
    if (!confirm(`Are you sure you want to delete ${customerName}? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(customerId);
    try {
      await actions.deleteCustomer(customerId);
      // Customer list will automatically update via store
    } catch (error) {
      console.error('Failed to delete customer:', error);
      alert('Failed to delete customer. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && customers.length === 0) {
    return <Loading />;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-600">Manage your customer relationships</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/management/customers/categories">
            <Button variant="outline">
              Manage Categories
            </Button>
          </Link>
          <Link href="/dashboard/management/customers/new">
            <Button>
              Add Customer
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-red-800 text-sm">{error}</div>
          <Button variant="secondary" size="sm" onClick={() => actions.fetchCustomers()} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {/* Search and Filters */}
      <Card className="p-4 mb-6">
        <form onSubmit={handleSearch} className="flex gap-4 flex-wrap">
          <Input
            placeholder="Search customers..."
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
            {customerCategories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          <Button type="button" variant="outline" onClick={handleClearFilters}>
            Clear
          </Button>
        </form>
      </Card>

      {/* Customers Grid */}
      <div className="grid gap-4">
        {customers.map((customer) => (
          <Card key={customer.id} className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-lg">
                    {customer.first_name} {customer.last_name}
                  </h3>
                  {customer.category_name && (
                    <span
                      className="px-2 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${customer.category_color}20`,
                        color: customer.category_color
                      }}
                    >
                      {customer.category_name}
                    </span>
                  )}
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    customer.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {customer.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                  <div>
                    <strong>Contact:</strong>
                    <div>{customer.email || 'No email'}</div>
                    <div>{customer.phone || 'No phone'}</div>
                  </div>
                  <div>
                    <strong>Business:</strong>
                    <div>{customer.company_name || 'Individual'}</div>
                    <div>Spent: {format(customer.total_spent)}</div>  {/* ✅ CORRECT CURRENCY USAGE */}
                  </div>
                  <div>
                    <strong>Member Since:</strong>
                    <div>{customer.created_at.formatted}</div>
                    <div>{customer.last_visit ? `Last visit: ${customer.last_visit}` : 'No visits yet'}</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 ml-4">
                <Link href={`/dashboard/management/customers/${customer.id}`}>
                  <Button variant="outline" size="sm">
                    View
                  </Button>
                </Link>
                <Link href={`/dashboard/management/customers/${customer.id}/edit`}>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteCustomer(customer.id, `${customer.first_name} ${customer.last_name}`)}
                  disabled={deletingId === customer.id}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  {deletingId === customer.id ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {customers.length === 0 && !loading && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No customers found</p>
          <Link href="/dashboard/management/customers/new">
            <Button className="mt-4">
              Add Your First Customer
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
