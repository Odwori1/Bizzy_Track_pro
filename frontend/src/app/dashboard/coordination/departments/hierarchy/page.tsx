'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DepartmentHierarchy } from '@/components/department/DepartmentHierarchy';
import { useDepartment } from '@/hooks/useDepartment';
import { DepartmentHierarchy as DepartmentHierarchyType } from '@/types/department';

export default function DepartmentHierarchyPage() {
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
  const [hierarchyData, setHierarchyData] = useState<DepartmentHierarchyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { departments, fetchDepartments } = useDepartment();

  // Load departments
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchDepartments();
      } catch (err: any) {
        setError(err.message || 'Failed to load departments');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fetchDepartments]);

  // Build hierarchy
  useEffect(() => {
    if (departments.length > 0) {
      const map = new Map<string, DepartmentHierarchyType>();
      const roots: DepartmentHierarchyType[] = [];

      // Create map with all departments
      departments.forEach(dept => {
        map.set(dept.id, {
          ...dept,
          children: []
        });
      });

      // Build hierarchy
      departments.forEach(dept => {
        const node = map.get(dept.id)!;
        if (dept.parent_department_id && map.has(dept.parent_department_id)) {
          const parent = map.get(dept.parent_department_id)!;
          parent.children = parent.children || [];
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      });

      setHierarchyData(roots);
    }
  }, [departments]);

  // Toggle department expansion
  const handleToggleExpand = (departmentId: string) => {
    setExpandedDepartments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(departmentId)) {
        newSet.delete(departmentId);
      } else {
        newSet.add(departmentId);
      }
      return newSet;
    });
  };

  // Expand all
  const handleExpandAll = () => {
    const allIds = getAllDepartmentIds(hierarchyData);
    setExpandedDepartments(new Set(allIds));
  };

  // Collapse all
  const handleCollapseAll = () => {
    setExpandedDepartments(new Set());
  };

  // Helper function to get all department IDs in hierarchy
  function getAllDepartmentIds(departments: DepartmentHierarchyType[]): string[] {
    const ids: string[] = [];
    
    function traverse(depts: DepartmentHierarchyType[]) {
      depts.forEach(dept => {
        ids.push(dept.id);
        if (dept.children && dept.children.length > 0) {
          traverse(dept.children);
        }
      });
    }
    
    traverse(departments);
    return ids;
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading department hierarchy...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 font-medium">Error</div>
          <div className="text-red-700 text-sm mt-1">{error}</div>
          <div className="mt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchDepartments()}
            >
              Retry
            </Button>
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
            <h1 className="text-2xl font-bold text-gray-900">Department Hierarchy</h1>
          </div>
          <p className="text-gray-600 mt-1">
            Visualize and manage your department organizational structure
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <Button variant="outline" onClick={handleExpandAll}>
            Expand All
          </Button>
          <Button variant="outline" onClick={handleCollapseAll}>
            Collapse All
          </Button>
          <Link href="/dashboard/coordination/departments/create">
            <Button variant="primary">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Department
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Total Departments</div>
            <div className="text-2xl font-bold text-gray-900">{departments.length}</div>
            <div className="text-sm text-gray-600 mt-1">
              {departments.filter(d => d.is_active).length} active
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Root Departments</div>
            <div className="text-2xl font-bold text-gray-900">
              {hierarchyData.length}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              Top-level departments
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Max Depth</div>
            <div className="text-2xl font-bold text-gray-900">
              {calculateMaxDepth(hierarchyData)} levels
            </div>
            <div className="text-sm text-gray-600 mt-1">
              Deepest hierarchy level
            </div>
          </div>
        </Card>
      </div>

      {/* Hierarchy Visualization */}
      <Card>
        <div className="p-6">
          <DepartmentHierarchy
            departments={hierarchyData}
            expandedDepartments={expandedDepartments}
            onToggleExpand={handleToggleExpand}
            showActions={true}
          />
        </div>
      </Card>

      {/* Department Types */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Department Types Distribution</h3>
          
          <div className="space-y-4">
            {['sales', 'service', 'admin', 'production', 'support'].map(type => {
              const count = departments.filter(d => d.department_type === type).length;
              const percentage = departments.length > 0 ? (count / departments.length) * 100 : 0;
              
              if (count === 0) return null;
              
              return (
                <div key={type} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-gray-200"></div>
                      <span className="text-sm font-medium text-gray-700 capitalize">
                        {type} ({count})
                      </span>
                    </div>
                    <span className="text-sm text-gray-600">{percentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-full rounded-full"
                      style={{ 
                        width: `${percentage}%`,
                        backgroundColor: getTypeColor(type)
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Department Status */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Department Status</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Active vs Inactive</h4>
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">Active</span>
                    <span className="text-sm font-medium text-gray-900">
                      {departments.filter(d => d.is_active).length}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ 
                        width: `${(departments.filter(d => d.is_active).length / departments.length) * 100}%` 
                      }}
                    ></div>
                  </div>
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">Inactive</span>
                    <span className="text-sm font-medium text-gray-900">
                      {departments.filter(d => !d.is_active).length}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-full bg-red-500 rounded-full"
                      style={{ 
                        width: `${(departments.filter(d => !d.is_active).length / departments.length) * 100}%` 
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Parent vs Child</h4>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">Root Departments</span>
                    <span className="text-sm font-medium text-gray-900">
                      {departments.filter(d => !d.parent_department_id).length}
                    </span>
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">Child Departments</span>
                    <span className="text-sm font-medium text-gray-900">
                      {departments.filter(d => d.parent_department_id).length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Helper function to calculate max depth
function calculateMaxDepth(departments: DepartmentHierarchyType[]): number {
  let maxDepth = 0;
  
  function traverse(node: DepartmentHierarchyType, depth: number) {
    maxDepth = Math.max(maxDepth, depth);
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => traverse(child, depth + 1));
    }
  }
  
  departments.forEach(dept => traverse(dept, 1));
  return maxDepth;
}

// Helper function to get type color
function getTypeColor(type: string): string {
  switch (type) {
    case 'sales': return '#3b82f6'; // blue
    case 'service': return '#10b981'; // green
    case 'admin': return '#8b5cf6'; // purple
    case 'production': return '#f59e0b'; // amber
    case 'support': return '#06b6d4'; // cyan
    default: return '#6b7280'; // gray
  }
}
