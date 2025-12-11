import React, { useState, useEffect } from 'react';
import { Staff, StaffRole, StaffInvitationStatus } from '@/types/staff';
import { staffApi } from '@/lib/api/staff';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

interface StaffListProps {
  showFilters?: boolean;
  showActions?: boolean;
  onSelectStaff?: (staff: Staff) => void;
}

export const StaffList: React.FC<StaffListProps> = ({
  showFilters = true,
  showActions = true,
  onSelectStaff
}) => {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters - initialize with empty strings, not undefined
  const [filters, setFilters] = useState({
    role: '' as StaffRole | '',
    department_id: '',
    is_active: true,
    search: ''
  });

  useEffect(() => {
    fetchStaff();
  }, [filters]);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      
      // Build filters object, removing empty values
      const apiFilters: any = {};
      
      if (filters.role && filters.role !== '') {
        apiFilters.role = filters.role;
      }
      
      if (filters.department_id && filters.department_id !== '') {
        apiFilters.department_id = filters.department_id;
      }
      
      if (filters.search && filters.search !== '') {
        apiFilters.search = filters.search;
      }
      
      apiFilters.is_active = filters.is_active;
      
      console.log('Fetching staff with filters:', apiFilters);
      
      const staffData = await staffApi.getStaff(apiFilters);
      setStaff(staffData);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching staff:', err);
      setError(err.message || 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: keyof typeof filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleDeleteStaff = async (id: string) => {
    if (!confirm('Are you sure you want to delete this staff member?')) return;
    
    try {
      await staffApi.deleteStaff(id);
      setStaff(prev => prev.filter(s => s.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete staff');
    }
  };

  const getStatusBadge = (status: boolean) => (
    <span className={`px-2 py-1 text-xs rounded-full ${status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {status ? 'Active' : 'Inactive'}
    </span>
  );

  const getRoleBadge = (role: StaffRole) => {
    const colors: Record<StaffRole, string> = {
      owner: 'bg-purple-100 text-purple-800',
      manager: 'bg-blue-100 text-blue-800',
      supervisor: 'bg-green-100 text-green-800',
      staff: 'bg-gray-100 text-gray-800'
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${colors[role]}`}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading staff...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchStaff} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      {showFilters && (
        <div className="bg-white p-4 rounded-lg border space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                type="text"
                placeholder="Search by name or email"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filters.role}
                onChange={(e) => handleFilterChange('role', e.target.value)}
              >
                <option value="">All Roles</option>
                <option value="owner">Owner</option>
                <option value="manager">Manager</option>
                <option value="supervisor">Supervisor</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filters.is_active.toString()}
                onChange={(e) => handleFilterChange('is_active', e.target.value === 'true')}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
                <option value="">All</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => setFilters({ role: '', department_id: '', is_active: true, search: '' })}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Staff List */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-800">
            Staff Members ({staff.length})
          </h3>
          {showActions && (
            <Link href="/dashboard/management/staff/create">
              <Button>
                Add New Staff
              </Button>
            </Link>
          )}
        </div>

        {staff.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No staff members found. {showActions && (
              <Link href="/dashboard/management/staff/create" className="text-blue-600 hover:underline">
                Add your first staff member
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Staff Member
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {staff.map((staffMember) => (
                  <tr key={staffMember.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-medium">
                            {staffMember.full_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {staffMember.full_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {staffMember.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getRoleBadge(staffMember.role as StaffRole)}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(staffMember.is_active)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {staffMember.last_login_at 
                        ? new Date(staffMember.last_login_at).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium space-x-2">
                      {onSelectStaff ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onSelectStaff(staffMember)}
                        >
                          Select
                        </Button>
                      ) : (
                        <>
                          <Link href={`/dashboard/management/staff/${staffMember.id}`}>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                          <Link href={`/dashboard/management/staff/${staffMember.id}/edit`}>
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </Link>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDeleteStaff(staffMember.id)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
