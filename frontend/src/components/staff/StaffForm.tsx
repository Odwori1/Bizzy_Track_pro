import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Staff, StaffFormData, StaffRole } from '@/types/staff';
import { staffApi } from '@/lib/api/staff';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { getAssignableRoles } from '@/lib/rolePermissions';

interface Department {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

interface StaffFormProps {
  staff?: Staff; // For editing mode
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const StaffForm: React.FC<StaffFormProps> = ({
  staff,
  onSuccess,
  onCancel
}) => {
  const router = useRouter();
  const { user } = useAuthStore();
  const isEditMode = !!staff;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<{id: string, name: string, description: string}[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);

  // Fetch available roles and departments on component mount
  useEffect(() => {
    const fetchData = async () => {
      // Fetch roles
      setLoadingRoles(true);
      try {
        const roles = await staffApi.getStaffRoles();
        console.log('Fetched roles:', roles);
        setAvailableRoles(roles);

        // Set default role_id if creating new staff
        if (!isEditMode && roles.length > 0) {
          const defaultRole = roles.find(r => r.name.toLowerCase() === 'staff');
          if (defaultRole) {
            setFormData(prev => ({
              ...prev,
              role: 'staff' as StaffRole,
              role_id: defaultRole.id
            }));
          }
        }
      } catch (error) {
        console.error('Failed to fetch roles:', error);
        setError('Failed to load roles. Please refresh the page.');
      } finally {
        setLoadingRoles(false);
      }

      // Fetch departments
      setLoadingDepartments(true);
      try {
        const deptData = await apiClient.get<Department[]>('/departments');
        console.log('Fetched departments:', deptData);
        setDepartments(deptData);
      } catch (error) {
        console.error('Failed to fetch departments:', error);
        setError('Failed to load departments. You can still create staff without department assignment.');
      } finally {
        setLoadingDepartments(false);
      }
    };

    fetchData();
  }, [isEditMode]);

  // Available roles for current user to assign
  const assignableRoles = user ? getAssignableRoles(user.role as any) : [];

  const [formData, setFormData] = useState<StaffFormData>({
    email: staff?.email || '',
    full_name: staff?.full_name || '',
    role: (staff?.role as StaffRole) || 'staff',
    role_id: '', // Initialize empty role_id
    phone: staff?.phone || '',
    department_id: staff?.department_id || '',
    hourly_rate: staff?.hourly_rate || undefined,
    notes: staff?.notes || '',
    generate_password: !isEditMode, // Generate password by default for new staff
    custom_password: '',
    send_invitation: !isEditMode, // Send invitation by default for new staff
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    if (type === 'checkbox') {
      const checkbox = e.target as HTMLInputElement;
      setFormData(prev => ({ ...prev, [name]: checkbox.checked }));
    } else if (type === 'number') {
      setFormData(prev => ({ ...prev, [name]: value === '' ? undefined : parseFloat(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Handle role change - update both role name and role_id
  const handleRoleChange = (roleName: string) => {
    const selectedRole = availableRoles.find(r => r.name.toLowerCase() === roleName.toLowerCase());

    setFormData(prev => ({
      ...prev,
      role: roleName as StaffRole,
      role_id: selectedRole?.id || ''
    }));
  };

  // Handle department change
  const handleDepartmentChange = (departmentId: string) => {
    setFormData(prev => ({
      ...prev,
      department_id: departmentId
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate custom password if provided
    if (!formData.generate_password && formData.custom_password) {
      if (formData.custom_password.length < 8) {
        setError('Password must be at least 8 characters long');
        setLoading(false);
        return;
      }
    }

    try {
      if (isEditMode && staff) {
        // Update existing staff
        const updateData = {
          full_name: formData.full_name,
          phone: formData.phone,
          role: formData.role,
          department_id: formData.department_id || null,
          hourly_rate: formData.hourly_rate,
          notes: formData.notes
        };
        await staffApi.updateStaff(staff.id, updateData);
      } else {
        // =========== CRITICAL FIX: Validate role_id exists ===========
        if (!formData.role_id) {
          // Try to find role_id from available roles
          const selectedRole = availableRoles.find(r => r.name.toLowerCase() === formData.role.toLowerCase());
          if (!selectedRole) {
            throw new Error(`Role "${formData.role}" not found. Please select a valid role.`);
          }
          formData.role_id = selectedRole.id;
        }

        // Create new staff - clean up form data
        const submitData: any = {
          email: formData.email,
          full_name: formData.full_name,
          role: formData.role,
          role_id: formData.role_id,  // CRITICAL: Send role_id to backend
          phone: formData.phone || undefined,
          department_id: formData.department_id || undefined,
          hourly_rate: formData.hourly_rate,
          notes: formData.notes || undefined,
          generate_password: formData.generate_password,
          send_invitation: formData.send_invitation
        };

        // =========== FIX: Send password field instead of custom_password ===========
        // Only include password if generate_password is false and custom_password is provided
        if (!formData.generate_password && formData.custom_password) {
          submitData.password = formData.custom_password; // Send as 'password' field to backend
        }

        console.log('Submitting staff data:', {
          ...submitData,
          password: submitData.password ? '*** HIDDEN ***' : undefined
        });
        await staffApi.createStaff(submitData);
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/dashboard/management/staff');
      }
    } catch (err: any) {
      console.error('Staff form error:', err);
      setError(err.message || 'Failed to save staff member');
    } finally {
      setLoading(false);
    }
  };

  // Generate random password
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({
      ...prev,
      custom_password: password,
      generate_password: false // Switch to custom password mode
    }));
  };

  // Toggle password visibility
  const togglePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };

  // Password strength indicator
  const getPasswordStrength = (password: string) => {
    if (!password) return { score: 0, text: 'No password' };

    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    const strengthTexts = [
      'Very Weak',
      'Weak',
      'Fair',
      'Good',
      'Strong',
      'Very Strong'
    ];

    return {
      score,
      text: strengthTexts[score] || 'Very Weak'
    };
  };

  // Filter active departments for the dropdown
  const activeDepartments = departments.filter(dept => dept.is_active);
  
  // Find selected department name for display
  const selectedDepartment = departments.find(dept => dept.id === formData.department_id);

  const passwordStrength = getPasswordStrength(formData.custom_password);

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-6">
        {isEditMode ? 'Edit Staff Member' : 'Add New Staff Member'}
      </h2>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Full Name *
            </label>
            <input
              type="text"
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address *
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required={!isEditMode}
              disabled={isEditMode}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+1234567890"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Role *
            </label>
            <select
              name="role"
              value={formData.role}
              onChange={(e) => handleRoleChange(e.target.value)}
              required
              disabled={loadingRoles}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
            >
              {loadingRoles ? (
                <option>Loading roles...</option>
              ) : (
                <>
                  <option value="">Select a role</option>
                  {availableRoles
                    .filter(role => assignableRoles.includes(role.name.toLowerCase() as StaffRole))
                    .map(role => (
                      <option key={role.id} value={role.name.toLowerCase()}>
                        {role.name.charAt(0).toUpperCase() + role.name.slice(1)} - {role.description}
                      </option>
                    ))}
                </>
              )}
            </select>
            {loadingRoles && (
              <p className="mt-1 text-xs text-gray-500">Loading roles...</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Available roles based on your permissions
            </p>
            {/* Hidden field for role_id */}
            <input
              type="hidden"
              name="role_id"
              value={formData.role_id}
            />
            {/* Debug info (remove in production) */}
            {process.env.NODE_ENV === 'development' && formData.role_id && (
              <p className="mt-1 text-xs text-blue-500">
                Role ID: {formData.role_id.substring(0, 8)}...
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hourly Rate
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500">$</span>
              </div>
              <input
                type="number"
                name="hourly_rate"
                value={formData.hourly_rate || ''}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="25.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Department
            </label>
            {loadingDepartments ? (
              <select
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
              >
                <option>Loading departments...</option>
              </select>
            ) : activeDepartments.length === 0 ? (
              <div className="space-y-2">
                <select
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
                >
                  <option>No departments available</option>
                </select>
                <p className="text-xs text-gray-500">
                  Create departments in the coordination section first
                </p>
                <a
                  href="/dashboard/coordination/departments"
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Go to Departments →
                </a>
              </div>
            ) : (
              <div className="space-y-1">
                <select
                  name="department_id"
                  value={formData.department_id || ''}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No Department (Not assigned)</option>
                  {activeDepartments.map(dept => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} ({dept.code}) {!dept.is_active && '- Inactive'}
                    </option>
                  ))}
                </select>
                {selectedDepartment && (
                  <p className="text-xs text-gray-500 mt-1">
                    Selected: {selectedDepartment.name}
                    {!selectedDepartment.is_active && ' (Inactive)'}
                  </p>
                )}
                <div className="flex justify-between items-center mt-1">
                  <a
                    href="/dashboard/coordination/departments"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Manage Departments →
                  </a>
                  <span className="text-xs text-gray-500">
                    {activeDepartments.length} active department(s)
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Password Settings (only for new staff) */}
        {!isEditMode && (
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-800 mb-4">Password Settings</h3>

            <div className="space-y-4">
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="generate_password"
                  name="generate_password"
                  checked={formData.generate_password}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                />
                <label htmlFor="generate_password" className="ml-2 block text-sm text-gray-700">
                  <div className="font-medium">Generate random password automatically</div>
                  <p className="text-gray-500 mt-1">
                    System will create a secure random password and email it to the staff member
                  </p>
                </label>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-start mb-4">
                  <div className="flex items-center h-5">
                    <input
                      type="checkbox"
                      id="use_custom_password"
                      checked={!formData.generate_password}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        generate_password: !e.target.checked
                      }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </div>
                  <label htmlFor="use_custom_password" className="ml-2 block text-sm text-gray-700">
                    <div className="font-medium">Set custom password</div>
                    <p className="text-gray-500 mt-1">
                      Create a password for the staff member (they can change it later)
                    </p>
                  </label>
                </div>

                {!formData.generate_password && (
                  <div className="ml-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Custom Password
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={passwordVisible ? "text" : "password"}
                            name="custom_password"
                            value={formData.custom_password}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter custom password"
                          />
                          <button
                            type="button"
                            onClick={togglePasswordVisibility}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                          >
                            {passwordVisible ? (
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            ) : (
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={generateRandomPassword}
                        >
                          Generate Random
                        </Button>
                      </div>

                      {/* Password strength indicator */}
                      {formData.custom_password && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-600">Password strength:</span>
                            <span className={`text-xs font-medium ${
                              passwordStrength.score >= 4 ? 'text-green-600' :
                              passwordStrength.score >= 3 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {passwordStrength.text}
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                passwordStrength.score >= 4 ? 'bg-green-500' :
                                passwordStrength.score >= 3 ? 'bg-yellow-500' :
                                passwordStrength.score >= 2 ? 'bg-blue-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      <p className="mt-1 text-xs text-gray-500">
                        Minimum 8 characters with letters, numbers, and special characters
                      </p>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex">
                        <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="ml-3">
                          <p className="text-sm text-blue-700">
                            The staff member will receive an email with their account details.
                            They'll be able to change their password upon first login.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="send_invitation"
                  name="send_invitation"
                  checked={formData.send_invitation}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                />
                <label htmlFor="send_invitation" className="ml-2 block text-sm text-gray-700">
                  <div className="font-medium">Send invitation email to staff member</div>
                  <p className="text-gray-500 mt-1">
                    Staff will receive an email with instructions to activate their account
                  </p>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes
          </label>
          <textarea
            name="notes"
            value={formData.notes || ''}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Additional information about this staff member..."
          />
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-3 pt-6 border-t">
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
            type="submit"
            loading={loading}
            disabled={loading || (!isEditMode && !formData.role_id)}
          >
            {isEditMode ? 'Update Staff' : 'Create Staff'}
          </Button>
        </div>
      </form>
    </div>
  );
};
