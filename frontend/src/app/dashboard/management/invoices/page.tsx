'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useInvoices } from '@/hooks/useInvoices';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';

const statusColors = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-orange-100 text-orange-800',
};

export default function InvoicesPage() {
  const { invoices, loading, error, filters, setFilters, fetchInvoices } = useInvoices();
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchInvoices(filters);
  }, [filters]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ ...filters, search: searchTerm });
  };

  const handleStatusFilter = (status: string) => {
    setFilters({ ...filters, status: status || undefined });
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setFilters({ ...filters, search: '' });
  };

  const formatCurrency = (amount: string, currencySymbol: string) => {
    return `${currencySymbol} ${parseFloat(amount).toFixed(2)}`;
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-600">Manage and track your business invoices</p>
        </div>
        <Link href="/dashboard/management/invoices/new">
          <Button variant="primary">Create Invoice</Button>
        </Link>
      </div>

      {error && (
        <div className="p-4 text-red-700 bg-red-50 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <Input
                placeholder="Search by invoice number, customer name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" variant="primary">
                Search
              </Button>
              {filters.search && (
                <Button type="button" onClick={handleClearSearch} variant="outline">
                  Clear
                </Button>
              )}
            </form>

            <div className="flex gap-2 flex-wrap">
              <Button
                variant={!filters.status ? 'primary' : 'outline'}
                onClick={() => handleStatusFilter('')}
                size="sm"
              >
                All
              </Button>
              {Object.keys(statusColors).map(status => (
                <Button
                  key={status}
                  variant={filters.status === status ? 'primary' : 'outline'}
                  onClick={() => handleStatusFilter(status)}
                  size="sm"
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices List */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">All Invoices ({invoices.length})</h2>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No invoices found. Create your first invoice to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {invoice.invoice_number}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {invoice.customer_first_name} {invoice.customer_last_name}
                        </p>
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[invoice.status]}`}>
                        {invoice.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Due: {invoice.due_date.formatted}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      {formatCurrency(invoice.total_amount, invoice.currency_symbol)}
                    </p>
                    <p className="text-sm text-gray-500">
                      Balance: {formatCurrency(invoice.balance_due, invoice.currency_symbol)}
                    </p>
                  </div>

                  <div className="ml-4">
                    <Link href={`/dashboard/management/invoices/${invoice.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
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
