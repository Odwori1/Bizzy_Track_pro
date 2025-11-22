'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useServiceStore } from '@/store/serviceStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';

export default function ServiceDetailsPage() {
  const params = useParams();
  const serviceId = params.serviceId as string;
  
  const { selectedService, loading, error, actions } = useServiceStore();

  useEffect(() => {
    if (serviceId) {
      actions.fetchService(serviceId);
    }
  }, [serviceId, actions]);

  if (loading && !selectedService) {
    return <Loading />;
  }

  if (error && !selectedService) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800">{error}</div>
          <Button variant="secondary" onClick={() => actions.fetchService(serviceId)} className="mt-2">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!selectedService) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Service not found</div>
      </div>
    );
  }

  const formatCurrency = (amount: string) => {
    return `USh ${parseFloat(amount).toLocaleString()}`;
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{selectedService.name}</h1>
          <p className="text-gray-600">Service details and configuration</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/management/services/${serviceId}/edit`}>
            <Button variant="outline">Edit</Button>
          </Link>
          <Link href="/dashboard/management/services">
            <Button variant="secondary">Back to List</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Service Information */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Service Information</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-500">Service Name</label>
              <div className="font-medium">{selectedService.name}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Description</label>
              <div className="font-medium">{selectedService.description}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Base Price</label>
              <div className="font-medium text-lg">{formatCurrency(selectedService.base_price)}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Duration</label>
              <div className="font-medium">{selectedService.duration_minutes} minutes</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Category</label>
              <div className="font-medium">
                {selectedService.display_category || selectedService.category || 'No category'}
                {selectedService.category_color && (
                  <span 
                    className="ml-2 px-2 py-1 rounded-full text-xs"
                    style={{ 
                      backgroundColor: `${selectedService.category_color}20`,
                      color: selectedService.category_color
                    }}
                  >
                    {selectedService.category_name}
                  </span>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Status</label>
              <div className={`inline-block px-2 py-1 rounded-full text-xs ${
                selectedService.is_active 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {selectedService.is_active ? 'Active' : 'Inactive'}
              </div>
            </div>
          </div>
        </Card>

        {/* Service Metadata */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Service Metadata</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-500">Service ID</label>
              <div className="font-medium text-sm">{selectedService.id}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Created</label>
              <div className="font-medium">{selectedService.created_at.formatted}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Last Updated</label>
              <div className="font-medium">{selectedService.updated_at.formatted}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Business ID</label>
              <div className="font-medium text-sm">{selectedService.business_id}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Service Usage Stats - Placeholder for future implementation */}
      <Card className="p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4">Service Usage</h2>
        <div className="text-center text-gray-500 py-8">
          <p>Service usage statistics and analytics will be available soon</p>
          <p className="text-sm mt-2">This will include job history, revenue generated, and customer feedback</p>
        </div>
      </Card>
    </div>
  );
}
