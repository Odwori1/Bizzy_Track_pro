import React from 'react';
import Link from 'next/link';
import { Staff, StaffRole } from '@/types/staff';
import { Button } from '@/components/ui/Button';
import { getRoleBadgeColor, getRoleDisplayName } from '@/lib/rolePermissions';

interface StaffCardProps {
  staff: Staff;
  showActions?: boolean;
  onSelect?: (staff: Staff) => void;
}

export const StaffCard: React.FC<StaffCardProps> = ({ 
  staff, 
  showActions = true,
  onSelect 
}) => {
  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'Never';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name) return '??';
    
    // Clean up the name and get initials
    const cleanedName = name.trim();
    if (cleanedName.length === 0) return '??';
    
    return cleanedName
      .split(' ')
      .filter(part => part.length > 0)
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
  };

  // Safely get staff properties with defaults
  const safeStaff = {
    id: staff?.id || '',
    email: staff?.email || 'No email',
    full_name: staff?.full_name || 'Unknown Staff',
    role: (staff?.role || 'staff') as StaffRole,
    phone: staff?.phone,
    department_id: staff?.department_id,
    department_name: staff?.department_name,
    is_active: staff?.is_active !== undefined ? staff.is_active : true,
    last_login_at: staff?.last_login_at,
    created_at: staff?.created_at || new Date().toISOString(),
    updated_at: staff?.updated_at || new Date().toISOString(),
    hourly_rate: staff?.hourly_rate,
    notes: staff?.notes,
    invitation_status: staff?.invitation_status,
    is_staff: staff?.is_staff || false,
    business_id: staff?.business_id || ''
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
      {/* Header with Avatar and Basic Info */}
      <div className="flex items-start space-x-4 mb-4">
        <div className="flex-shrink-0">
          <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-blue-600 text-xl font-semibold">
              {getInitials(safeStaff.full_name)}
            </span>
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {safeStaff.full_name}
            </h3>
            <span className={`text-xs px-2 py-1 rounded-full ${getRoleBadgeColor(safeStaff.role)}`}>
              {getRoleDisplayName(safeStaff.role)}
            </span>
          </div>
          
          <p className="text-sm text-gray-600 truncate mb-2">
            {safeStaff.email}
          </p>
          
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Last login: {formatDate(safeStaff.last_login_at)}</span>
            </div>
            
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-1 ${safeStaff.is_active ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className={getStatusColor(safeStaff.is_active)}>
                {safeStaff.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Phone</p>
          <p className="text-sm font-medium text-gray-900">
            {safeStaff.phone || 'Not provided'}
          </p>
        </div>
        
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Hourly Rate</p>
          <p className="text-sm font-medium text-gray-900">
            {safeStaff.hourly_rate ? `$${safeStaff.hourly_rate.toFixed(2)}/hr` : 'Not set'}
          </p>
        </div>
        
        {safeStaff.department_name && (
          <div className="col-span-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Department</p>
            <p className="text-sm font-medium text-gray-900">
              {safeStaff.department_name}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      {showActions && (
        <div className="flex justify-end space-x-2 pt-4 border-t">
          {onSelect ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelect(staff)}
            >
              Select
            </Button>
          ) : (
            <>
              <Link href={`/dashboard/management/staff/${safeStaff.id}`}>
                <Button variant="ghost" size="sm">
                  View
                </Button>
              </Link>
              <Link href={`/dashboard/management/staff/${safeStaff.id}/edit`}>
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              </Link>
              <Link href={`/dashboard/management/staff/${safeStaff.id}/performance`}>
                <Button variant="ghost" size="sm">
                  Performance
                </Button>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
};
