'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePackageStore } from '@/store/packageStore';
import { PackageForm } from '@/components/packages/PackageForm';
import { PackageFormData } from '@/types/packages';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';

export default function EditPackagePage() {
  const params = useParams();
  const router = useRouter();
  const { currentPackage, loading, error, actions } = usePackageStore();

  const packageId = params.packageId as string;

  useEffect(() => {
    if (packageId && packageId !== 'edit') {
      actions.fetchPackageById(packageId);
    }
  }, [packageId, actions]);

  const handleSubmit = async (data: PackageFormData) => {
    try {
      await actions.updatePackage(packageId, data);
      router.push(`/dashboard/management/packages/${packageId}`);
    } catch (err) {
      // Error handled by store
    }
  };

  const handleCancel = () => {
    router.push(`/dashboard/management/packages/${packageId}`);
  };

  if (loading && !currentPackage) {
    return <div className="flex justify-center p-8">Loading package...</div>;
  }

  if (error && !currentPackage) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800">{error}</div>
          <Button variant="secondary" onClick={() => actions.fetchPackageById(packageId)} className="mt-2">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!currentPackage) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Package not found</div>
        <Link href="/dashboard/management/packages">
          <Button className="mt-4">Back to Packages</Button>
        </Link>
      </div>
    );
  }

  // Convert Package to PackageFormData
  const initialData: PackageFormData = {
    name: currentPackage.name,
    description: currentPackage.description,
    base_price: currentPackage.base_price,
    duration_minutes: currentPackage.duration_minutes,
    category: currentPackage.category,
    is_customizable: currentPackage.is_customizable,
    min_services: currentPackage.min_services,
    max_services: currentPackage.max_services,
    services: currentPackage.services?.map(service => ({
      service_id: service.service_id,
      is_required: service.is_required,
      default_quantity: service.default_quantity,
      package_price: service.package_price,
      is_price_overridden: service.is_price_overridden,
      service_dependencies: service.service_dependencies || [],
      timing_constraints: service.timing_constraints || {},
      resource_requirements: service.resource_requirements || {},
      substitution_rules: service.substitution_rules || { allowed_substitutes: [] },
    })) || [],
  };

  return (
    <div className="container mx-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href={`/dashboard/management/packages/${packageId}`}>
            <Button variant="outline">
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Edit Package</h1>
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
          initialData={initialData}
        />
      </div>
    </div>
  );
}
