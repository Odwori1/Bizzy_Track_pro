'use client';
import { useRouter } from 'next/navigation';
import { usePackageStore } from '@/store/packageStore';
import { PackageForm } from '@/components/packages/PackageForm';
import { PackageFormData } from '@/types/packages';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';

export default function NewPackagePage() {
  const router = useRouter();
  const { loading, error, actions } = usePackageStore();

  const handleSubmit = async (data: PackageFormData) => {
    try {
      await actions.createPackage(data);
      router.push('/dashboard/management/packages');
    } catch (err) {
      // Error handled by store
    }
  };

  const handleCancel = () => {
    router.push('/dashboard/management/packages');
  };

  return (
    <div className="container mx-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/management/packages">
            <Button variant="outline">
              <ArrowLeft size={16} className="mr-2" />
              Back to Packages
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Create New Package</h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <PackageForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={loading}
        />
      </div>
    </div>
  );
}
