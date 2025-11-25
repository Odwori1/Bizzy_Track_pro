'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface FilterBarProps {
  onSearch: (searchTerm: string) => void;
  onFilterChange: (filters: Record<string, any>) => void;
  filters?: {
    search?: string;
    status?: string;
    category?: string;
    dateRange?: {
      start: string;
      end: string;
    };
  };
  filterOptions?: {
    statuses?: string[];
    categories?: Array<{ id: string; name: string }>;
  };
  placeholder?: string;
}

export function FilterBar({
  onSearch,
  onFilterChange,
  filters = {},
  filterOptions = {},
  placeholder = "Search..."
}: FilterBarProps) {
  const [searchTerm, setSearchTerm] = useState(filters.search || '');
  const [selectedStatus, setSelectedStatus] = useState(filters.status || '');
  const [selectedCategory, setSelectedCategory] = useState(filters.category || '');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchTerm);
  };

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    onFilterChange({ ...filters, status });
  };

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
    onFilterChange({ ...filters, category: categoryId });
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedStatus('');
    setSelectedCategory('');
    onSearch('');
    onFilterChange({});
  };

  const hasActiveFilters = searchTerm || selectedStatus || selectedCategory;

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search Input */}
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <Input
            placeholder={placeholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="primary">
            Search
          </Button>
        </form>

        {/* Filter Controls */}
        <div className="flex gap-2 flex-wrap">
          {/* Status Filter */}
          {filterOptions.statuses && filterOptions.statuses.length > 0 && (
            <select
              value={selectedStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              {filterOptions.statuses.map(status => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          )}

          {/* Category Filter */}
          {filterOptions.categories && filterOptions.categories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {filterOptions.categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          )}

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              type="button"
              onClick={clearFilters}
              variant="outline"
              size="sm"
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
