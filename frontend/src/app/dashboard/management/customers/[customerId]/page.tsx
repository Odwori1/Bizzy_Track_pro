'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCustomerStore } from '@/store/customerStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { useBusinessCurrency } from '@/hooks/useBusinessCurrency'; // ADDED IMPORT

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params.customerId as string;

  const { selectedCustomer, customerCommunications, loading, error, actions } = useCustomerStore();
  const { formatCurrency } = useBusinessCurrency(); // ADDED HOOK

  useEffect(() => {
    if (customerId) {
      actions.fetchCustomer(customerId);
      actions.fetchCustomerCommunications(customerId);
    }
  }, [customerId, actions]);

  if (loading && !selectedCustomer) {
    return <Loading />;
  }

  if (error && !selectedCustomer) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800">{error}</div>
          <Button variant="secondary" onClick={() => actions.fetchCustomer(customerId)} className="mt-2">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!selectedCustomer) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Customer not found</div>
      </div>
    );
  }

  // REMOVED: Hardcoded formatCurrency function

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {selectedCustomer.first_name} {selectedCustomer.last_name}
          </h1>
          <p className="text-gray-600">Customer profile and history</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/management/customers/${customerId}/edit`}>
            <Button variant="outline">Edit</Button>
          </Link>
          <Link href="/dashboard/management/customers">
            <Button variant="secondary">Back to List</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Customer Information */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Customer Information</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-500">Full Name</label>
              <div className="font-medium">{selectedCustomer.first_name} {selectedCustomer.last_name}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Email</label>
              <div className="font-medium">{selectedCustomer.email || 'Not provided'}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Phone</label>
              <div className="font-medium">{selectedCustomer.phone || 'Not provided'}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Company</label>
              <div className="font-medium">{selectedCustomer.company_name || 'Individual'}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Status</label>
              <div className={`inline-block px-2 py-1 rounded-full text-xs ${
                selectedCustomer.is_active
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {selectedCustomer.is_active ? 'Active' : 'Inactive'}
              </div>
            </div>
          </div>
        </Card>

        {/* Financial Summary */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Financial Summary</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-500">Total Spent</label>
              <div className="font-medium text-lg">{formatCurrency(selectedCustomer.total_spent)}</div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Last Visit</label>
              <div className="font-medium">
                {selectedCustomer.last_visit ? selectedCustomer.last_visit : 'No visits yet'}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500">Member Since</label>
              <div className="font-medium">{selectedCustomer.created_at.formatted}</div>
            </div>
          </div>
        </Card>

        {/* Recent Communications */}
        <Card className="p-6 md:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Recent Communications</h2>
            <Link href={`/dashboard/management/customers/${customerId}/communication`}>
              <Button variant="outline" size="sm">Add Communication</Button>
            </Link>
          </div>
          <div className="space-y-3">
            {customerCommunications.slice(0, 5).map((comm) => (
              <div key={comm.id} className="border rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{comm.subject || 'No subject'}</div>
                    <div className="text-sm text-gray-600">{comm.content}</div>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <div className={`inline-block px-2 py-1 rounded ${
                      comm.direction === 'outgoing' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {comm.type} ({comm.direction})
                    </div>
                    <div>{comm.created_at.formatted}</div>
                  </div>
                </div>
              </div>
            ))}
            {customerCommunications.length === 0 && (
              <div className="text-center text-gray-500 py-4">No communications yet</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
