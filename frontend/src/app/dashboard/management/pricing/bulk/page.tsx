'use client';

import { useState } from 'react';
import { usePricing } from '@/hooks/usePricing';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

export default function BulkPricingPage() {
  const { bulkUpdatePreview, bulkUpdateServices } = usePricing();
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [updateType, setUpdateType] = useState('percentage_increase');
  const [value, setValue] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [previewData, setPreviewData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handlePreview = async () => {
    if (!value || selectedServices.length === 0) return;

    setLoading(true);
    try {
      const preview = await bulkUpdatePreview({
        services: selectedServices.map(id => ({ id, name: '' })), // You'll need actual service data
        update_type: updateType,
        value: parseFloat(value)
      });
      setPreviewData(preview);
    } catch (error) {
      console.error('Error previewing bulk update:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!previewData || !changeReason) return;

    try {
      await bulkUpdateServices({
        services: selectedServices.map(id => ({ id, name: '' })),
        update_type: updateType,
        value: parseFloat(value),
        change_reason: changeReason
      });
      // Reset form and show success message
      setSelectedServices([]);
      setValue('');
      setChangeReason('');
      setPreviewData(null);
    } catch (error) {
      console.error('Error executing bulk update:', error);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bulk Pricing Operations</h1>
        <p className="text-gray-600">Update multiple service prices at once</p>
      </div>

      <div className="grid gap-6">
        {/* Service Selection */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">1. Select Services</h2>
          <div className="bg-gray-100 rounded-lg p-4">
            <p className="text-gray-500">Service selection interface will be implemented here</p>
            <p className="text-sm text-gray-600 mt-2">Selected: {selectedServices.length} services</p>
          </div>
        </Card>

        {/* Update Configuration */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">2. Configure Update</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Update Type
              </label>
              <select 
                value={updateType}
                onChange={(e) => setUpdateType(e.target.value)}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="percentage_increase">Percentage Increase</option>
                <option value="percentage_decrease">Percentage Decrease</option>
                <option value="fixed_increase">Fixed Amount Increase</option>
                <option value="fixed_decrease">Fixed Amount Decrease</option>
                <option value="override">Set Specific Price</option>
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
                placeholder="Enter value"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handlePreview} disabled={!value || selectedServices.length === 0}>
                Preview Changes
              </Button>
            </div>
          </div>
        </Card>

        {/* Preview Section */}
        {previewData && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">3. Preview Changes</h2>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <p className="text-yellow-800">
                This will affect {previewData.affected_services} services. 
                Review changes before executing.
              </p>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Change Reason
              </label>
              <Input
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Explain why you're making these changes..."
              />
            </div>

            <Button onClick={handleExecute} disabled={!changeReason}>
              Execute Bulk Update
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
