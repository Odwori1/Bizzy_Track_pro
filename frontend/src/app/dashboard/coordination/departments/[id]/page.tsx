'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DepartmentCard } from '@/components/department/DepartmentCard';
import { departmentApi } from '@/lib/api/department'; // Use API directly
import { Department } from '@/types/department';

export default function DepartmentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const departmentId = params.id as string;

  const [activeTab, setActiveTab] = useState<'overview' | 'assignments'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);

  // Load department data using API DIRECTLY
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Load department using API directly (NOT store)
        const dept = await departmentApi.getDepartmentById(departmentId);
        setDepartment(dept);

        // 2. Load assignments using API directly
        const deptAssignments = await departmentApi.getAssignmentsByDepartment(departmentId);
        setAssignments(deptAssignments);
      } catch (err: any) {
        console.error('Failed to load department:', err);
        setError(err.message || 'Failed to load department details');
      } finally {
        setLoading(false);
      }
    };

    if (departmentId) {
      loadData();
    }
  }, [departmentId]);

  // Filter assignments for this department
  const departmentAssignments = assignments.filter(
    assignment => assignment.department_id === departmentId
  );

  // Handle delete - use API directly
  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this department? This action cannot be undone. This will remove the department and all its assignments.')) {
      try {
        await departmentApi.deleteDepartment(departmentId);
        router.push('/dashboard/coordination/departments');
      } catch (error: any) {
        console.error('Failed to delete department:', error);
        alert(`Failed to delete department: ${error.message || 'Unknown error'}`);
      }
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading department details...</div>
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Link href="/dashboard/coordination/departments">
              <Button variant="ghost" size="sm">
                ← Back
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">{department.name}</h1>
            <span className={`px-2 py-1 text-xs rounded-full ${
              department.is_active
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {department.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="text-gray-600 mt-1">
            {department.code} • {department.department_type.charAt(0).toUpperCase() + department.department_type.slice(1)}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link href={`/dashboard/coordination/departments/${departmentId}/edit`}>
            <Button variant="outline">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Department
            </Button>
          </Link>

          <Button variant="destructive" onClick={handleDelete}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </Button>
        </div>
      </div>

      {/* Department Card */}
      <DepartmentCard department={department} showActions={false} />

      {/* Tabs */}
      <Card>
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'overview' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Overview
              </div>
            </button>

            <button
              onClick={() => setActiveTab('assignments')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'assignments' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Assignments
                <span className="ml-2 bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                  {departmentAssignments.length}
                </span>
              </div>
            </button>
          </nav>
        </div>
      </Card>

      {/* Tab Content - Keep original but simplified */}
      {activeTab === 'overview' && (
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Department Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Code</div>
                <div className="text-lg font-semibold">{department.code}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Type</div>
                <div className="text-lg font-semibold capitalize">{department.department_type}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Status</div>
                <div className={`text-lg font-semibold ${department.is_active ? 'text-green-600' : 'text-red-600'}`}>
                  {department.is_active ? 'Active' : 'Inactive'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Sort Order</div>
                <div className="text-lg font-semibold">{department.sort_order || 'Not set'}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-gray-500">Description</div>
                <div className="text-lg">{department.description || 'No description provided'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Cost Center</div>
                <div className="text-lg">{department.cost_center_code || 'Not set'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Color</div>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-6 h-6 rounded border"
                    style={{ backgroundColor: department.color_hex || '#6b7280' }}
                  />
                  <span>{department.color_hex || 'Default'}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'assignments' && (
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Department Assignments</h3>
              <Link href="/dashboard/coordination/workflow/create">
                <Button variant="outline" size="sm">
                  New Assignment
                </Button>
              </Link>
            </div>

            {departmentAssignments.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-4">📋</div>
                <h3 className="text-lg font-medium text-gray-900">No assignments yet</h3>
                <p className="mt-2">This department hasn't been assigned any jobs</p>
              </div>
            ) : (
              <div className="space-y-4">
                {departmentAssignments.map(assignment => (
                  <div key={assignment.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{assignment.job_number || 'Unknown Job'}</div>
                        <div className="text-sm text-gray-600">{assignment.job_title || ''}</div>
                      </div>
                      <div className="flex gap-2">
                        <span className={`px-2 py-1 text-xs rounded ${
                          assignment.status === 'completed' ? 'bg-green-100 text-green-800' :
                          assignment.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {assignment.status?.replace('_', ' ') || 'unknown'}
                        </span>
                        <Link href={`/dashboard/coordination/workflow/${assignment.id}`}>
                          <Button variant="ghost" size="sm">View</Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
