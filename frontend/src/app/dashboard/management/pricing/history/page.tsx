'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiClient } from '@/lib/api';
import { useBusinessCurrency } from '@/hooks/useBusinessCurrency'; // ADDED IMPORT

interface PriceHistoryItem {
  id: string;
  entity_type: string;
  entity_name: string;
  old_price?: string;
  new_price: string;
  change_type: string;
  change_reason?: string;
  effective_from: any;
  changed_by_name?: string;
  changed_by_email?: string;
}

export default function PriceHistoryPage() {
  const [priceHistory, setPriceHistory] = useState<PriceHistoryItem[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<PriceHistoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { formatCurrency, currencySymbol } = useBusinessCurrency(); // ADDED HOOK

  // Load price history directly from API (bypassing store issues)
  const loadPriceHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔄 Loading price history directly from API...');

      const response = await apiClient.get('/price-history/business');
      console.log('📊 Direct API response:', response);

      // Handle different response structures
      let historyData: PriceHistoryItem[] = [];

      if (Array.isArray(response)) {
        historyData = response;
      } else if (response && response.data && Array.isArray(response.data)) {
        historyData = response.data;
      } else if (response && response.records && Array.isArray(response.records)) {
        historyData = response.records;
      }

      console.log(`✅ Loaded ${historyData.length} price history records`);
      setPriceHistory(historyData);

    } catch (err) {
      console.error('❌ Failed to load price history:', err);
      setError('Failed to load price history. Please try again.');
      setPriceHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPriceHistory();
  }, []);

  useEffect(() => {
    console.log('🔄 Filtering price history data...');
    let filtered = priceHistory;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.entity_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.change_reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.changed_by_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply entity type filter
    if (entityFilter) {
      filtered = filtered.filter(item => item.entity_type === entityFilter);
    }

    console.log('📊 Filtered history count:', filtered.length);
    setFilteredHistory(filtered);
  }, [priceHistory, searchTerm, entityFilter]);

  const formatDate = (dateObj: any) => {
    if (!dateObj) return 'Invalid Date';

    try {
      // Backend returns date as object with multiple formats
      if (dateObj.iso_local) {
        return new Date(dateObj.iso_local).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      } else if (dateObj.utc) {
        return new Date(dateObj.utc).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      } else if (dateObj.local) {
        // Parse the "12/19/2025, 23:00:00" format
        const datePart = dateObj.local.split(',')[0];
        return new Date(datePart).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      } else if (dateObj.formatted) {
        // Use the formatted date directly
        return dateObj.formatted.split(',')[0]; // Get "Fri, Dec 19, 2025" part
      } else if (dateObj.timestamp) {
        return new Date(dateObj.timestamp).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      } else if (typeof dateObj === 'string') {
        return new Date(dateObj).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }

      return 'Invalid Date';
    } catch (error) {
      console.error('Date formatting error:', error, dateObj);
      return 'Invalid Date';
    }
  };

  const getChangeTypeColor = (changeType: string) => {
    switch (changeType) {
      case 'manual': return 'bg-blue-100 text-blue-800';
      case 'bulk_update': return 'bg-purple-100 text-purple-800';
      case 'seasonal': return 'bg-green-100 text-green-800';
      case 'pricing_rule': return 'bg-orange-100 text-orange-800';
      case 'initial': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getChangeTypeLabel = (changeType: string) => {
    switch (changeType) {
      case 'manual': return 'Manual Update';
      case 'bulk_update': return 'Bulk Update';
      case 'seasonal': return 'Seasonal Pricing';
      case 'pricing_rule': return 'Pricing Rule';
      case 'initial': return 'Initial Price';
      default: return changeType.replace('_', ' ');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-gray-500">Loading price history...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Price History</h1>
        <p className="text-gray-600">Track all price changes and adjustments</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-red-800 text-sm font-medium">Error</div>
          <div className="text-red-700 text-sm mt-1">{error}</div>
          <Button variant="secondary" size="sm" onClick={loadPriceHistory} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {/* Debug Info - Temporary */}
      <Card className="p-4 mb-4 bg-blue-50 border-blue-200">
        <div className="text-sm text-blue-800">
          <strong>Data Status:</strong> Loaded {priceHistory.length} price history records |
          Showing {filteredHistory.length} filtered records
        </div>
      </Card>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Search by service name, reason, or changed by..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Entities</option>
            <option value="service">Services</option>
            <option value="package">Packages</option>
          </select>
        </div>
      </Card>

      {/* Analytics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{priceHistory.length}</div>
          <div className="text-sm text-gray-600">Total Changes</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">
            {priceHistory.filter(item => item.change_type === 'manual').length}
          </div>
          <div className="text-sm text-gray-600">Manual Changes</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">
            {priceHistory.filter(item => item.change_type === 'bulk_update').length}
          </div>
          <div className="text-sm text-gray-600">Bulk Updates</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">
            {priceHistory.filter(item => item.change_type === 'seasonal').length}
          </div>
          <div className="text-sm text-gray-600">Seasonal Changes</div>
        </Card>
      </div>

      {/* Price History List */}
      <div className="space-y-4">
        {filteredHistory.map((item) => (
          <Card key={item.id} className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-lg text-gray-900">{item.entity_name}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs ${getChangeTypeColor(item.change_type)}`}>
                    {getChangeTypeLabel(item.change_type)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-3">
                  <div>
                    <span className="text-gray-600">Price Change:</span>
                    <div className="font-medium">
                      {item.old_price ? `${formatCurrency(parseFloat(item.old_price))} → ` : 'Initial: '} {/* FIXED: Dynamic currency */}
                      <span className="text-green-600">{formatCurrency(parseFloat(item.new_price))}</span> {/* FIXED: Dynamic currency */}
                    </div>
                  </div>

                  <div>
                    <span className="text-gray-600">Effective:</span>
                    <div className="font-medium">{formatDate(item.effective_from)}</div>
                  </div>

                  <div>
                    <span className="text-gray-600">Changed By:</span>
                    <div className="font-medium">
                      {item.changed_by_name || item.changed_by_email || 'System'}
                    </div>
                  </div>
                </div>

                {item.change_reason && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-600 text-sm font-medium">Reason:</span>
                    <div className="text-sm text-gray-800 mt-1">{item.change_reason}</div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredHistory.length === 0 && !loading && (
        <Card className="p-8 text-center">
          {priceHistory.length === 0 ? (
            <>
              <p className="text-gray-500">No price history records found</p>
              <p className="text-sm text-gray-400 mt-1">
                Price changes will appear here when you update service prices through bulk operations or manual updates
              </p>
              <Button variant="outline" onClick={loadPriceHistory} className="mt-4">
                Refresh Data
              </Button>
            </>
          ) : (
            <>
              <p className="text-gray-500">No matching records found</p>
              <p className="text-sm text-gray-400 mt-1">
                Try adjusting your search or filter criteria
              </p>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
