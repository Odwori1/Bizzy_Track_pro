'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuthStore } from '@/store/authStore';
import { useStaffStore } from '@/store/staffStore';

export default function BusinessSettingsPage() {
  const [activeTab, setActiveTab] = useState<'staff' | 'roles' | 'permissions' | 'departments'>('staff');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    allowStaffCreation: true,
    requireApproval: false,
    defaultStaffRole: 'staff',
    maxStaffAccounts: 50,
    staffPasswordExpiry: 90,
    allowDepartmentCreation: true,
    defaultDepartmentType: 'service',
  });

  const { user } = useAuthStore();
  const { staffRoles, actions } = useStaffStore();

  // Load roles on mount
  useEffect(() => {
    actions.fetchStaffRoles();
  }, [actions]);

  // Check if user is business owner/admin
  const isBusinessOwner = user?.role === 'admin' || user?.role === 'owner';

  if (!isBusinessOwner) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 font-medium">Access Denied</div>
          <div className="text-red-700 text-sm mt-1">
            You don't have permission to access business settings. Only business owners and administrators can view this page.
          </div>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Saving settings:', settings);
      // In real implementation: await api.updateBusinessSettings(settings);
      alert('Settings saved successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Settings</h1>
          <p className="text-gray-600 mt-1">
            Configure business-wide settings for staff, permissions, and departments
          </p>
        </div>
        
        <Button
          variant="primary"
          onClick={handleSave}
          loading={loading}
        >
          Save Settings
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setError(null)}
            className="mt-2"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Card>
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('staff')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'staff' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.707-1.707A10 10 0 0021.75 10a10 10 0 00-19.5 0A10 10 0 0012 22.75a10 10 0 006.364-2.043" />
                </svg>
                Staff Settings
              </div>
            </button>
            
            <button
              onClick={() => setActiveTab('roles')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'roles' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Role Templates
              </div>
            </button>
            
            <button
              onClick={() => setActiveTab('permissions')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'permissions' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Permissions
              </div>
            </button>
            
            <button
              onClick={() => setActiveTab('departments')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'departments' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Department Settings
              </div>
            </button>
          </nav>
        </div>
      </Card>

      {/* Content */}
      <div className="space-y-6">
        {/* Staff Settings */}
        {activeTab === 'staff' && (
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Staff Account Settings</h2>
              
              <div className="space-y-6">
                {/* Staff Creation */}
                <div>
                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="allowStaffCreation"
                      checked={settings.allowStaffCreation}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        allowStaffCreation: e.target.checked
                      }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                    />
                    <label htmlFor="allowStaffCreation" className="ml-3 block text-sm text-gray-700">
                      <div className="font-medium">Allow staff account creation</div>
                      <p className="text-gray-500 mt-1">
                        Enable administrators to create new staff accounts
                      </p>
                    </label>
                  </div>
                </div>

                {/* Approval Required */}
                <div>
                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="requireApproval"
                      checked={settings.requireApproval}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        requireApproval: e.target.checked
                      }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                    />
                    <label htmlFor="requireApproval" className="ml-3 block text-sm text-gray-700">
                      <div className="font-medium">Require approval for new staff</div>
                      <p className="text-gray-500 mt-1">
                        All new staff accounts must be approved by business owner
                      </p>
                    </label>
                  </div>
                </div>

                {/* Default Role */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Default Staff Role
                  </label>
                  <select
                    value={settings.defaultStaffRole}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      defaultStaffRole: e.target.value
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {staffRoles.map(role => (
                      <option key={role.id} value={role.name.toLowerCase()}>
                        {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    Default role assigned to new staff members
                  </p>
                </div>

                {/* Max Staff Accounts */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Maximum Staff Accounts
                  </label>
                  <input
                    type="number"
                    value={settings.maxStaffAccounts}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      maxStaffAccounts: parseInt(e.target.value) || 0
                    }))}
                    min="1"
                    max="1000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Maximum number of staff accounts allowed for this business
                  </p>
                </div>

                {/* Password Expiry */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password Expiry (Days)
                  </label>
                  <input
                    type="number"
                    value={settings.staffPasswordExpiry}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      staffPasswordExpiry: parseInt(e.target.value) || 0
                    }))}
                    min="1"
                    max="365"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Number of days before staff passwords expire (0 = never expire)
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Role Templates */}
        {activeTab === 'roles' && (
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Role Templates</h2>
              
              <div className="space-y-6">
                <p className="text-gray-600">
                  Manage default permission templates for different staff roles. These templates are used when creating new roles.
                </p>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Default Permissions
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {staffRoles.map(role => (
                        <tr key={role.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium text-gray-900">
                              {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">
                              {role.description}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-600">
                              View, Edit assigned items
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <Button variant="ghost" size="sm">
                              Edit Template
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-6 border-t">
                  <Button variant="outline">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add New Role Template
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Department Settings */}
        {activeTab === 'departments' && (
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Department Settings</h2>
              
              <div className="space-y-6">
                {/* Department Creation */}
                <div>
                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="allowDepartmentCreation"
                      checked={settings.allowDepartmentCreation}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        allowDepartmentCreation: e.target.checked
                      }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                    />
                    <label htmlFor="allowDepartmentCreation" className="ml-3 block text-sm text-gray-700">
                      <div className="font-medium">Allow department creation</div>
                      <p className="text-gray-500 mt-1">
                        Enable administrators to create new departments
                      </p>
                    </label>
                  </div>
                </div>

                {/* Default Department Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Default Department Type
                  </label>
                  <select
                    value={settings.defaultDepartmentType}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      defaultDepartmentType: e.target.value
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="sales">Sales</option>
                    <option value="service">Service</option>
                    <option value="admin">Administration</option>
                    <option value="production">Production</option>
                    <option value="support">Support</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    Default type for new departments
                  </p>
                </div>

                {/* Department Hierarchy Settings */}
                <div className="pt-6 border-t">
                  <h3 className="text-md font-medium text-gray-900 mb-4">Hierarchy Settings</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="enableHierarchy"
                        defaultChecked
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                      />
                      <label htmlFor="enableHierarchy" className="ml-3 block text-sm text-gray-700">
                        <div className="font-medium">Enable department hierarchy</div>
                        <p className="text-gray-500 mt-1">
                          Allow departments to have parent-child relationships
                        </p>
                      </label>
                    </div>

                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="limitDepartmentLevels"
                        defaultChecked
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                      />
                      <label htmlFor="limitDepartmentLevels" className="ml-3 block text-sm text-gray-700">
                        <div className="font-medium">Limit department levels</div>
                        <p className="text-gray-500 mt-1">
                          Restrict department hierarchy to 3 levels maximum
                        </p>
                      </label>
                    </div>

                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="autoAssignStaff"
                        defaultChecked
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                      />
                      <label htmlFor="autoAssignStaff" className="ml-3 block text-sm text-gray-700">
                        <div className="font-medium">Auto-assign staff to departments</div>
                        <p className="text-gray-500 mt-1">
                          Automatically assign new staff to default department
                        </p>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Cost Center Settings */}
                <div className="pt-6 border-t">
                  <h3 className="text-md font-medium text-gray-900 mb-4">Cost Center Settings</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="requireCostCenter"
                        defaultChecked
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                      />
                      <label htmlFor="requireCostCenter" className="ml-3 block text-sm text-gray-700">
                        <div className="font-medium">Require cost center codes</div>
                        <p className="text-gray-500 mt-1">
                          All departments must have a cost center code
                        </p>
                      </label>
                    </div>

                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="uniqueCostCenters"
                        defaultChecked
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                      />
                      <label htmlFor="uniqueCostCenters" className="ml-3 block text-sm text-gray-700">
                        <div className="font-medium">Require unique cost centers</div>
                        <p className="text-gray-500 mt-1">
                          Cost center codes must be unique across departments
                        </p>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
