'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { DepartmentCard } from '@/components/department/DepartmentCard';
import { DepartmentHierarchy } from '@/components/department/DepartmentHierarchy';
import { departmentApi } from '@/lib/api/department';
import { Department, DepartmentHierarchy as DepartmentHierarchyType } from '@/types/department';

export default function DepartmentsPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'hierarchy'>('grid');
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
  const [hierarchyData, setHierarchyData] = useState<DepartmentHierarchyType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Statistics states
  const [totalDepartments, setTotalDepartments] = useState(0);
  const [activeDepartments, setActiveDepartments] = useState(0);
  const [inactiveDepartments, setInactiveDepartments] = useState(0);

  // Load departments with cache busting - DIRECT API CALL (NO HOOK)
  useEffect(() => {
    const fetchDepartments = async () => {
      setLoading(true);
      setError(null);
      try {
        // Use direct API call with cache busting
        const data = await departmentApi.getDepartments({
          include_inactive: true,
          _t: Date.now() // Cache busting
        });

        setDepartments(data);

        // Calculate statistics
        const activeCount = data.filter((dept: Department) => dept.is_active).length;
        const inactiveCount = data.filter((dept: Department) => !dept.is_active).length;

        // Update statistics states
        setTotalDepartments(data.length);
        setActiveDepartments(activeCount);
        setInactiveDepartments(inactiveCount);
      } catch (err: any) {
        setError(err.message || 'Failed to load departments');
      } finally {
        setLoading(false);
      }
    };

    fetchDepartments();
  }, [refreshTrigger]); // Only re-run when refreshTrigger changes

  // Use useMemo to avoid recalculating on every render
  const filteredDepartments = useMemo(() => {
    return departments.filter(dept => {
      // Apply status filter
      if (statusFilter === 'active' && !dept.is_active) return false;
      if (statusFilter === 'inactive' && dept.is_active) return false;

      // Apply search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          dept.name.toLowerCase().includes(term) ||
          dept.code.toLowerCase().includes(term) ||
          dept.description?.toLowerCase().includes(term) ||
          dept.department_type.toLowerCase().includes(term)
        );
      }

      return true;
    });
  }, [departments, searchTerm, statusFilter]); // Only recalc when these change

  // Build hierarchy - useMemo to prevent infinite loop
  const displayHierarchyData = useMemo(() => {
    if (filteredDepartments.length === 0) return [];

    const map = new Map<string, DepartmentHierarchyType>();
    const roots: DepartmentHierarchyType[] = [];

    filteredDepartments.forEach(dept => {
      map.set(dept.id, { ...dept, children: [] });
    });

    filteredDepartments.forEach(dept => {
      const node = map.get(dept.id)!;
      if (dept.parent_department_id && map.has(dept.parent_department_id)) {
        const parent = map.get(dept.parent_department_id)!;
        parent.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }, [filteredDepartments]);

  // Update hierarchy data separately
  useEffect(() => {
    setHierarchyData(displayHierarchyData);
  }, [displayHierarchyData]);

  const handleToggleExpand = (departmentId: string) => {
    setExpandedDepartments(prev => {
      const newSet = new Set(prev);
      newSet.has(departmentId) ? newSet.delete(departmentId) : newSet.add(departmentId);
      return newSet;
    });
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Departments to display in grid view
  const displayDepartments = useMemo(() => {
    return filteredDepartments.filter(dept => showInactive || dept.is_active);
  }, [filteredDepartments, showInactive]);

  // Hierarchy data to display
  const displayHierarchy = useMemo(() => {
    return hierarchyData.filter(dept => showInactive || dept.is_active);
  }, [hierarchyData, showInactive]);

  if (loading && departments.length === 0) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading departments...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <div className="p-6 text-center">
            <div className="text-red-600 mb-4">Error: {error}</div>
            <Button onClick={handleRefresh}>Retry</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-gray-600 mt-1">
            Manage and organize your business departments and hierarchy
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link href="/dashboard/coordination/departments/create">
            <Button variant="primary">
              Create Department
            </Button>
          </Link>
          <Link href="/dashboard/coordination/departments/hierarchy">
            <Button variant="outline">
              View Hierarchy
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats - Using calculated statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-gray-500">Total Departments</div>
          <div className="text-2xl font-bold">{totalDepartments}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">Active</div>
          <div className="text-2xl font-bold text-green-600">{activeDepartments}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">Inactive</div>
          <div className="text-2xl font-bold text-gray-500">{inactiveDepartments}</div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${viewMode === 'grid' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setViewMode('hierarchy')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${viewMode === 'hierarchy' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  Hierarchy
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${statusFilter === 'all' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  All
                </button>
                <button
                  onClick={() => setStatusFilter('active')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${statusFilter === 'active' ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  Active
                </button>
                <button
                  onClick={() => setStatusFilter('inactive')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${statusFilter === 'inactive' ? 'bg-red-100 text-red-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  Inactive
                </button>
              </div>
            </div>

            <div className="flex-1 sm:max-w-xs">
              <Input
                type="text"
                placeholder="Search departments..."
                value={searchTerm}
                onChange={handleSearch}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Department Count and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-sm text-gray-600">
          Showing {displayDepartments.length} of {departments.length} departments
          {searchTerm && ` for "${searchTerm}"`}
          {statusFilter !== 'all' && ` (${statusFilter})`}
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${showInactive ? 'bg-gray-100 text-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {showInactive ? 'Hide Inactive' : 'Show Inactive'}
            </button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="text-gray-500"
          >
            ↻ Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'grid' ? (
        displayDepartments.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <div className="text-4xl mb-4">🏢</div>
              <h3 className="text-lg font-medium text-gray-900">No departments found</h3>
              <p className="mt-1 text-gray-500">
                {searchTerm || statusFilter !== 'all'
                  ? 'Try changing your search or filter criteria'
                  : 'Get started by creating your first department.'}
              </p>
              <div className="mt-6">
                <Link href="/dashboard/coordination/departments/create">
                  <Button variant="primary">
                    Create Department
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayDepartments.map((department: Department) => (
              <DepartmentCard
                key={department.id}
                department={department}
                onDelete={handleRefresh}
              />
            ))}
          </div>
        )
      ) : (
        displayHierarchy.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <div className="text-4xl mb-4">🏢</div>
              <h3 className="text-lg font-medium text-gray-900">No departments found</h3>
            </div>
          </Card>
        ) : (
          <DepartmentHierarchy
            departments={displayHierarchy}
            expandedDepartments={expandedDepartments}
            onToggleExpand={handleToggleExpand}
          />
        )
      )}
    </div>
  );
}
