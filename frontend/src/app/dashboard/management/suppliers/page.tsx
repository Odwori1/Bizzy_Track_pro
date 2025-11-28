'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api';
import { formatDate } from '@/lib/date-utils';

interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string | null;
  payment_terms: string;
  rating: number;
  is_active: boolean;
  total_purchase_orders: string;
  completed_orders: string;
  pending_orders: string;
  created_at: any;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<Supplier[]>('/suppliers');
      setSuppliers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch suppliers');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSupplier = async (supplierId: string, supplierName: string) => {
    if (confirm(`Are you sure you want to delete "${supplierName}"? This will affect all related purchase orders.`)) {
      try {
        await apiClient.delete(`/suppliers/${supplierId}`);
        fetchSuppliers(); // Refresh the list
      } catch (err: any) {
        alert(err.message || 'Failed to delete supplier');
      }
    }
  };

  // Filter suppliers based on search and status
  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = 
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.contact_person.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && supplier.is_active) ||
      (statusFilter === 'inactive' && !supplier.is_active);
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg">Loading suppliers...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-red-600">Error: {error}</div>
        <Button onClick={fetchSuppliers} className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-gray-600">Manage your suppliers and vendors</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={fetchSuppliers}
          >
            Refresh
          </Button>
          <Link href="/dashboard/management/suppliers/new">
            <Button variant="primary">
              Add New Supplier
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by name, contact, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSuppliers.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="text-gray-500 text-lg mb-2">
              {searchTerm || statusFilter !== 'all' ? 'No suppliers found' : 'No suppliers yet'}
            </div>
            <p className="text-gray-400 mb-4">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your search or filters' 
                : 'Get started by adding your first supplier'
              }
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <Link href="/dashboard/management/suppliers/new">
                <Button variant="primary">
                  Add First Supplier
                </Button>
              </Link>
            )}
          </div>
        ) : (
          filteredSuppliers.map((supplier) => (
            <div key={supplier.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{supplier.name}</h3>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      supplier.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {supplier.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                    <span className="text-sm text-gray-600">
                      Rating: {supplier.rating}/5
                    </span>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Link href={`/dashboard/management/suppliers/${supplier.id}/edit`}>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                  <Button 
                    variant="danger" 
                    size="sm"
                    onClick={() => handleDeleteSupplier(supplier.id, supplier.name)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-sm text-gray-600">Contact:</span>
                  <span className="ml-2 text-sm text-gray-900">{supplier.contact_person}</span>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Email:</span>
                  <span className="ml-2 text-sm text-gray-900">{supplier.email}</span>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Phone:</span>
                  <span className="ml-2 text-sm text-gray-900">{supplier.phone}</span>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Payment Terms:</span>
                  <span className="ml-2 text-sm text-gray-900">{supplier.payment_terms}</span>
                </div>

                {supplier.address && (
                  <div>
                    <span className="text-sm text-gray-600">Address:</span>
                    <span className="ml-2 text-sm text-gray-900">{supplier.address}</span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 pt-3 border-t">
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">{supplier.total_purchase_orders}</div>
                    <div className="text-xs text-gray-600">Total POs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">{supplier.completed_orders}</div>
                    <div className="text-xs text-gray-600">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-yellow-600">{supplier.pending_orders}</div>
                    <div className="text-xs text-gray-600">Pending</div>
                  </div>
                </div>

                <div className="flex justify-between text-xs text-gray-500 border-t pt-3">
                  <span>Added: {formatDate(supplier.created_at)}</span>
                </div>

                <div className="flex space-x-2 pt-3">
                  <Link href={`/dashboard/management/suppliers/${supplier.id}`} className="flex-1">
                    <Button variant="outline" className="w-full">
                      View Details
                    </Button>
                  </Link>
                  <Link href={`/dashboard/management/purchase-orders/new?supplier_id=${supplier.id}`} className="flex-1">
                    <Button variant="primary" className="w-full">
                      Create PO
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary Stats */}
      {filteredSuppliers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{filteredSuppliers.length}</div>
            <div className="text-sm text-gray-600">Total Suppliers</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {filteredSuppliers.filter(s => s.is_active).length}
            </div>
            <div className="text-sm text-gray-600">Active Suppliers</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {filteredSuppliers.reduce((sum, s) => sum + parseInt(s.total_purchase_orders), 0)}
            </div>
            <div className="text-sm text-gray-600">Total POs</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {filteredSuppliers.reduce((sum, s) => sum + parseInt(s.pending_orders), 0)}
            </div>
            <div className="text-sm text-gray-600">Pending Orders</div>
          </div>
        </div>
      )}
    </div>
  );
}
