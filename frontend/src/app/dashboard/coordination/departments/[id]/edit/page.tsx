'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { DepartmentForm } from '@/components/department/DepartmentForm';
import { departmentApi } from '@/lib/api/department'; // Use API directly
import { Department } from '@/types/department';

export default function EditDepartmentPage() {
  const params = useParams();
  const router = useRouter();
  const departmentId = params.id as string;

  const [department, setDepartment] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load department data using API DIRECTLY
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const dept = await departmentApi.getDepartmentById(departmentId);
        setDepartment(dept);
      } catch (err: any) {
        console.error('Failed to load department:', err);
        setError(err.message || 'Failed to load department');
      } finally {
        setLoading(false);
      }
    };

    if (departmentId) {
      loadData();
    }
  }, [departmentId]);

  const handleSuccess = () => {
    router.push(`/dashboard/coordination/departments/${departmentId}`);
  };

  const handleCancel = () => {
    router.push(`/dashboard/coordination/departments/${departmentId}`);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading department...</div>
        </div>
      </div>
    );
  }

  if (error || !department) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 font-medium">Error</div>
          <div className="text-red-700 text-sm mt-1">
            {error || 'Department not found'}
          </div>
          <div className="mt-4">
            <Link href="/dashboard/coordination/departments">
              <Button variant="secondary" size="sm">
                Back to Departments
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <Link href={`/dashboard/coordination/departments/${departmentId}`}>
                <Button variant="ghost" size="sm">
                  ← Back
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Edit Department</h1>
            </div>
            <p className="text-gray-600 mt-1">
              Update department details and settings
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <DepartmentForm
        department={department}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
    </div>
  );
}
