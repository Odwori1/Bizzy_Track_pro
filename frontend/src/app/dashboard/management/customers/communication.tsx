'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useCustomerStore } from '@/store/customerStore';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Loading } from '@/components/ui/Loading';

export default function CustomerCommunicationPage() {
  const router = useRouter();
  const params = useParams();
  const customerId = params.customerId as string;
  
  const { actions, selectedCustomer, customerCommunications, loading } = useCustomerStore();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCommunication, setNewCommunication] = useState({
    type: 'email' as 'email' | 'sms' | 'phone' | 'in_person' | 'note',
    direction: 'outgoing' as 'incoming' | 'outgoing',
    subject: '',
    content: '',
    status: 'draft' as 'draft' | 'sent' | 'delivered' | 'read' | 'failed'
  });

  useEffect(() => {
    if (customerId) {
      actions.fetchCustomer(customerId);
      actions.fetchCustomerCommunications(customerId);
    }
  }, [customerId, actions]);

  const handleCreateCommunication = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await actions.createCustomerCommunication({
        ...newCommunication,
        customer_id: customerId
      });
      setShowNewForm(false);
      setNewCommunication({
        type: 'email',
        direction: 'outgoing',
        subject: '',
        content: '',
        status: 'draft'
      });
      // Refresh communications
      actions.fetchCustomerCommunications(customerId);
    } catch (error) {
      console.error('Failed to create communication:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'read': return 'bg-purple-100 text-purple-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'email': return '📧';
      case 'sms': return '💬';
      case 'phone': return '📞';
      case 'in_person': return '👤';
      case 'note': return '📝';
      default: return '📄';
    }
  };

  if (loading && !selectedCustomer) {
    return <Loading />;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Communications - {selectedCustomer?.first_name} {selectedCustomer?.last_name}
          </h1>
          <p className="text-gray-600">Manage customer communications</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowNewForm(true)}>
            New Communication
          </Button>
          <Button 
            variant="outline" 
            onClick={() => router.push(`/dashboard/management/customers/${customerId}`)}
          >
            Back to Customer
          </Button>
        </div>
      </div>

      {/* New Communication Form */}
      {showNewForm && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-xl font-semibold">New Communication</h2>
            <p className="text-gray-600 text-sm">Record a new customer interaction</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateCommunication} className="space-y-4">
              {/* ... form content remains the same ... */}
            </form>
          </CardContent>
        </Card>
      )}

      {/* Communications List */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Communication History</h2>
          <p className="text-gray-600 text-sm">All interactions with this customer</p>
        </CardHeader>
        <CardContent>
          {/* ... communications list remains the same ... */}
        </CardContent>
      </Card>
    </div>
  );
}
