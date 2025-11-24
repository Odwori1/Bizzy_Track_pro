'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAssetsStore } from '@/store/week6/assets-store';
import { AssetForm } from '@/components/assets/AssetForm';

export default function NewAssetPage() {
  const router = useRouter();
  const { createAsset } = useAssetsStore();

  const handleSubmit = async (assetData: any) => {
    try {
      await createAsset(assetData);
      router.push('/dashboard/management/assets');
    } catch (error) {
      console.error('Failed to create asset:', error);
    }
  };

  const handleCancel = () => {
    router.push('/dashboard/management/assets');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Link 
            href="/dashboard/management/assets" 
            className="text-blue-600 hover:text-blue-800 mb-2 inline-block"
          >
            ← Back to Assets
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Add New Asset</h1>
          <p className="text-gray-600">Create a new fixed asset record</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <AssetForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}
