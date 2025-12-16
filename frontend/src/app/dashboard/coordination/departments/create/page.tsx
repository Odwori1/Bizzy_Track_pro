'use client';

import { useRouter } from 'next/navigation';
import { DepartmentForm } from '@/components/department/DepartmentForm';
import { useDepartment } from '@/hooks/useDepartment';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export default function CreateDepartmentPage() {
  const router = useRouter();
  const { createDepartment, loading } = useDepartment();

  const handleSuccess = () => {
    router.push('/dashboard/coordination/departments');
  };

  const handleCancel = () => {
    router.push('/dashboard/coordination/departments');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create New Department</h1>
            <p className="text-gray-600 mt-1">
              Add a new department to organize your business operations
            </p>
          </div>
          <Link href="/dashboard/coordination/departments">
            <Button variant="outline">Back to Departments</Button>
          </Link>
        </div>
      </div>

      {/* Form */}
      <DepartmentForm
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <div className="text-gray-700">Creating department...</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
