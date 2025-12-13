'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, Filter, Save, RefreshCw, Eye, EyeOff,
  CheckCircle, XCircle, Shield
} from 'lucide-react';
import { permissionApi } from '@/lib/api/permissions';
import { RolePermission, PermissionCategory } from '@/types/permissions';

interface RolePermissionEditorProps {
  roleId: string;
  onUpdate: () => void;
}

export default function RolePermissionEditor({ roleId, onUpdate }: RolePermissionEditorProps) {
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [categories, setCategories] = useState<PermissionCategory[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [roleName, setRoleName] = useState('');

  // Load role permissions and categories
  useEffect(() => {
    loadRolePermissions();
  }, [roleId]);

  const loadRolePermissions = async () => {
    try {
      setLoading(true);
      const [rolePerms, categoriesData] = await Promise.all([
        permissionApi.getRolePermissions(roleId),
        permissionApi.getCategories()
      ]);

      setPermissions(rolePerms);
      setCategories(categoriesData);

      // Set selected permissions
      const selected = new Set<string>();
      rolePerms.forEach(perm => {
        if (perm.has_permission) {
          selected.add(perm.id);
        }
      });
      setSelectedPermissions(selected);

      // Get role name from first permission
      if (rolePerms.length > 0) {
        setRoleName(rolePerms[0].role_name);
      }
    } catch (error) {
      console.error('Failed to load role permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter permissions by category and search
  const filteredPermissions = permissions.filter(perm => {
    const matchesCategory = activeCategory === 'all' || perm.category === activeCategory;
    const matchesSearch = searchTerm === '' ||
      perm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      perm.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Group permissions by category
  const permissionsByCategory = filteredPermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, RolePermission[]>);

  const handlePermissionToggle = (permissionId: string) => {
    const newSelected = new Set(selectedPermissions);
    if (newSelected.has(permissionId)) {
      newSelected.delete(permissionId);
    } else {
      newSelected.add(permissionId);
    }
    setSelectedPermissions(newSelected);
  };

  const handleSelectAll = (category?: string) => {
    const newSelected = new Set(selectedPermissions);
    const permsToSelect = category
      ? permissions.filter(p => p.category === category)
      : permissions;

    permsToSelect.forEach(perm => {
      newSelected.add(perm.id);
    });
    setSelectedPermissions(newSelected);
  };

  const handleDeselectAll = (category?: string) => {
    const newSelected = new Set(selectedPermissions);
    const permsToDeselect = category
      ? permissions.filter(p => p.category === category)
      : permissions;

    permsToDeselect.forEach(perm => {
      newSelected.delete(perm.id);
    });
    setSelectedPermissions(newSelected);
  };

  const handleSavePermissions = async () => {
    try {
      setSaving(true);
      const permissionIds = Array.from(selectedPermissions);

      // Calculate operation (replace all permissions)
      await permissionApi.updateRolePermissions(
        roleId,
        permissionIds,
        'replace'
      );

      // Refresh data
      await loadRolePermissions();
      onUpdate();

      // Show success message
      alert(`Permissions updated successfully for ${roleName} role`);
    } catch (error) {
      console.error('Failed to update permissions:', error);
      alert('Failed to update permissions. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3">Loading permissions...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedCount = selectedPermissions.size;
  const totalCount = permissions.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="capitalize">{roleName} Role Permissions</CardTitle>
            <CardDescription>
              Configure which permissions are granted to the {roleName} role
            </CardDescription>
          </div>
          <Badge variant={selectedCount === totalCount ? "default" : "secondary"}>
            {selectedCount} / {totalCount} selected
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search and Filter - FIXED */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search permissions by name or description..."
              value={searchTerm}
              onChange={(e) => {
                console.log('🔍 Search term changed:', e.target.value);
                setSearchTerm(e.target.value);
              }}
              className="pl-10"
            />
            {searchTerm && (
              <button
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => {
                  console.log('🗑️ Clearing search');
                  setSearchTerm('');
                }}
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                console.log('✅ Selecting all filtered permissions');
                handleSelectAll();
              }}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                console.log('❌ Deselecting all filtered permissions');
                handleDeselectAll();
              }}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Deselect All
            </Button>
          </div>
        </div>

        {/* Category Tabs */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="mb-6">
          <TabsList className="flex flex-wrap h-auto p-1">
            <TabsTrigger value="all" className="flex-1">
              All Categories
              <Badge variant="secondary" className="ml-2">
                {totalCount}
              </Badge>
            </TabsTrigger>
            {categories.map((category) => (
              <TabsTrigger key={category.category} value={category.category} className="flex-1">
                {category.category.replace('_', ' ')}
                <Badge variant="secondary" className="ml-2">
                  {category.permission_count}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Permissions List */}
        <div className="space-y-6">
          {activeCategory === 'all' ? (
            Object.entries(permissionsByCategory).map(([category, perms]) => (
              <div key={category}>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold capitalize">
                    {category.replace('_', ' ')}
                    <Badge variant="outline" className="ml-2">
                      {perms.length}
                    </Badge>
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSelectAll(category)}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeselectAll(category)}
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {perms.map((perm) => (
                    <PermissionItem
                      key={perm.id}
                      permission={perm}
                      isSelected={selectedPermissions.has(perm.id)}
                      onToggle={handlePermissionToggle}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredPermissions.map((perm) => (
                <PermissionItem
                  key={perm.id}
                  permission={perm}
                  isSelected={selectedPermissions.has(perm.id)}
                  onToggle={handlePermissionToggle}
                />
              ))}
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="mt-8 pt-6 border-t">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {selectedCount === totalCount ? (
                <span className="flex items-center text-green-600">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  All permissions selected
                </span>
              ) : (
                <span className="flex items-center">
                  <Shield className="h-4 w-4 mr-1" />
                  {selectedCount} permissions will be granted
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={loadRolePermissions}
                disabled={saving}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button
                onClick={handleSavePermissions}
                disabled={saving}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Permissions'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface PermissionItemProps {
  permission: RolePermission;
  isSelected: boolean;
  onToggle: (permissionId: string) => void;
}

function PermissionItem({ permission, isSelected, onToggle }: PermissionItemProps) {
  return (
    <div className={`flex items-start p-3 rounded-lg border ${
      isSelected ? 'bg-primary/5 border-primary' : 'hover:bg-accent'
    }`}>
      <Checkbox
        checked={isSelected}
        onChange={() => onToggle(permission.id)}
        className="mt-1"
      />
      <div className="ml-3 flex-1">
        <div className="flex justify-between items-start">
          <div>
            <Label htmlFor={permission.id} className="font-medium cursor-pointer">
              {permission.name}
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {permission.description}
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {permission.action}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="secondary" className="text-xs">
            {permission.category}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {permission.resource_type}
          </span>
        </div>
      </div>
    </div>
  );
}
