'use client';

import React, { useState, useEffect } from 'react';
import { useAccounting } from '@/hooks/useAccounting';
import { JournalEntriesTable } from '@/components/accounting/JournalEntriesTable';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { FormInput } from '@/components/ui/week7/FormInput';

export default function JournalEntriesPage() {
  const { journalEntries: initialEntries, loading: initialLoading, error, fetchJournalEntries } = useAccounting();
  
  const [filters, setFilters] = useState({
    start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    reference_type: '',
    limit: 20,
    page: 1
  });

  const [localEntries, setLocalEntries] = useState<any>(initialEntries);
  const [localLoading, setLocalLoading] = useState(initialLoading);

  useEffect(() => {
    setLocalEntries(initialEntries);
    setLocalLoading(initialLoading);
  }, [initialEntries, initialLoading]);

  useEffect(() => {
    loadJournalEntries();
  }, [filters.page]);

  const loadJournalEntries = async () => {
    setLocalLoading(true);
    try {
      const data = await fetchJournalEntries(filters);
      setLocalEntries(data);
    } catch (err) {
      console.error('Failed to load journal entries:', err);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleFilterChange = (field: string, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value, page: 1 }));
  };

  const handleApplyFilters = () => {
    loadJournalEntries();
  };

  const handleResetFilters = () => {
    setFilters({
      start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0],
      reference_type: '',
      limit: 20,
      page: 1
    });
  };

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  if (initialLoading && !localEntries) {
    return <Loading />;
  }

  const totalPages = localEntries?.pagination?.pages || 1;
  const currentPage = filters.page;
  const totalEntries = localEntries?.pagination?.total || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Journal Entries</h1>
          <p className="text-gray-600">
            All accounting entries with double-entry bookkeeping
          </p>
          <div className="mt-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              📝 Double-Entry
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
              ⚖️ Debits = Credits
            </span>
          </div>
        </div>
        
        <Button variant="outline">
          📄 Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <FormInput
              label="Start Date"
              type="date"
              value={filters.start_date}
              onChange={(value) => handleFilterChange('start_date', value)}
            />
            <FormInput
              label="End Date"
              type="date"
              value={filters.end_date}
              onChange={(value) => handleFilterChange('end_date', value)}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference Type
              </label>
              <select
                value={filters.reference_type}
                onChange={(e) => handleFilterChange('reference_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">All Types</option>
                <option value="pos_transaction">POS Sales</option>
                <option value="expense">Expenses</option>
                <option value="manual">Manual Entries</option>
                <option value="purchase_order">Purchases</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entries per page
              </label>
              <select
                value={filters.limit}
                onChange={(e) => handleFilterChange('limit', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="10">10 entries</option>
                <option value="20">20 entries</option>
                <option value="50">50 entries</option>
                <option value="100">100 entries</option>
              </select>
            </div>
          </div>

          <div className="flex justify-between">
            <div className="text-sm text-gray-600">
              Showing {totalEntries} total entries
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={handleResetFilters}>
                Reset Filters
              </Button>
              <Button variant="primary" onClick={handleApplyFilters}>
                Apply Filters
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <div className="p-4">
            <div className="text-red-600 font-medium">Error Loading Journal Entries</div>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2"
              onClick={loadJournalEntries}
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Journal Entries Table */}
      {localEntries && (
        <div className="space-y-4">
          <JournalEntriesTable 
            entries={localEntries.entries}
            loading={localLoading}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <Card>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      ← Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next →
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Empty State */}
      {!localLoading && (!localEntries || localEntries.entries.length === 0) && (
        <Card>
          <div className="text-center py-12">
            <div className="text-gray-500 text-lg mb-2">No Journal Entries Found</div>
            <p className="text-gray-400 mb-6">
              Create a POS sale, expense, or manual journal entry to see accounting records here
            </p>
            <div className="flex justify-center space-x-4">
              <Button variant="primary">
                Create Manual Entry
              </Button>
              <Button variant="outline" onClick={handleResetFilters}>
                Clear Filters
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Information Card */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">About Journal Entries</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">What are journal entries?</h4>
              <p className="text-sm text-gray-600">
                Journal entries are the foundation of double-entry accounting. Each transaction creates 
                at least two entries: a debit and a credit. The total debits must always equal the total credits.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Types of entries</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• <span className="font-medium">POS Sales</span>: Automatically created when products are sold</li>
                <li>• <span className="font-medium">Expenses</span>: Recorded when business expenses occur</li>
                <li>• <span className="font-medium">Manual Entries</span>: Created by accountants for adjustments</li>
                <li>• <span className="font-medium">Purchases</span>: Record inventory and asset purchases</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
