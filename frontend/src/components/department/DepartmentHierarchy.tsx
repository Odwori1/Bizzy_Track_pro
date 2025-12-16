import React from 'react';
import { DepartmentHierarchy as DepartmentHierarchyType } from '@/types/department';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

interface DepartmentHierarchyProps {
  departments: DepartmentHierarchyType[];
  expandedDepartments: Set<string>;
  onToggleExpand: (departmentId: string) => void;
  onSelect?: (department: DepartmentHierarchyType) => void;
  showActions?: boolean;
}

export const DepartmentHierarchy: React.FC<DepartmentHierarchyProps> = ({
  departments,
  expandedDepartments,
  onToggleExpand,
  onSelect,
  showActions = true,
}) => {
  const renderDepartment = (department: DepartmentHierarchyType, level = 0) => {
    const hasChildren = department.children && department.children.length > 0;
    const isExpanded = expandedDepartments.has(department.id);
    
    // Color based on department type
    const getDepartmentColor = (type: string) => {
      switch (type) {
        case 'sales': return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'service': return 'bg-green-100 text-green-800 border-green-200';
        case 'admin': return 'bg-purple-100 text-purple-800 border-purple-200';
        case 'production': return 'bg-orange-100 text-orange-800 border-orange-200';
        case 'support': return 'bg-teal-100 text-teal-800 border-teal-200';
        default: return 'bg-gray-100 text-gray-800 border-gray-200';
      }
    };

    // Status indicator
    const getStatusIndicator = (isActive: boolean) => {
      return isActive ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Active
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          Inactive
        </span>
      );
    };

    return (
      <div key={department.id} className="mb-2">
        <div
          className={`flex items-center p-4 rounded-lg border ${getDepartmentColor(department.department_type)} hover:shadow-sm transition-shadow`}
          style={{ marginLeft: `${level * 1.5}rem` }}
        >
          {/* Expand/Collapse Button */}
          {hasChildren && (
            <button
              onClick={() => onToggleExpand(department.id)}
              className="mr-3 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-white/50"
            >
              <svg
                className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Spacer for items without children */}
          {!hasChildren && <div className="w-9 flex-shrink-0" />}

          {/* Department Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: department.color_hex || '#6b7280' }}
                />
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {department.name}
                </h3>
                <span className="text-sm font-medium text-gray-600">
                  {department.code}
                </span>
              </div>
              {getStatusIndicator(department.is_active)}
            </div>

            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <p className="truncate">{department.description || 'No description'}</p>
              <span className="flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {department.staff_count || 0} staff
              </span>
            </div>

            {/* Cost Center */}
            {department.cost_center_code && (
              <div className="mt-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cost Center:
                </span>
                <span className="ml-2 text-sm text-gray-700">
                  {department.cost_center_code}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          {showActions && (
            <div className="flex-shrink-0 ml-4 flex space-x-2">
              {onSelect ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelect(department)}
                >
                  Select
                </Button>
              ) : (
                <>
                  <Link href={`/dashboard/coordination/departments/${department.id}`}>
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </Link>
                  <Link href={`/dashboard/coordination/departments/${department.id}/edit`}>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                </>
              )}
            </div>
          )}
        </div>

        {/* Children Departments */}
        {hasChildren && isExpanded && department.children && (
          <div className="mt-1">
            {department.children.map(child => renderDepartment(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Department Hierarchy</h3>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Expand all
              const allIds = getAllDepartmentIds(departments);
              allIds.forEach(id => {
                if (!expandedDepartments.has(id)) onToggleExpand(id);
              });
            }}
          >
            Expand All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Collapse all
              expandedDepartments.forEach(id => onToggleExpand(id));
            }}
          >
            Collapse All
          </Button>
        </div>
      </div>

      {departments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p className="mt-2">No departments found</p>
        </div>
      ) : (
        <div className="space-y-1">
          {departments.map(dept => renderDepartment(dept))}
        </div>
      )}
    </div>
  );
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
