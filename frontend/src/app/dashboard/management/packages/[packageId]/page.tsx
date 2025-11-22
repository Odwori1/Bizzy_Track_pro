'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePackageStore } from '@/store/packageStore';
import { Button } from '@/components/ui/Button';
import { PackageDetails } from '@/components/packages/PackageDetails';
import { Edit, Trash2, Package as PackageIcon, Settings } from 'lucide-react';
import Link from 'next/link';

export default function PackageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentPackage, loading, error, actions } = usePackageStore();

  const packageId = params.packageId as string;

  // IMPORTANT: Redirect if this is the "new" route
  useEffect(() => {
    if (packageId === 'new') {
      router.push('/dashboard/management/packages/new');
      return;
    }
  }, [packageId, router]);

  useEffect(() => {
    if (packageId && packageId !== 'new') {
      actions.fetchPackageById(packageId);
    }
  }, [packageId, actions]);

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this package? This action cannot be undone.')) {
      try {
        await actions.deletePackage(packageId);
        router.push('/dashboard/management/packages');
      } catch (err) {
        // Error handled by store
      }
    }
  };

  // Show loading while redirecting
  if (packageId === 'new') {
    return <div className="flex justify-center p-8">Redirecting to package creation...</div>;
  }

  if (loading && !currentPackage) {
    return <div className="flex justify-center p-8">Loading package details...</div>;
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

  return (
    <div className="container mx-auto p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PackageIcon size={24} />
              {currentPackage.name}
            </h1>
            <p className="text-gray-600 mt-1">{currentPackage.description}</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/dashboard/management/packages/${packageId}/deconstruct`}>
              <Button variant="outline">
                <Settings size={16} className="mr-2" />
                Customize
              </Button>
            </Link>
            <Link href={`/dashboard/management/packages/${packageId}/rules`}>
              <Button variant="outline">
                Configure Rules
              </Button>
            </Link>
            <Link href={`/dashboard/management/packages/${packageId}/edit`}>
              <Button variant="outline">
                <Edit size={16} className="mr-2" />
                Edit
              </Button>
            </Link>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 size={16} className="mr-2" />
              Delete
            </Button>
          </div>
        </div>

        {/* Package Details */}
        <PackageDetails package={currentPackage} />
      </div>
    </div>
  );
}
