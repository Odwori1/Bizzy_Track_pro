import React, { useState, useEffect } from 'react';
import { Staff, StaffRole } from '@/types/staff';
import { staffApi } from '@/lib/api/staff';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { getAssignableRoles, getRoleDisplayName, getRoleBadgeColor } from '@/lib/rolePermissions';

interface RoleAssignmentProps {
  staff: Staff;
  onRoleAssigned?: (newRole: StaffRole) => void;
  onCancel?: () => void;
}

export const RoleAssignment: React.FC<RoleAssignmentProps> = ({ 
  staff, 
  onRoleAssigned,
  onCancel 
}) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<StaffRole>(staff?.role as StaffRole || 'staff');

  const availableRoles = user ? getAssignableRoles(user.role as any) : [];

  // If current user can't assign the staff's current role, don't allow reassignment
  const canReassign = availableRoles.includes(staff?.role as StaffRole) || staff?.role === 'owner';

  const handleAssignRole = async () => {
    if (!selectedRole || !staff?.id || selectedRole === staff.role) {
      setError('Please select a different role');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Note: This endpoint expects roleId, not role name
      // We need to get role ID from backend
      const roles = await staffApi.getStaffRoles();
      const targetRole = roles.find(r => r.name === selectedRole);
      
      if (!targetRole) {
        throw new Error(`Role ${selectedRole} not found`);
      }

      await staffApi.assignRole(staff.id, targetRole.id);
      
      setSuccess(`Role updated to ${getRoleDisplayName(selectedRole)}`);
      
      if (onRoleAssigned) {
        onRoleAssigned(selectedRole);
      }
    } catch (err: any) {
      console.error('Role assignment error:', err);
      setError(err.message || 'Failed to assign role');
    } finally {
      setLoading(false);
    }
  };

  if (availableRoles.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-700">
          You don't have permission to assign roles to staff members.
        </p>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Staff member not found</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">
        Assign Role
      </h3>

      {/* Current Role Display */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600 mb-2">Current Role</p>
        <div className="flex items-center">
          <span className={`px-3 py-1 rounded-full ${getRoleBadgeColor(staff.role as StaffRole)}`}>
            {getRoleDisplayName(staff.role as StaffRole)}
          </span>
          <p className="ml-4 text-sm text-gray-700">
            {staff.full_name || 'Staff Member'} • {staff.email || 'No email'}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
          {success}
        </div>
      )}

      {/* Role Selection */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select New Role
          </label>
          <div className="space-y-2">
            {availableRoles.map(role => (
              <div
                key={role}
                className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedRole === role
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
                onClick={() => setSelectedRole(role)}
              >
                <div className={`h-4 w-4 rounded-full border mr-3 ${
                  selectedRole === role
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-300'
                }`}></div>
                <div>
                  <span className={`px-2 py-1 text-xs rounded-full ${getRoleBadgeColor(role)}`}>
                    {getRoleDisplayName(role)}
                  </span>
                  <p className="text-sm text-gray-600 mt-1">
                    {role === 'owner' && 'Full system access with all permissions'}
                    {role === 'manager' && 'Management access without business settings'}
                    {role === 'supervisor' && 'Team supervision with limited management'}
                    {role === 'staff' && 'Basic operational access (read-only for most features)'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Warning for role changes */}
        {selectedRole !== staff.role && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex">
              <svg className="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.502 0L4.282 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  Changing roles will affect what this staff member can access.
                  They may lose access to some features or gain access to others.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-3 pt-4 border-t">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
        )}
        <Button
          type="button"
          onClick={handleAssignRole}
          loading={loading}
          disabled={selectedRole === staff.role || !canReassign}
        >
          {selectedRole === staff.role ? 'No Change Needed' : 'Assign Role'}
        </Button>
      </div>
    </div>
  );
};
