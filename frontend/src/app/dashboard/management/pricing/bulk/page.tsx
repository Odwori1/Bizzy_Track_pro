'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePricingActions } from '@/hooks/usePricing';
import { apiClient } from '@/lib/api';

interface Service {
  id: string;
  name: string;
  base_price: string;
  category_name?: string;
}

interface PreviewService {
  id: string;
  name: string;
  old_price?: number;
  new_price?: number;
  price_change?: number;
  change_percentage?: number;
  current_price?: number;
}

interface BulkPreviewResponse {
  services: PreviewService[];
  summary: {
    total_affected: number;
    total_price_change: number;
    average_change_percentage: number;
  };
}

export default function BulkPricingPage() {
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [updateType, setUpdateType] = useState<'percentage_increase' | 'percentage_decrease' | 'fixed_increase' | 'fixed_decrease' | 'override'>('percentage_increase');
  const [value, setValue] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [previewData, setPreviewData] = useState<BulkPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { bulkUpdatePreview, bulkUpdateServices } = usePricingActions();

  // Load services from real API - FIXED: Correct API response handling
  useEffect(() => {
    const loadServices = async () => {
      try {
        setLoading(true);
        console.log('🔄 Loading services from API...');

        // ✅ FIXED: Use correct API response structure
        const response = await apiClient.get('/services');
        console.log('📊 Services API response:', response);

        // ✅ FIXED: Handle both array response and object with data property
        if (response && Array.isArray(response)) {
          setServices(response);
          console.log(`✅ Loaded ${response.length} services`);
        } else if (response && response.data && Array.isArray(response.data)) {
          setServices(response.data);
          console.log(`✅ Loaded ${response.data.length} services`);
        } else {
          console.error('❌ Invalid services response structure:', response);
          setServices([]);
        }
      } catch (err) {
        console.error('❌ Failed to load services:', err);
        setServices([]);
        setError('Failed to load services. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadServices();
  }, []);

  const handleServiceToggle = (service: Service) => {
    setSelectedServices(prev => {
      const isSelected = prev.some(s => s.id === service.id);
      if (isSelected) {
        return prev.filter(s => s.id !== service.id);
      } else {
        return [...prev, service];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedServices.length === services.length) {
      setSelectedServices([]);
    } else {
      setSelectedServices([...services]);
    }
  };

  const handlePreview = async () => {
    if (selectedServices.length === 0) {
      setError('Please select at least one service');
      return;
    }

    if (!value || parseFloat(value) === 0) {
      setError('Please enter a valid value');
      return;
    }

    setPreviewLoading(true);
    setError(null);

    try {
      console.log('🔄 Previewing bulk update with:', {
        services: selectedServices.map(s => ({ id: s.id, name: s.name })),
        update_type: updateType,
        value: parseFloat(value)
      });

      // ✅ CORRECT: Match backend schema exactly
      const result = await bulkUpdatePreview({
        target_services: selectedServices.map(service => ({
          id: service.id,
          name: service.name
        })),
        target_packages: [], // Empty for now, can add package support later
        operation_type: updateType,
        adjustment_value: parseFloat(value)
      });

      console.log('📊 Preview API result:', result);

      if (result.success && result.data) {
        // ✅ FIXED: Handle different response structures safely
        const previewData = result.data;
        console.log('📊 Preview data structure:', previewData);
        
        // Create a map of selected services by ID for name lookup
        const selectedServicesMap = new Map();
        selectedServices.forEach(service => {
          selectedServicesMap.set(service.id, service);
        });
        
        // Ensure we have the correct data structure
        if (previewData.services && Array.isArray(previewData.services)) {
          // ✅ FIXED: Better service name matching - use original selected services
          const normalizedServices = previewData.services.map((service, index) => {
            // Try multiple ways to find the correct service name
            let serviceName = 'Unknown Service';
            
            // 1. First try by exact ID match
            const originalService = selectedServicesMap.get(service.id);
            if (originalService) {
              serviceName = originalService.name;
            } 
            // 2. Try by name match (case insensitive)
            else {
              const nameMatch = selectedServices.find(s => 
                s.name.toLowerCase() === service.name?.toLowerCase()
              );
              if (nameMatch) {
                serviceName = nameMatch.name;
              }
              // 3. Use the name from API response if available
              else if (service.name) {
                serviceName = service.name;
              }
              // 4. Fallback: use first selected service name in order
              else if (selectedServices[index]) {
                serviceName = selectedServices[index].name;
              }
            }
            
            return {
              id: service.id || `service-${index}-${Date.now()}`,
              name: serviceName,
              old_price: service.old_price || service.current_price || parseFloat(selectedServices[index]?.base_price || '0'),
              new_price: service.new_price || 0,
              price_change: service.price_change || 0,
              change_percentage: service.change_percentage || 0,
              current_price: service.current_price || service.old_price || parseFloat(selectedServices[index]?.base_price || '0')
            };
          });
          
          setPreviewData({
            services: normalizedServices,
            summary: previewData.summary || {
              total_affected: normalizedServices.length,
              total_price_change: 0,
              average_change_percentage: 0
            }
          });
          console.log('✅ Preview data received with services:', normalizedServices.length);
        } else {
          // Fallback: Create preview data from selected services
          console.log('⚠️ Using fallback preview calculation');
          const normalizedServices = selectedServices.map((service, index) => {
            const currentPrice = parseFloat(service.base_price) || 0;
            let newPrice = currentPrice;
            
            // Calculate new price based on update type
            switch (updateType) {
              case 'percentage_increase':
                newPrice = currentPrice * (1 + parseFloat(value) / 100);
                break;
              case 'percentage_decrease':
                newPrice = currentPrice * (1 - parseFloat(value) / 100);
                break;
              case 'fixed_increase':
                newPrice = currentPrice + parseFloat(value);
                break;
              case 'fixed_decrease':
                newPrice = Math.max(0, currentPrice - parseFloat(value));
                break;
              case 'override':
                newPrice = parseFloat(value);
                break;
            }
            
            const priceChange = newPrice - currentPrice;
            const changePercentage = (priceChange / currentPrice) * 100;
            
            return {
              id: service.id || `service-${index}-${Date.now()}`,
              name: service.name,
              old_price: currentPrice,
              new_price: newPrice,
              price_change: priceChange,
              change_percentage: changePercentage,
              current_price: currentPrice
            };
          });
          
          const totalPriceChange = normalizedServices.reduce((sum, service) => sum + (service.price_change || 0), 0);
          const averageChangePercentage = normalizedServices.length > 0 
            ? normalizedServices.reduce((sum, service) => sum + (service.change_percentage || 0), 0) / normalizedServices.length
            : 0;
            
          setPreviewData({
            services: normalizedServices,
            summary: {
              total_affected: normalizedServices.length,
              total_price_change: totalPriceChange,
              average_change_percentage: averageChangePercentage
            }
          });
        }
      } else {
        console.error('❌ Preview failed:', result.error);
        setError(result.error || 'Failed to preview changes');
      }
    } catch (err) {
      console.error('❌ Preview error:', err);
      setError('Failed to preview bulk update. Please check console for details.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApplyChanges = async () => {
    if (!previewData || !changeReason.trim()) {
      setError('Please enter a change reason');
      return;
    }

    setLoading(true);
    try {
      console.log('🔄 Applying bulk changes...');

      // ✅ CORRECT: Match backend schema exactly
      const result = await bulkUpdateServices({
        target_services: selectedServices.map(service => ({
          id: service.id,
          name: service.name
        })),
        operation_type: updateType,
        adjustment_value: parseFloat(value),
        change_reason: changeReason
      });

      if (result.success) {
        console.log('✅ Bulk update applied successfully');
        alert('Bulk pricing update applied successfully!');
        // Reset form
        setSelectedServices([]);
        setValue('');
        setChangeReason('');
        setPreviewData(null);
        setError(null);
        // Reload services to reflect price changes
        const updatedServices = await apiClient.get('/services');
        if (updatedServices && Array.isArray(updatedServices)) {
          setServices(updatedServices);
        } else if (updatedServices && updatedServices.data && Array.isArray(updatedServices.data)) {
          setServices(updatedServices.data);
        }
      } else {
        console.error('❌ Apply changes failed:', result.error);
        setError(result.error || 'Failed to apply changes');
      }
    } catch (err) {
      console.error('❌ Apply changes error:', err);
      setError('Failed to apply bulk update. Please check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const isServiceSelected = (service: Service) => {
    return selectedServices.some(s => s.id === service.id);
  };

  // ✅ FIXED: Safe number formatting function
  const formatCurrency = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return '$0.00';
    }
    return `$${value.toFixed(2)}`;
  };

  // ✅ FIXED: Safe percentage formatting function
  const formatPercentage = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0.0%';
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bulk Pricing Operations</h1>
        <p className="text-gray-600">Update multiple service prices at once</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-red-800 text-sm font-medium">Error</div>
          <div className="text-red-700 text-sm mt-1">{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Service Selection */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">1. Select Services</h2>
          <div className="mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="mb-2"
              disabled={loading || services.length === 0}
            >
              {selectedServices.length === services.length ? 'Deselect All' : 'Select All'}
            </Button>
            <p className="text-sm text-gray-600">
              Selected: {selectedServices.length} services
              {services.length > 0 && ` of ${services.length} available`}
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center p-8">
              <div className="text-gray-500">Loading services...</div>
            </div>
          ) : services.length === 0 ? (
            <div className="text-center p-8 text-gray-500">
              No services available. Please create services first.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {services.map(service => (
                <div
                  key={service.id || `service-${service.name}`}
                  className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                    isServiceSelected(service)
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => handleServiceToggle(service)}
                >
                  <input
                    type="checkbox"
                    checked={isServiceSelected(service)}
                    onChange={() => handleServiceToggle(service)}
                    className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{service.name}</div>
                    <div className="text-sm text-gray-600">
                      {service.category_name && `${service.category_name} • `}${service.base_price}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Update Configuration */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">2. Configure Update</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Update Type
                </label>
                <select
                  value={updateType}
                  onChange={(e) => setUpdateType(e.target.value as any)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={previewLoading}
                >
                  <option value="percentage_increase">Percentage Increase</option>
                  <option value="percentage_decrease">Percentage Decrease</option>
                  <option value="fixed_increase">Fixed Amount Increase</option>
                  <option value="fixed_decrease">Fixed Amount Decrease</option>
                  <option value="override">Override Price</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Value
                </label>
                <Input
                  type="number"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={
                    updateType.includes('percentage') ? '10.5' :
                    updateType.includes('fixed') ? '25.00' :
                    '150.00'
                  }
                  step="0.01"
                  disabled={previewLoading}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {updateType === 'percentage_increase' && 'Enter percentage to increase prices'}
                  {updateType === 'percentage_decrease' && 'Enter percentage to decrease prices'}
                  {updateType === 'fixed_increase' && 'Enter fixed amount to add to prices'}
                  {updateType === 'fixed_decrease' && 'Enter fixed amount to subtract from prices'}
                  {updateType === 'override' && 'Enter new price to set for all selected services'}
                </p>
              </div>

              <Button
                onClick={handlePreview}
                disabled={previewLoading || selectedServices.length === 0 || !value}
                className="w-full"
              >
                {previewLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Calculating Preview...
                  </span>
                ) : (
                  'Preview Changes'
                )}
              </Button>
            </div>
          </Card>

          {/* Preview Section */}
          {previewData && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">3. Review & Apply</h2>

              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-2">Summary</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Affected Services:</span>
                    <span className="font-medium ml-2">{previewData.summary.total_affected}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Average Change:</span>
                    <span className={`font-medium ml-2 ${
                      (previewData.summary.average_change_percentage || 0) >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {formatPercentage(previewData.summary.average_change_percentage)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
                <h3 className="font-medium">Service Details</h3>
                {previewData.services.map((service) => (
                  <div key={service.id} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{service.name}</div>
                      <div className="text-sm text-gray-600">
                        {formatCurrency(service.old_price)} → <span className="font-medium">{formatCurrency(service.new_price)}</span>
                      </div>
                    </div>
                    <div className={`font-medium text-sm ${
                      (service.price_change || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {(service.price_change || 0) >= 0 ? '+' : ''}{formatCurrency(service.price_change)}
                      <div className={`text-xs ${(service.change_percentage || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ({formatPercentage(service.change_percentage)})
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Change Reason *
                </label>
                <Input
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Enter reason for this price change..."
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Required for audit purposes</p>
              </div>

              <Button
                onClick={handleApplyChanges}
                disabled={loading || !changeReason.trim()}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Applying Changes...
                  </span>
                ) : (
                  'Apply Changes'
                )}
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
