import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Department } from '@/types/department';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { departmentApi } from '@/lib/api/department';

interface DepartmentCardProps {
  department: Department;
  showActions?: boolean;
  onSelect?: (department: Department) => void;
  onDelete?: () => void;
  hasChildren?: boolean;
  onViewChildren?: () => void;
  isChildView?: boolean;
  childCount?: number;
  isLeafNode?: boolean;
}

export const DepartmentCard: React.FC<DepartmentCardProps> = ({
  department,
  showActions = true,
  onSelect,
  onDelete,
  hasChildren = false,
  onViewChildren,
  isChildView = false,
  childCount = 0,
  isLeafNode = false
}) => {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const formatDate = (date: any) => {
    if (!date) return 'Never';
    try {
      if (typeof date === 'object' && date.utc) {
        return new Date(date.utc).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      }
      return new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const getDepartmentTypeColor = (type: string) => {
    switch (type) {
      case 'sales': return 'bg-blue-100 text-blue-800';
      case 'service': return 'bg-green-100 text-green-800';
      case 'admin': return 'bg-purple-100 text-purple-800';
      case 'production': return 'bg-orange-100 text-orange-800';
      case 'support': return 'bg-cyan-100 text-cyan-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    return name
      .split(' ')
      .filter(part => part.length > 0)
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  };

  const handleView = () => {
    router.push(`/dashboard/coordination/departments/${department.id}`);
  };

  const handleEdit = () => {
    router.push(`/dashboard/coordination/departments/${department.id}/edit`);
  };

  // Function to create child department
  const handleCreateChild = () => {
    router.push(`/dashboard/coordination/departments/create?parent=${department.id}`);
  };

  const handleDeleteClick = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    try {
      setIsDeleting(true);
      console.log('Deleting department:', department.id, department.name);

      // Call API directly
      const result = await departmentApi.deleteDepartment(department.id);
      console.log('Delete result:', result);

      // Show success message
      alert(`Department "${department.name}" deleted successfully`);

      // Notify parent to refresh list
      if (onDelete) {
        onDelete();
      }

      // Also refresh the page if we're on a department details page
      if (window.location.pathname.includes(`/departments/${department.id}`)) {
        router.push('/dashboard/coordination/departments');
      }

    } catch (error: any) {
      console.error('Failed to delete department:', error);
      alert(`Failed to delete department: ${error.message || 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  const cancelDelete = () => {
    setShowConfirm(false);
  };

  // Get hierarchy level indicator text
  const getHierarchyIndicator = () => {
    if (isChildView && department.parent_department_id) {
      return '↳ Direct Child';
    } else if (department.parent_department_id) {
      return 'Child Department';
    } else {
      return 'Top-Level Department';
    }
  };

  // Get child status text
  const getChildStatusText = () => {
    if (hasChildren) {
      return `${childCount} direct child${childCount !== 1 ? 'ren' : ''}`;
    } else if (isLeafNode) {
      return 'No children';
    }
    return '';
  };

  // Get hierarchy indicator color
  const getHierarchyColor = () => {
    if (isChildView) {
      return 'bg-blue-50 text-blue-600';
    } else if (department.parent_department_id) {
      return 'bg-gray-50 text-gray-600';
    } else {
      return 'bg-green-50 text-green-600';
    }
  };

  return (
    <Card className={`hover:shadow-md transition-shadow duration-200 flex flex-col h-full ${isChildView ? 'border-l-4 border-l-blue-300' : ''}`}>
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${department.color_hex ? '' : 'bg-gray-100'}`}
                style={department.color_hex ? { backgroundColor: department.color_hex } : {}}
              >
                <span className={`font-semibold ${department.color_hex ? 'text-white' : 'text-gray-700'}`}>
                  {getInitials(department.name)}
                </span>
              </div>
              {/* Child count indicator badge */}
              {hasChildren && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                  <span className="text-xs text-white font-semibold">{childCount}</span>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-1 mb-1">
                <CardTitle className="text-lg font-semibold text-gray-900 truncate">
                  {department.name}
                </CardTitle>
                <Badge className={`${getDepartmentTypeColor(department.department_type)} flex-shrink-0`}>
                  {department.department_type}
                </Badge>
              </div>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-sm text-gray-500 truncate">Code: {department.code}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${getStatusColor(department.is_active)}`}>
                  {department.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-grow">
        {/* Hierarchy indicator */}
        <div className="flex items-center text-xs mb-2">
          <div className={`px-2 py-0.5 rounded ${getHierarchyColor()}`}>
            {getHierarchyIndicator()}
          </div>
        </div>

        {department.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">{department.description}</p>
        )}

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="truncate">
            <span className="text-gray-500">Cost Center:</span>
            <span className="ml-2 text-gray-700 font-medium truncate">
              {department.cost_center_code || 'Not set'}
            </span>
          </div>
          <div className="truncate">
            <span className="text-gray-500">Sort Order:</span>
            <span className="ml-2 text-gray-700 font-medium">{department.sort_order}</span>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500">Created:</span>
            <span className="ml-2 text-gray-700">{formatDate(department.created_at)}</span>
          </div>
        </div>

        {/* Child status indicator */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {getChildStatusText()}
            </div>
            {hasChildren && (
              <button
                onClick={onViewChildren}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center"
              >
                View all <span className="ml-1">→</span>
              </button>
            )}
          </div>
        </div>
      </CardContent>

      {/* Actions Footer - UPDATED: Show BOTH Add Child and View Children when has children */}
      {showActions && (
        <div className="p-4 pt-0 mt-auto">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleView}
              className="w-full"
            >
              View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEdit}
              className="w-full"
            >
              Edit
            </Button>
            
            {/* Add Child Button - ALWAYS SHOWN */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateChild}
              className="w-full border-green-200 text-green-700 hover:bg-green-50 flex items-center justify-center"
            >
              <span className="mr-1">＋</span>
              Add Child
            </Button>
            
            {/* View Children Button - ONLY SHOWN WHEN HAS CHILDREN */}
            {hasChildren && (
              <Button
                variant="outline"
                size="sm"
                onClick={onViewChildren}
                className="w-full bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 flex items-center justify-center"
              >
                <span className="mr-1">👥</span>
                View Children ({childCount})
              </Button>
            )}
            
            {/* If no children, show an empty space or alternative button */}
            {!hasChildren && (
              <Link
                href={`/dashboard/coordination/departments/${department.id}`}
                className="col-span-1"
              >
                <Button variant="ghost" size="sm" className="w-full">
                  Details
                </Button>
              </Link>
            )}
            
            {/* Delete Button with confirmation */}
            {!showConfirm ? (
              <div className={`${!hasChildren ? 'col-span-1' : 'col-span-2'}`}>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteClick}
                  disabled={isDeleting}
                  className="w-full"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            ) : (
              <div className="col-span-2 flex gap-2 flex-col w-full">
                <div className="text-xs text-red-600 mb-1 text-center">
                  Confirm delete?
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteClick}
                    disabled={isDeleting}
                    className="flex-1"
                  >
                    {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelDelete}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
