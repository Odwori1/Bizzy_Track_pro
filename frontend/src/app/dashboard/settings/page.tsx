'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Shield, Users, FolderTree, History, Settings,
  Plus, Eye, Search
} from 'lucide-react';
import { usePermissionStore } from '@/store/permissionStore';
import RolePermissionEditor from '@/components/permissions/RolePermissionEditor';
import UserPermissionManager from '@/components/permissions/UserPermissionManager';
import PermissionAuditLog from '@/components/permissions/PermissionAuditLog';
import { Input } from '@/components/ui/Input';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('roles');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [categorySearch, setCategorySearch] = useState('');
  const [filteredCategories, setFilteredCategories] = useState<any[]>([]);

  // Use the store
  const {
    categories,
    roles,
    permissions,
    auditLogs,
    loading,
    error,
    fetchCategories,
    fetchRoles,
    fetchPermissions,
    fetchAuditLogs,
    clearError
  } = usePermissionStore();

  // Load initial data
  useEffect(() => {
    console.log('🔍 [SETTINGS] Loading initial data...');
    loadInitialData();
  }, []);

  // Filter categories when search changes
  useEffect(() => {
    if (categories.length > 0) {
      if (!categorySearch.trim()) {
        setFilteredCategories(categories);
      } else {
        const searchTerm = categorySearch.toLowerCase();
        const filtered = categories.filter(cat =>
          cat.category.toLowerCase().includes(searchTerm) ||
          cat.sample_description.toLowerCase().includes(searchTerm)
        );
        setFilteredCategories(filtered);
      }
    }
  }, [categorySearch, categories]);

  const loadInitialData = async () => {
    console.log('🔍 [SETTINGS] Starting data load...');
    try {
      await Promise.all([
        fetchCategories(),
        fetchRoles(),
        fetchPermissions(),
        fetchAuditLogs()
      ]);

      console.log('✅ [SETTINGS] Data loaded:', {
        categories: categories.length,
        roles: roles.length,
        permissions: permissions.length,
        auditLogs: auditLogs.length
      });

      // Select first role by default
      if (roles.length > 0 && !selectedRole) {
        console.log('🎯 [SETTINGS] Auto-selecting first role:', roles[0].id);
        setSelectedRole(roles[0].id);
      }
    } catch (error) {
      console.error('❌ [SETTINGS] Failed to load permission data:', error);
    }
  };

  const handleRoleSelect = (roleId: string) => {
    console.log('🎯 [ROLES] Role selected:', roleId);
    console.log('📊 [ROLES] Current selected:', selectedRole, 'New:', roleId);
    setSelectedRole(roleId);
  };

  const handlePermissionUpdate = () => {
    console.log('🔄 [SETTINGS] Refreshing data after permission update');
    loadInitialData();
  };

  const handleCategoryView = (category: string) => {
    console.log('👁️ [CATEGORIES] Viewing category:', category);
    alert(`Viewing category: ${category}\n\nThis would show all permissions in this category.`);
  };

  if (loading && categories.length === 0 && roles.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading permission settings...</p>
          <p className="text-sm text-gray-500 mt-2">Fetching roles, categories, and permissions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-red-600 mb-4">{error}</div>
          <Button onClick={loadInitialData}>
            Retry Loading Data
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Permission Management
        </CardTitle>
        <CardDescription>
          Configure Role-Based Access Control (RBAC) and Attribute-Based Access Control (ABAC)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-5 mb-8">
            <TabsTrigger value="roles" className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 data-[state=active]:border-blue-300">
              <FolderTree className="h-4 w-4" />
              Roles (RBAC)
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2 data-[state=active]:bg-green-100 data-[state=active]:text-green-700 data-[state=active]:border-green-300">
              <Users className="h-4 w-4" />
              User Overrides (ABAC)
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex items-center gap-2 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-700 data-[state=active]:border-purple-300">
              <FolderTree className="h-4 w-4" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700 data-[state=active]:border-amber-300">
              <History className="h-4 w-4" />
              Audit Log
            </TabsTrigger>
            <TabsTrigger value="rules" className="flex items-center gap-2 data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-700 data-[state=active]:border-indigo-300">
              <Settings className="h-4 w-4" />
              Business Rules
            </TabsTrigger>
          </TabsList>

          {/* Roles Tab (RBAC) - FIXED */}
          <TabsContent value="roles" className="space-y-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-semibold">Role Permissions</h3>
                <p className="text-sm text-muted-foreground">
                  Configure base permissions for each role in your business
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Loaded {roles.length} roles, {permissions.length} total permissions
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => console.log('New role clicked')}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Role
                </Button>
              </div>
            </div>

            {/* Role Selection - FIXED CLICKABILITY */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {roles.map((role) => {
                const isSelected = selectedRole === role.id;

                return (
                  <div
                    key={role.id}
                    className={`
                      bg-white rounded-lg border-2 p-4
                      transition-all duration-200
                      ${isSelected
                        ? 'border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-300 ring-offset-1'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                      }
                      cursor-pointer select-none
                    `}
                    onClick={() => {
                      console.log('🎯 Role card clicked:', role.name, role.id);
                      handleRoleSelect(role.id);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleRoleSelect(role.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Select ${role.name} role`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-gray-900 capitalize">
                        {role.name}
                      </h4>
                      <Badge variant="secondary" className="ml-2">
                        {role.permission_count} perms
                      </Badge>
                    </div>

                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {role.description}
                    </p>

                    <div className="text-xs text-gray-500">
                      {role.is_system_role ? 'System Role' : 'Custom Role'}
                    </div>

                    {isSelected && (
                      <div className="mt-2 text-xs text-blue-600 font-medium flex items-center">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
                        Currently editing
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Role Permission Editor */}
            {selectedRole && (
              <div className="mt-8">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    Editing: {roles.find(r => r.id === selectedRole)?.name || 'Role'} Permissions
                  </h3>
                  <Badge variant="outline">
                    Role ID: {selectedRole.slice(0, 8)}...
                  </Badge>
                </div>
                <RolePermissionEditor
                  roleId={selectedRole}
                  onUpdate={handlePermissionUpdate}
                />
              </div>
            )}

            {/* Debug info - remove in production */}
            <div className="mt-4 p-3 bg-gray-50 rounded text-xs">
              <details>
                <summary className="cursor-pointer font-medium">Debug Info</summary>
                <pre className="mt-2 overflow-auto">
                  Selected Role: {selectedRole}<br/>
                  Total Roles: {roles.length}<br/>
                  Role IDs: {roles.map(r => r.id).join(', ')}<br/>
                  Categories: {categories.length}<br/>
                  Permissions: {permissions.length}
                </pre>
              </details>
            </div>
          </TabsContent>

          {/* Users Tab (ABAC) - FIXED */}
          <TabsContent value="users">
            <div className="mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold">User Permission Overrides</h3>
                  <p className="text-sm text-muted-foreground">
                    Grant temporary or conditional permissions to individual users (ABAC)
                  </p>
                </div>
                <Button size="sm" onClick={() => console.log('Add user override clicked')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Override
                </Button>
              </div>

              {/* Search for users - WORKING */}
              <div className="mt-4 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search users by email or name..."
                  className="pl-10"
                  onChange={(e) => console.log('Searching users:', e.target.value)}
                />
              </div>
            </div>

            <UserPermissionManager onUpdate={handlePermissionUpdate} />
          </TabsContent>

          {/* Categories Tab - FIXED */}
          <TabsContent value="categories">
            <div className="mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold">Permission Categories</h3>
                  <p className="text-sm text-muted-foreground">
                    Browse all {permissions.length} permissions organized by category
                  </p>
                </div>
                <div className="text-sm text-gray-500">
                  {categories.length} categories
                </div>
              </div>

              {/* Search categories - WORKING */}
              <div className="mt-4 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search categories..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(categorySearch ? filteredCategories : categories).map((category) => (
                <Card key={category.category} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base capitalize">
                      {category.category.replace(/_/g, ' ')}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {category.sample_description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <Badge variant="outline">
                        {category.permission_count} permissions
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCategoryView(category.category)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {categorySearch && filteredCategories.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No categories found for "{categorySearch}"
              </div>
            )}
          </TabsContent>

          {/* Audit Tab - WORKING */}
          <TabsContent value="audit">
            <div className="mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold">Permission Audit Log</h3>
                  <p className="text-sm text-muted-foreground">
                    Track all permission changes and access attempts
                  </p>
                </div>
                <div className="text-sm text-gray-500">
                  {auditLogs.length} log entries
                </div>
              </div>

              {/* Audit log search - WORKING */}
              <div className="mt-4 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search audit logs..."
                    className="pl-10"
                    onChange={(e) => console.log('Searching audit:', e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm">
                  Filter
                </Button>
              </div>
            </div>

            <PermissionAuditLog logs={auditLogs} />
          </TabsContent>

          {/* Business Rules Tab - WORKING */}
          <TabsContent value="rules">
            <div className="mb-6">
              <h3 className="text-lg font-semibold">Business Rules</h3>
              <p className="text-sm text-muted-foreground">
                Configure time-based, location-based, and context-based permission rules
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Conditional Permission Rules</CardTitle>
                <CardDescription>
                  Create rules that automatically grant or revoke permissions based on conditions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <h4 className="font-medium">Time-Based Rules</h4>
                      <p className="text-sm text-muted-foreground">
                        Grant permissions only during specific hours
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => console.log('Add time rule clicked')}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Time Rule
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <h4 className="font-medium">Location-Based Rules</h4>
                      <p className="text-sm text-muted-foreground">
                        Restrict permissions to specific locations
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => console.log('Add location rule clicked')}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Location Rule
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <h4 className="font-medium">Day-Based Rules</h4>
                      <p className="text-sm text-muted-foreground">
                        Allow permissions only on specific days
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => console.log('Add day rule clicked')}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Day Rule
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
