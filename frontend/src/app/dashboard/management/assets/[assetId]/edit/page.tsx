'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAssetsStore } from '@/store/week6/assets-store';
import { AssetForm } from '@/components/assets/AssetForm';

export default function AssetEditPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params.assetId as string;
  
  const { assets, updateAsset, fetchAssets } = useAssetsStore();
  const [currentAsset, setCurrentAsset] = useState<any>(null);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  useEffect(() => {
    if (assetId && assets.length > 0) {
      const foundAsset = assets.find(asset => asset.id === assetId);
      setCurrentAsset(foundAsset);
    }
  }, [assetId, assets]);

  const handleSubmit = async (assetData: any) => {
    try {
      await updateAsset(assetId, assetData);
      router.push('/dashboard/management/assets');
    } catch (error) {
      console.error('Failed to update asset:', error);
    }
  };

  const handleCancel = () => {
    router.push('/dashboard/management/assets');
  };

  if (!currentAsset) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-center">
          <div className="text-lg text-gray-600">Loading asset...</div>
        </div>
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold text-gray-900">Edit Asset</h1>
          <p className="text-gray-600">{currentAsset.asset_name}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <AssetForm
          asset={currentAsset}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}
