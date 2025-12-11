'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, Users, FolderTree, History, Settings, 
  Plus, Eye
} from 'lucide-react';
import { usePermissionStore } from '@/store/permissionStore';
import RolePermissionEditor from '@/components/permissions/RolePermissionEditor';
import UserPermissionManager from '@/components/permissions/UserPermissionManager';
import PermissionAuditLog from '@/components/permissions/PermissionAuditLog';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('roles');
  const [selectedRole, setSelectedRole] = useState<string>('');
  
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
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      await Promise.all([
        fetchCategories(),
        fetchRoles(),
        fetchPermissions(),
        fetchAuditLogs()
      ]);
      
      // Select first role by default
      if (roles.length > 0 && !selectedRole) {
        setSelectedRole(roles[0].id);
      }
    } catch (error) {
      console.error('Failed to load permission data:', error);
    }
  };

  const handleRoleSelect = (roleId: string) => {
    setSelectedRole(roleId);
  };

  const handlePermissionUpdate = () => {
    // Refresh data after permission update
    loadInitialData();
  };

  if (loading && categories.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading permission settings...</p>
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
            Retry
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
            <TabsTrigger value="roles" className="flex items-center gap-2">
              <FolderTree className="h-4 w-4" />
              Roles (RBAC)
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              User Overrides (ABAC)
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex items-center gap-2">
              <FolderTree className="h-4 w-4" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Audit Log
            </TabsTrigger>
            <TabsTrigger value="rules" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Business Rules
            </TabsTrigger>
          </TabsList>

          {/* Roles Tab (RBAC) */}
          <TabsContent value="roles" className="space-y-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-semibold">Role Permissions</h3>
                <p className="text-sm text-muted-foreground">
                  Configure base permissions for each role in your business
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  New Role
                </Button>
              </div>
            </div>

            {/* Role Selection */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {roles.map((role) => (
                <Card
                  key={role.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedRole === role.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => handleRoleSelect(role.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold capitalize">{role.name}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{role.description}</p>
                      </div>
                      <Badge variant="secondary" className="ml-2">
                        {role.permission_count} perms
                      </Badge>
                    </div>
                    <div className="mt-4 text-xs text-muted-foreground">
                      {role.is_system_role ? 'System Role' : 'Custom Role'}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Role Permission Editor */}
            {selectedRole && (
              <RolePermissionEditor
                roleId={selectedRole}
                onUpdate={handlePermissionUpdate}
              />
            )}
          </TabsContent>

          {/* Users Tab (ABAC) */}
          <TabsContent value="users">
            <div className="mb-6">
              <h3 className="text-lg font-semibold">User Permission Overrides</h3>
              <p className="text-sm text-muted-foreground">
                Grant temporary or conditional permissions to individual users (ABAC)
              </p>
            </div>
            <UserPermissionManager onUpdate={handlePermissionUpdate} />
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories">
            <div className="mb-6">
              <h3 className="text-lg font-semibold">Permission Categories</h3>
              <p className="text-sm text-muted-foreground">
                Browse all {permissions.length} permissions organized by category
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((category) => (
                <Card key={category.category}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base capitalize">
                      {category.category.replace('_', ' ')}
                    </CardTitle>
                    <CardDescription>
                      {category.sample_description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <Badge variant="outline">
                        {category.permission_count} permissions
                      </Badge>
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Audit Tab */}
          <TabsContent value="audit">
            <div className="mb-6">
              <h3 className="text-lg font-semibold">Permission Audit Log</h3>
              <p className="text-sm text-muted-foreground">
                Track all permission changes and access attempts
              </p>
            </div>
            <PermissionAuditLog logs={auditLogs} />
          </TabsContent>

          {/* Business Rules Tab */}
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
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Time-Based Rules</h4>
                      <p className="text-sm text-muted-foreground">
                        Grant permissions only during specific hours
                      </p>
                    </div>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Time Rule
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Location-Based Rules</h4>
                      <p className="text-sm text-muted-foreground">
                        Restrict permissions to specific locations
                      </p>
                    </div>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Location Rule
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Day-Based Rules</h4>
                      <p className="text-sm text-muted-foreground">
                        Allow permissions only on specific days
                      </p>
                    </div>
                    <Button size="sm">
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
