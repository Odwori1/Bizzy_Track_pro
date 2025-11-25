'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { ItemForm } from '@/components/inventory/ItemForm';

export default function NewInventoryItemPage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push('/dashboard/management/inventory/items');
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add New Inventory Item</h1>
          <p className="text-gray-600">Create a new item in your inventory</p>
        </div>
      </div>

      <Card>
        <div className="p-6">
          <ItemForm onSuccess={handleSuccess} onCancel={handleCancel} />
        </div>
      </Card>
    </div>
  );
}
