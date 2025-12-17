import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Department, DepartmentFormData } from '@/types/department';
import { useDepartment } from '@/hooks/useDepartment';
import { useStaff } from '@/hooks/useStaff';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/Textarea';

interface DepartmentFormProps {
  department?: Department;
  onSuccess?: () => void;
  onCancel?: () => void;
  parentDepartmentId?: string | null;
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
  onCancel,
  parentDepartmentId = null
}) => {
  const router = useRouter();
  const { createDepartment, updateDepartment, departments, loading: deptLoading, error: deptError, clearError } = useDepartment();
  const { staff, fetchStaff } = useStaff();
  const isEditMode = !!department;

  const [formData, setFormData] = useState<DepartmentFormData>({
    name: department?.name || '',
    code: department?.code || '',
    description: department?.description || '',
    parent_department_id: department?.parent_department_id || parentDepartmentId || null,
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
  const [colorInputMode, setColorInputMode] = useState<'hex' | 'name'>('hex');
  const [colorValidation, setColorValidation] = useState<{isValid: boolean; message: string | null}>({
    isValid: true,
    message: null
  });

  // Function to validate if a string is a valid CSS color
  const isValidColor = (color: string): boolean => {
    if (!color) return false;
    
    // Test if it's a valid hex color
    const hexRegex = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;
    if (hexRegex.test(color)) return true;
    
    // Test if it's a valid CSS color name by creating a temporary element
    const tempElement = document.createElement('div');
    tempElement.style.color = color;
    tempElement.style.display = 'none';
    document.body.appendChild(tempElement);
    const computedColor = tempElement.style.color;
    document.body.removeChild(tempElement);
    
    // If the browser didn't recognize it, it will be empty or unchanged
    return computedColor !== '' && computedColor !== 'inherit';
  };

  // Convert color name to hex
  const convertColorToHex = (color: string): string => {
    if (!color || color.trim() === '') return '#3B82F6';
    
    // If already hex, return as is
    if (color.startsWith('#')) return color;
    
    // Try to convert color name to hex
    const tempElement = document.createElement('div');
    tempElement.style.color = color;
    tempElement.style.display = 'none';
    document.body.appendChild(tempElement);
    const computedColor = tempElement.style.color;
    document.body.removeChild(tempElement);
    
    // If conversion worked, return as hex
    if (computedColor && computedColor !== '') {
      // Convert rgb() to hex
      if (computedColor.startsWith('rgb')) {
        const rgb = computedColor.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const r = parseInt(rgb[0]).toString(16).padStart(2, '0');
          const g = parseInt(rgb[1]).toString(16).padStart(2, '0');
          const b = parseInt(rgb[2]).toString(16).padStart(2, '0');
          return `#${r}${g}${b}`.toUpperCase();
        }
      }
      // If already hex format
      if (computedColor.startsWith('#')) return computedColor;
    }
    
    // Fallback to default
    return '#3B82F6';
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    
    // Update form data immediately for color picker
    if (e.target.type === 'color') {
      setFormData(prev => ({ ...prev, color_hex: value }));
      setColorValidation({ isValid: true, message: null });
      setColorInputMode('hex');
      return;
    }
    
    // For text input, validate and convert if needed
    const isValid = isValidColor(value);
    
    if (isValid) {
      const hexValue = convertColorToHex(value);
      setFormData(prev => ({ ...prev, color_hex: hexValue }));
      setColorValidation({ 
        isValid: true, 
        message: value.startsWith('#') ? 'Valid hex color' : `Using: ${hexValue}`
      });
      setColorInputMode(value.startsWith('#') ? 'hex' : 'name');
    } else {
      setColorValidation({ 
        isValid: false, 
        message: 'Enter a valid color name (e.g., "red", "blue") or hex code (#RRGGBB)'
      });
      // Still update form data but mark as invalid
      setFormData(prev => ({ ...prev, color_hex: value }));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    if (name === 'color_hex') {
      handleColorChange(e as React.ChangeEvent<HTMLInputElement>);
      return;
    }

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
        return {
          ...prev,
          staff_ids: currentStaffIds.filter(id => id !== staffId)
        };
      } else {
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
    if (!colorValidation.isValid) {
      setFormError('Please enter a valid color');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();
    setLoading(true);

    // Ensure color is in hex format before submitting
    const finalColorHex = convertColorToHex(formData.color_hex);
    const formDataToSubmit = {
      ...formData,
      color_hex: finalColorHex
    };

    if (!validateForm()) {
      setLoading(false);
      return;
    }

    try {
      if (isEditMode && department) {
        await updateDepartment(department.id, formDataToSubmit);
      } else {
        await createDepartment(formDataToSubmit);
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

  // Load parent departments for dropdown
  useEffect(() => {
    const availableParents = departments
      .filter(dept => !department || dept.id !== department.id)
      .map(dept => ({ id: dept.id, name: dept.name }));
    setParentDepartments(availableParents);

    if (parentDepartmentId && !department?.parent_department_id) {
      const parentDept = departments.find(dept => dept.id === parentDepartmentId);
      if (parentDept) {
        console.log(`Creating child department under: ${parentDept.name}`);
      }
    }
  }, [departments, department, parentDepartmentId]);

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

  // Filter available staff
  useEffect(() => {
    if (staff && staff.length > 0) {
      const filtered = staff.filter(staffMember =>
        !staffMember.department_id ||
        staffMember.department_id === department?.id
      );
      setAvailableStaff(filtered);
    }
  }, [staff, department?.id]);

  const assignedStaff = staff?.filter(s => s.department_id === department?.id) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEditMode ? 'Edit Department' : 'Create New Department'}
          {parentDepartmentId && !department && (
            <div className="text-sm font-normal text-gray-600 mt-1">
              Creating child department
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {(formError || deptError) && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {formError || deptError}
            </div>
          )}

          {parentDepartmentId && !department && formData.parent_department_id && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-blue-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                </svg>
                <span className="font-medium text-blue-800">Creating Child Department</span>
              </div>
              <p className="text-sm text-blue-600 mt-1">
                This department will be created as a child of the selected parent department.
              </p>
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
              <p className="mt-1 text-xs text-gray-500">
                Select "No Parent" for top-level department, or choose a parent to create hierarchy
              </p>
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

            {/* Color Input Section - Enhanced for name/hex support */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Color
              </label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Input
                    type="color"
                    name="color_picker"
                    value={formData.color_hex}
                    onChange={handleColorChange}
                    className="w-12 h-10 p-1 cursor-pointer"
                    title="Click to pick a color"
                  />
                  <div className="flex-1">
                    <Input
                      name="color_hex"
                      value={formData.color_hex}
                      onChange={handleChange}
                      placeholder="e.g., #3B82F6 or 'blue' or 'teal'"
                      className="w-full"
                    />
                  </div>
                </div>
                
                {/* Color preview and validation feedback */}
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <div 
                      className="w-8 h-8 rounded border border-gray-300"
                      style={{ backgroundColor: formData.color_hex }}
                      title="Color preview"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      {colorInputMode === 'name' ? 'Name' : 'Hex'}
                    </span>
                  </div>
                  
                  {/* Validation message */}
                  {colorValidation.message && (
                    <div className={`text-sm ${colorValidation.isValid ? 'text-green-600' : 'text-red-600'}`}>
                      {colorValidation.message}
                    </div>
                  )}
                </div>
                
                {/* Color examples */}
                <div className="mt-1">
                  <p className="text-xs text-gray-500 mb-1">
                    Try: <span className="font-medium">"red"</span>, <span className="font-medium">"blue"</span>, 
                    <span className="font-medium"> "green"</span>, <span className="font-medium">"purple"</span>, 
                    or any CSS color name
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {['red', 'blue', 'green', 'purple', 'orange', 'teal', 'gray'].map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, color_hex: color }));
                          setColorValidation({ 
                            isValid: true, 
                            message: `Using: ${convertColorToHex(color)}` 
                          });
                          setColorInputMode('name');
                        }}
                        className="px-2 py-1 text-xs rounded border hover:opacity-90 transition-opacity"
                        style={{ 
                          backgroundColor: color,
                          color: ['yellow', 'white', 'lightyellow', 'lightcyan'].includes(color) ? 'black' : 'white'
                        }}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>
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
