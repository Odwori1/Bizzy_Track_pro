import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Department, DepartmentFormData } from '@/types/department';
import { useDepartment } from '@/hooks/useDepartment';
import { useStaff } from '@/hooks/useStaff';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
// Import Select correctly - check if it's exported as Select or select
import { Select } from '@/components/ui/select';  // Assuming it's exported as Select
import { Textarea } from '@/components/ui/Textarea';

interface DepartmentFormProps {
  department?: Department;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const DEPARTMENT_TYPES = [
  { value: 'sales', label: 'Sales' },
  { value: 'service', label: 'Service' },
  { value: 'admin', label: 'Admin' },
  { value: 'production', label: 'Production' },
  { value: 'support', label: 'Support' },
  { value: 'operations', label: 'Operations' },
  { value: 'finance', label: 'Finance' },
  { value: 'hr', label: 'Human Resources' },
  { value: 'it', label: 'IT' },
  { value: 'marketing', label: 'Marketing' },
];

export const DepartmentForm: React.FC<DepartmentFormProps> = ({
  department,
  onSuccess,
  onCancel
}) => {
  const router = useRouter();
  const { createDepartment, updateDepartment, departments, loading: deptLoading, error: deptError, clearError } = useDepartment();
  const { staff, fetchStaff } = useStaff();
  const isEditMode = !!department;

  const [formData, setFormData] = useState<DepartmentFormData>({
    name: department?.name || '',
    code: department?.code || '',
    description: department?.description || '',
    parent_department_id: department?.parent_department_id || null,
    cost_center_code: department?.cost_center_code || '',
    department_type: department?.department_type || 'service',
    color_hex: department?.color_hex || '#3B82F6',
    sort_order: department?.sort_order || 0,
    is_active: department?.is_active ?? true,
    manager_id: department?.manager_id || null,
    staff_ids: department?.staff_ids || [],
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [parentDepartments, setParentDepartments] = useState<Array<{id: string, name: string}>>([]);
  const [availableStaff, setAvailableStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Load parent departments for dropdown
  useEffect(() => {
    const availableParents = departments
      .filter(dept => !department || dept.id !== department.id) // Can't be parent of itself
      .map(dept => ({ id: dept.id, name: dept.name }));
    setParentDepartments(availableParents);
  }, [departments, department]);

  // Load staff data
  useEffect(() => {
    const loadStaff = async () => {
      try {
        await fetchStaff();
      } catch (error) {
        console.error('Failed to load staff:', error);
      }
    };
    loadStaff();
  }, [fetchStaff]);

  // Filter available staff (staff not assigned to any department or assigned to this department)
  useEffect(() => {
    if (staff && staff.length > 0) {
      const filtered = staff.filter(staffMember =>
        !staffMember.department_id ||
        staffMember.department_id === department?.id
      );
      setAvailableStaff(filtered);
    }
  }, [staff, department?.id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'sort_order' || name === 'parent_department_id' || name === 'manager_id') {
      const numValue = value === '' || value === 'null' ? null : value;
      setFormData(prev => ({ ...prev, [name]: numValue }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }

    // Clear errors when user starts typing
    if (formError) setFormError(null);
    if (deptError) clearError();
  };

  const handleSelectChange = (name: string, value: string) => {
    if (name === 'parent_department_id' || name === 'manager_id') {
      const val = value === 'null' ? null : value;
      setFormData(prev => ({ ...prev, [name]: val }));
    } else if (name === 'is_active') {
      setFormData(prev => ({ ...prev, [name]: value === 'true' }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleStaffSelection = (staffId: string) => {
    setFormData(prev => {
      const currentStaffIds = prev.staff_ids || [];
      if (currentStaffIds.includes(staffId)) {
        // Remove staff member
        return {
          ...prev,
          staff_ids: currentStaffIds.filter(id => id !== staffId)
        };
      } else {
        // Add staff member
        return {
          ...prev,
          staff_ids: [...currentStaffIds, staffId]
        };
      }
    });
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setFormError('Department name is required');
      return false;
    }
    if (!formData.code.trim()) {
      setFormError('Department code is required');
      return false;
    }
    if (!formData.department_type) {
      setFormError('Department type is required');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();
    setLoading(true);

    if (!validateForm()) {
      setLoading(false);
      return;
    }

    try {
      if (isEditMode && department) {
        await updateDepartment(department.id, formData);
      } else {
        await createDepartment(formData);
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/dashboard/coordination/departments');
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to save department');
    } finally {
      setLoading(false);
    }
  };

  const statusOptions = [
    { value: 'true', label: 'Active Department' },
    { value: 'false', label: 'Inactive Department' },
  ];

  // Get staff assigned to this department
  const assignedStaff = staff?.filter(s => s.department_id === department?.id) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEditMode ? 'Edit Department' : 'Create New Department'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {(formError || deptError) && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {formError || deptError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Department Name *
              </label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Sales Department"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Department Code *
              </label>
              <Input
                name="code"
                value={formData.code}
                onChange={handleChange}
                placeholder="e.g., SALES"
                required
                className="uppercase"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Department Type *
              </label>
              <Select
                value={formData.department_type}
                onValueChange={(value) => handleSelectChange('department_type', value)}
                options={DEPARTMENT_TYPES}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Parent Department
              </label>
              <Select
                value={formData.parent_department_id || 'null'}
                onValueChange={(value) => handleSelectChange('parent_department_id', value)}
                options={[
                  { value: 'null', label: 'No Parent (Top Level)' },
                  ...parentDepartments.map(dept => ({
                    value: dept.id,
                    label: dept.name
                  }))
                ]}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Cost Center Code
              </label>
              <Input
                name="cost_center_code"
                value={formData.cost_center_code}
                onChange={handleChange}
                placeholder="e.g., CC-001"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Color
              </label>
              <div className="flex items-center space-x-2">
                <Input
                  type="color"
                  name="color_hex"
                  value={formData.color_hex}
                  onChange={handleChange}
                  className="w-12 h-10 p-1"
                />
                <Input
                  name="color_hex"
                  value={formData.color_hex}
                  onChange={handleChange}
                  placeholder="#3B82F6"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Sort Order
              </label>
              <Input
                type="number"
                name="sort_order"
                value={formData.sort_order}
                onChange={handleChange}
                min="0"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Status
              </label>
              <Select
                value={formData.is_active ? 'true' : 'false'}
                onValueChange={(value) => handleSelectChange('is_active', value)}
                options={statusOptions}
              />
            </div>
          </div>

          {/* Manager Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Department Manager
            </label>
            <Select
              value={formData.manager_id || ''}
              onValueChange={(value) => handleSelectChange('manager_id', value)}
              options={[
                { value: '', label: 'No Manager Selected' },
                ...(availableStaff.map(staffMember => ({
                  value: staffMember.id,
                  label: `${staffMember.full_name} (${staffMember.email})`
                })) || [])
              ]}
            />
            <p className="mt-1 text-sm text-gray-500">
              Select a staff member to manage this department
            </p>
          </div>

          {/* Staff Assignment Section */}
          <div className="border rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Staff Assignment</h3>

            <div className="space-y-4">
              {/* Current Staff */}
              {department && assignedStaff.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Current Staff in Department</h4>
                  <div className="space-y-2">
                    {assignedStaff.map(staffMember => (
                      <div key={staffMember.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                        <div>
                          <div className="font-medium">{staffMember.full_name}</div>
                          <div className="text-sm text-gray-600">{staffMember.email}</div>
                          <div className="text-xs text-gray-500">{staffMember.role}</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                            Assigned
                          </span>
                          {formData.staff_ids?.includes(staffMember.id) ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleStaffSelection(staffMember.id)}
                              className="text-red-600 border-red-200 hover:bg-red-50"
                            >
                              Remove
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleStaffSelection(staffMember.id)}
                            >
                              Keep
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Staff for Assignment */}
              {availableStaff.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">
                    Available Staff for Assignment
                    <span className="text-sm text-gray-500 ml-2">
                      ({availableStaff.length} available)
                    </span>
                  </h4>
                  <div className="max-h-60 overflow-y-auto border rounded">
                    {availableStaff.map(staffMember => (
                      <div
                        key={staffMember.id}
                        className={`flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer ${formData.staff_ids?.includes(staffMember.id) ? 'bg-blue-50 border-blue-200' : ''}`}
                        onClick={() => handleStaffSelection(staffMember.id)}
                      >
                        <div>
                          <div className="font-medium">{staffMember.full_name}</div>
                          <div className="text-sm text-gray-600">{staffMember.email}</div>
                          <div className="text-xs text-gray-500">
                            {staffMember.department_name ? `Currently in: ${staffMember.department_name}` : 'Unassigned'}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {formData.staff_ids?.includes(staffMember.id) ? (
                            <>
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                Selected
                              </span>
                              <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            </>
                          ) : (
                            <div className="w-5 h-5 rounded-full border border-gray-300" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Staff Available */}
              {availableStaff.length === 0 && (
                <div className="text-center py-8 border rounded bg-gray-50">
                  <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5 3.75l-5.5 5.5m0 0l-5.5-5.5m5.5 5.5V3" />
                  </svg>
                  <h4 className="mt-4 text-lg font-medium text-gray-900">No Staff Available</h4>
                  <p className="mt-1 text-gray-600">
                    {staff?.length === 0
                      ? 'You need to create staff members first before assigning them to departments.'
                      : 'All staff members are already assigned to departments.'}
                  </p>
                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => window.open('/dashboard/management/staff/create', '_blank')}
                    >
                      Create New Staff
                    </Button>
                  </div>
                </div>
              )}

              {/* Selected Staff Count */}
              {formData.staff_ids && formData.staff_ids.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-blue-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium text-blue-800">
                      {formData.staff_ids.length} staff member{formData.staff_ids.length !== 1 ? 's' : ''} selected
                    </span>
                  </div>
                  <p className="text-sm text-blue-600 mt-1">
                    These staff members will be assigned to this department when saved.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <Textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              placeholder="Department description and purpose..."
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={loading || deptLoading}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              loading={loading || deptLoading}
              disabled={loading || deptLoading}
            >
              {isEditMode ? 'Update Department' : 'Create Department'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
