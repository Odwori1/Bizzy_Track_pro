'use client';
import { useEffect, useState } from 'react';
import { usePackageStore } from '@/store/packageStore';
import { PackageCard } from '@/components/packages/PackageCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Search, Plus, Filter } from 'lucide-react';
import Link from 'next/link';

export default function PackagesPage() {
  const { packages, loading, error, actions } = usePackageStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    actions.fetchPackages();
  }, [actions]);

  // Safely handle packages array
  const filteredPackages = packages.filter(pkg =>
    pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (categoryFilter === '' || pkg.category === categoryFilter)
  );

  const categories = [...new Set(packages.map(pkg => pkg.category))];

  if (loading && packages.length === 0) {
    return <div className="flex justify-center p-8">Loading packages...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Service Packages</h1>
        <Link href="/dashboard/management/packages/new">
          <Button className="flex items-center gap-2">
            <Plus size={16} />
            New Package
          </Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-red-800 text-sm">{error}</div>
          <Button variant="secondary" size="sm" onClick={() => actions.fetchPackages()} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {/* Search and Filter */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
          <Input
            placeholder="Search packages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border rounded-lg px-3 py-2"
        >
          <option value="">All Categories</option>
          {categories.map(category => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Filter size={16} />
          <span>{filteredPackages.length} packages</span>
        </div>
      </div>

      {/* Packages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPackages.map(pkg => (
          <PackageCard key={pkg.id} package={pkg} />
        ))}
      </div>

      {filteredPackages.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          {packages.length === 0 ? 'No packages found. Create your first package to get started.' : 'No packages match your filters.'}
        </div>
      )}
    </div>
  );
}
