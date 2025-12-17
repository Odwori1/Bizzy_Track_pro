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
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

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

  // Get departments for the current view - Shows direct children when viewing a parent
  const displayDepartments = useMemo(() => {
    let depts;
    
    if (selectedParentId) {
      // Show ALL direct children of selected parent
      depts = filteredDepartments.filter(dept => dept.parent_department_id === selectedParentId);
    } else {
      // Show ALL top-level departments (no parent)
      depts = filteredDepartments.filter(dept => !dept.parent_department_id);
    }
    
    // Apply inactive filter
    return depts.filter(dept => showInactive || dept.is_active);
  }, [filteredDepartments, selectedParentId, showInactive]);

  // Get child counts for all departments - Counts direct children only
  const childCounts = useMemo(() => {
    const counts = new Map<string, number>();
    departments.forEach(dept => {
      if (dept.parent_department_id) {
        counts.set(dept.parent_department_id, (counts.get(dept.parent_department_id) || 0) + 1);
      }
    });
    return counts;
  }, [departments]);

  // Get total descendant count (all levels) for a department
  const getTotalDescendantCount = useMemo(() => {
    const countDescendants = (parentId: string): number => {
      const children = departments.filter(dept => dept.parent_department_id === parentId);
      let total = children.length;
      children.forEach(child => {
        total += countDescendants(child.id);
      });
      return total;
    };
    return countDescendants;
  }, [departments]);

  // Get the selected parent department
  const selectedParentDepartment = useMemo(() => {
    if (!selectedParentId) return null;
    return departments.find(dept => dept.id === selectedParentId);
  }, [departments, selectedParentId]);

  // Get breadcrumb trail for navigation
  const breadcrumbTrail = useMemo(() => {
    const trail: Department[] = [];
    
    if (!selectedParentId) return trail;
    
    // Build trail by finding parent chain
    let currentDept = selectedParentDepartment;
    while (currentDept) {
      trail.unshift(currentDept);
      if (currentDept.parent_department_id) {
        currentDept = departments.find(d => d.id === currentDept!.parent_department_id);
      } else {
        currentDept = null;
      }
    }
    
    return trail;
  }, [departments, selectedParentId, selectedParentDepartment]);

  // Get orphaned departments (departments with parent IDs that don't exist)
  const orphanedDepartments = useMemo(() => {
    return filteredDepartments.filter(dept => 
      dept.parent_department_id && 
      !departments.find(d => d.id === dept.parent_department_id)
    );
  }, [filteredDepartments, departments]);

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
    setSelectedParentId(null);
  };

  const handleViewChildren = (parentId: string) => {
    setSelectedParentId(parentId);
  };

  const handleBackToParent = () => {
    if (selectedParentDepartment?.parent_department_id) {
      // Go back to grandparent
      setSelectedParentId(selectedParentDepartment.parent_department_id);
    } else {
      // Go back to top-level
      setSelectedParentId(null);
    }
  };

  const handleBreadcrumbClick = (departmentId: string | null) => {
    setSelectedParentId(departmentId);
  };

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

      {/* Breadcrumb Navigation */}
      {(selectedParentId || breadcrumbTrail.length > 0) && (
        <div className="flex items-center space-x-2 text-sm bg-blue-50 p-3 rounded-lg">
          <button
            onClick={() => handleBreadcrumbClick(null)}
            className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
          >
            All Departments
          </button>
          
          {breadcrumbTrail.map((dept, index) => (
            <div key={dept.id} className="flex items-center">
              <span className="text-gray-400 mx-1">/</span>
              {index === breadcrumbTrail.length - 1 ? (
                <div className="flex items-center">
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs font-medium text-white flex-shrink-0"
                    style={dept.color_hex ? { backgroundColor: dept.color_hex } : { backgroundColor: '#6b7280' }}
                  >
                    {dept.name.split(' ').filter(part => part.length > 0).map(part => part.charAt(0).toUpperCase()).slice(0, 2).join('')}
                  </div>
                  <span className="text-gray-700 font-medium truncate">
                    {dept.name}
                  </span>
                  <span className="ml-2 text-gray-500 text-xs">
                    ({childCounts.get(dept.id) || 0} direct children)
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => handleBreadcrumbClick(dept.id)}
                  className="text-blue-600 hover:text-blue-800 hover:underline truncate max-w-xs"
                >
                  {dept.name}
                </button>
              )}
            </div>
          ))}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={selectedParentId ? handleBackToParent : () => handleBreadcrumbClick(null)}
            className="ml-auto"
          >
            {selectedParentId ? '← Back' : '← Back to All'}
          </Button>
        </div>
      )}

      {/* Department Count and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-sm text-gray-600">
          {selectedParentId ? (
            <>
              Showing {displayDepartments.length} direct child department{displayDepartments.length !== 1 ? 's' : ''} of "{selectedParentDepartment?.name}"
              {childCounts.get(selectedParentId) > 0 && (
                <span className="ml-2 text-blue-600">
                  (Total descendants: {getTotalDescendantCount(selectedParentId)})
                </span>
              )}
            </>
          ) : (
            <>
              Showing {displayDepartments.length} of {departments.length} departments
              {searchTerm && ` for "${searchTerm}"`}
              {statusFilter !== 'all' && ` (${statusFilter})`}
              <span className="ml-2">
                ({displayDepartments.length} top-level, {filteredDepartments.length - displayDepartments.length} child departments)
              </span>
            </>
          )}
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
              <h3 className="text-lg font-medium text-gray-900">
                {selectedParentId ? 'No child departments found' : 'No departments found'}
              </h3>
              <p className="mt-1 text-gray-500">
                {selectedParentId
                  ? 'This department doesn\'t have any child departments yet.'
                  : searchTerm || statusFilter !== 'all'
                  ? 'Try changing your search or filter criteria'
                  : 'Get started by creating your first department.'}
              </p>
              <div className="mt-6">
                {selectedParentId ? (
                  <Button variant="outline" onClick={handleBackToParent}>
                    ← Back
                  </Button>
                ) : (
                  <Link href="/dashboard/coordination/departments/create">
                    <Button variant="primary">
                      Create Department
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Main Department Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayDepartments.map((department: Department) => {
                const directChildCount = childCounts.get(department.id) || 0;
                const hasChildren = directChildCount > 0;
                const isLeafNode = directChildCount === 0;
                
                return (
                  <DepartmentCard
                    key={department.id}
                    department={department}
                    onDelete={handleRefresh}
                    hasChildren={hasChildren}
                    onViewChildren={() => handleViewChildren(department.id)}
                    isChildView={!!selectedParentId}
                    childCount={directChildCount}
                    isLeafNode={isLeafNode}
                  />
                );
              })}
            </div>

            {/* Orphaned Departments Section - Only show at top level */}
            {!selectedParentId && orphanedDepartments.length > 0 && (
              <div className="mt-8 pt-8 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <span className="text-amber-600 mr-2">⚠</span>
                  Orphaned Departments
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    (Parent department not found)
                  </span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-75">
                  {orphanedDepartments.map((department: Department) => {
                    const directChildCount = childCounts.get(department.id) || 0;
                    const hasChildren = directChildCount > 0;
                    const isLeafNode = directChildCount === 0;
                    
                    return (
                      <DepartmentCard
                        key={department.id}
                        department={department}
                        onDelete={handleRefresh}
                        hasChildren={hasChildren}
                        onViewChildren={() => handleViewChildren(department.id)}
                        isChildView={true}
                        childCount={directChildCount}
                        isLeafNode={isLeafNode}
                      />
                    );
                  })}
                </div>
              </div>
            )}
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
