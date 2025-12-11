import React, { useState, useEffect } from 'react';
import { Staff } from '@/types/staff';
import { staffApi } from '@/lib/api/staff';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface Department {
  id: string;
  name: string;
  description?: string;
  parent_department_id?: string | null;
  is_active: boolean;
}

interface DepartmentAssignmentProps {
  staff: Staff;
  onDepartmentAssigned?: (departmentId: string, departmentName: string) => void;
  onCancel?: () => void;
}

export const DepartmentAssignment: React.FC<DepartmentAssignmentProps> = ({ 
  staff, 
  onDepartmentAssigned,
  onCancel 
}) => {
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(staff.department_id || '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const deptData = await apiClient.get<Department[]>('/departments');
      setDepartments(deptData);
    } catch (err) {
      console.error('Failed to fetch departments:', err);
      setError('Failed to load departments');
    }
  };

  const handleAssignDepartment = async () => {
    if (!selectedDepartmentId) {
      setError('Please select a department');
      return;
    }

    if (selectedDepartmentId === staff.department_id) {
      setError('Staff is already assigned to this department');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Find department name for success message
      const selectedDept = departments.find(dept => dept.id === selectedDepartmentId);
      
      // Use the staff API to assign department
      await staffApi.assignToDepartment(staff.id, selectedDepartmentId);
      
      setSuccess(`Successfully assigned to ${selectedDept?.name || 'department'}`);
      
      if (onDepartmentAssigned) {
        onDepartmentAssigned(selectedDepartmentId, selectedDept?.name || '');
      }
    } catch (err: any) {
      console.error('Department assignment error:', err);
      setError(err.message || 'Failed to assign department');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDepartment = async () => {
    if (!confirm('Remove this staff member from their current department?')) return;

    setLoading(true);
    setError(null);

    try {
      // To remove department assignment, we update the staff with null department_id
      await staffApi.updateStaff(staff.id, { department_id: null });
      
      setSelectedDepartmentId('');
      setSuccess('Department assignment removed');
      
      if (onDepartmentAssigned) {
        onDepartmentAssigned('', '');
      }
    } catch (err: any) {
      console.error('Remove department error:', err);
      setError(err.message || 'Failed to remove department assignment');
    } finally {
      setLoading(false);
    }
  };

  const getDepartmentHierarchy = (depts: Department[]): Department[] => {
    // Simple hierarchy display - in a real app, you'd want to build a tree
    return depts.sort((a, b) => a.name.localeCompare(b.name));
  };

  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">
        Assign Department
      </h3>

      {/* Current Department Display */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600 mb-2">Current Department</p>
        <div className="flex items-center justify-between">
          <div>
            {staff.department_id ? (
              <div>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                  {staff.department_name || 'Department'}
                </span>
                <p className="text-sm text-gray-700 mt-1">
                  {staff.full_name} • {staff.email}
                </p>
              </div>
            ) : (
              <div>
                <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm">
                  No department assigned
                </span>
                <p className="text-sm text-gray-700 mt-1">
                  This staff member is not assigned to any department
                </p>
              </div>
            )}
          </div>
          
          {staff.department_id && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleRemoveDepartment}
              disabled={loading}
            >
              Remove
            </Button>
          )}
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

      {/* Department Selection */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Department
          </label>
          
          {departments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No departments available</p>
              <p className="text-sm mt-1">
                Create departments in the coordination section first
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto p-2 border rounded-lg">
              <div
                className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedDepartmentId === ''
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
                onClick={() => setSelectedDepartmentId('')}
              >
                <div className={`h-4 w-4 rounded-full border mr-3 ${
                  selectedDepartmentId === ''
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-300'
                }`}></div>
                <div>
                  <span className="font-medium text-gray-900">No Department</span>
                  <p className="text-sm text-gray-600 mt-1">
                    Staff member will not be assigned to any department
                  </p>
                </div>
              </div>
              
              {getDepartmentHierarchy(departments).map(dept => (
                <div
                  key={dept.id}
                  className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedDepartmentId === dept.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedDepartmentId(dept.id)}
                >
                  <div className={`h-4 w-4 rounded-full border mr-3 ${
                    selectedDepartmentId === dept.id
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}></div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{dept.name}</span>
                      {!dept.is_active && (
                        <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    {dept.description && (
                      <p className="text-sm text-gray-600 mt-1">{dept.description}</p>
                    )}
                    {dept.parent_department_id && (
                      <p className="text-xs text-gray-500 mt-1">
                        Sub-department
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Department creation hint */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex">
            <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                Departments help organize staff into teams and track performance by department.
                Staff can be assigned to multiple departments if needed.
              </p>
            </div>
          </div>
        </div>
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
          onClick={handleAssignDepartment}
          loading={loading}
          disabled={selectedDepartmentId === staff.department_id}
        >
          {selectedDepartmentId === staff.department_id ? 'Already Assigned' : 'Assign Department'}
        </Button>
      </div>
    </div>
  );
};
