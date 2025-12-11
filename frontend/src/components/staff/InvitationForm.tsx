import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StaffInvitationData, StaffRole } from '@/types/staff';
import { staffApi } from '@/lib/api/staff';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { getAssignableRoles } from '@/lib/rolePermissions';

interface InvitationFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const InvitationForm: React.FC<InvitationFormProps> = ({ 
  onSuccess, 
  onCancel 
}) => {
  const router = useRouter();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<StaffInvitationData>({
    email: '',
    full_name: '',
    role: 'staff',
    department_id: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await staffApi.inviteStaff(formData);
      
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/dashboard/management/staff/invitations');
      }
    } catch (err: any) {
      console.error('Invitation error:', err);
      setError(err.message || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  // Available roles for current user to assign
  const assignableRoles = user ? getAssignableRoles(user.role as any) : [];

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-6">
        Invite Staff Member
      </h2>

      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              An invitation email will be sent with a link to create their account.
              They'll be able to set their own password upon registration.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
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
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Role *
            </label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {assignableRoles.map(role => (
                <option key={role} value={role}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Available roles based on your permissions
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Department ID
            </label>
            <input
              type="text"
              name="department_id"
              value={formData.department_id}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Department ID (optional)"
            />
          </div>
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
          >
            Send Invitation
          </Button>
        </div>
      </form>
    </div>
  );
};
