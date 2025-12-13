'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/Badge';
import {
  Search, Plus, Trash2, Clock, MapPin, Calendar,
  User, Shield, CheckCircle, XCircle, RefreshCw, Check, Filter, X
} from 'lucide-react';
import { permissionApi } from '@/lib/api/permissions';
import { UserPermissionsResponse, Permission } from '@/types/permissions';
import { formatDate } from '@/lib/date-format';

interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  role_id: string;
  is_active: boolean;
}

interface UserPermissionManagerProps {
  onUpdate: () => void;
}

export default function UserPermissionManager({ onUpdate }: UserPermissionManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [userPermissions, setUserPermissions] = useState<UserPermissionsResponse | null>(null);
  const [availablePermissions, setAvailablePermissions] = useState<Permission[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [staffLoading, setStaffLoading] = useState(true);
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [permissionSearch, setPermissionSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(new Set());
  const [grantData, setGrantData] = useState({
    value: true,
    expires_at: '',
    conditions: {
      valid_times: { start: '', end: '' },
      valid_days: [] as number[],
      valid_locations: [] as string[]
    }
  });

  // Fetch staff users
  useEffect(() => {
    fetchStaffUsers();
  }, []);

  // Load available permissions
  useEffect(() => {
    loadAvailablePermissions();
  }, []);

  const fetchStaffUsers = async () => {
    try {
      setStaffLoading(true);
      console.log('🔍 [STAFF] Fetching real staff users...');
      
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8002/api/staff', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ [STAFF] Received', data.count, 'staff users');
        
        if (data.success && data.data && Array.isArray(data.data)) {
          // Filter to show only active users
          const activeUsers = data.data
            .filter((user: any) => user.is_active !== false)
            .map((user: any) => ({
              id: user.id,
              email: user.email,
              full_name: user.full_name || user.email,
              role: user.role || 'staff',
              role_id: user.role_id,
              is_active: user.is_active
            }));
          
          console.log('✅ [STAFF] Setting', activeUsers.length, 'active users');
          setStaffUsers(activeUsers);
          
          // Auto-select first user if none selected
          if (activeUsers.length > 0 && !selectedUserId) {
            console.log('🎯 [STAFF] Auto-selecting first user:', activeUsers[0].email);
            setSelectedUserId(activeUsers[0].id);
            loadUserPermissions(activeUsers[0].id);
          }
        }
      } else {
        console.error('❌ [STAFF] API error:', response.status);
      }
    } catch (error) {
      console.error('❌ [STAFF] Failed to fetch staff users:', error);
    } finally {
      setStaffLoading(false);
    }
  };

  const loadAvailablePermissions = async () => {
    try {
      console.log('🔍 [PERMS] Loading available permissions...');
      const permissions = await permissionApi.getAllPermissions();
      console.log('✅ [PERMS] Loaded', permissions.length, 'permissions');
      setAvailablePermissions(permissions);
    } catch (error) {
      console.error('❌ [PERMS] Failed to load permissions:', error);
    }
  };

  const loadUserPermissions = async (userId: string) => {
    try {
      setLoading(true);
      console.log('🔍 [USER] Loading permissions for user:', userId);
      const permissions = await permissionApi.getUserPermissions(userId);
      console.log('✅ [USER] User permissions loaded:', {
        rbac: permissions.rbac_permissions?.length || 0,
        abac: permissions.abac_overrides?.length || 0
      });
      setUserPermissions(permissions);
    } catch (error) {
      console.error('❌ [USER] Failed to load user permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = (userId: string) => {
    console.log('🎯 [USER] User selected:', userId);
    setSelectedUserId(userId);
    loadUserPermissions(userId);
  };

  const handleGrantPermissions = async () => {
    if (!selectedUserId || selectedPermissionIds.size === 0) {
      alert('Please select a user and at least one permission');
      return;
    }

    try {
      console.log('➕ [ABAC] Granting', selectedPermissionIds.size, 'permissions');
      
      // Grant each selected permission
      const permissionArray = Array.from(selectedPermissionIds);
      const promises = permissionArray.map(permissionId => 
        permissionApi.addUserPermissionOverride(selectedUserId, {
          permission_id: permissionId,
          value: grantData.value,
          expires_at: grantData.expires_at || undefined,
          conditions: grantData.conditions
        })
      );
      
      await Promise.all(promises);

      // Refresh data
      await loadUserPermissions(selectedUserId);
      onUpdate();

      // Reset form
      setShowGrantForm(false);
      setSelectedPermissionIds(new Set());
      setGrantData({
        value: true,
        expires_at: '',
        conditions: {
          valid_times: { start: '', end: '' },
          valid_days: [],
          valid_locations: []
        }
      });
      setPermissionSearch('');
      setSelectedCategory('all');

      alert(`${selectedPermissionIds.size} permission(s) granted successfully!`);
    } catch (error: any) {
      console.error('❌ [ABAC] Failed to grant permissions:', error);
      alert(`Failed to grant permissions: ${error.message || 'Please try again.'}`);
    }
  };

  const handleRevokePermission = async (permissionId: string) => {
    if (!selectedUserId) return;

    if (confirm('Are you sure you want to revoke this permission?')) {
      try {
        console.log('🗑️ [ABAC] Revoking permission:', permissionId);
        await permissionApi.removeUserPermissionOverride(selectedUserId, permissionId);
        await loadUserPermissions(selectedUserId);
        onUpdate();
        alert('Permission revoked successfully!');
      } catch (error: any) {
        console.error('❌ [ABAC] Failed to revoke permission:', error);
        alert(`Failed to revoke permission: ${error.message || 'Please try again.'}`);
      }
    }
  };

  // Get unique categories from permissions
  const permissionCategories = Array.from(
    new Set(availablePermissions.map(p => p.category))
  ).sort();

  // Filter permissions based on search and category
  const filteredPermissions = availablePermissions.filter(perm => {
    const matchesSearch = permissionSearch === '' ||
      perm.name.toLowerCase().includes(permissionSearch.toLowerCase()) ||
      perm.description.toLowerCase().includes(permissionSearch.toLowerCase()) ||
      perm.category.toLowerCase().includes(permissionSearch.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || perm.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Handle permission selection
  const handlePermissionSelect = (permissionId: string) => {
    const newSelected = new Set(selectedPermissionIds);
    if (newSelected.has(permissionId)) {
      newSelected.delete(permissionId);
    } else {
      newSelected.add(permissionId);
    }
    setSelectedPermissionIds(newSelected);
  };

  const handleSelectAll = () => {
    const allIds = new Set(filteredPermissions.map(p => p.id));
    setSelectedPermissionIds(allIds);
  };

  const handleDeselectAll = () => {
    setSelectedPermissionIds(new Set());
  };

  const handleSelectCategory = (category: string) => {
    const categoryPerms = filteredPermissions.filter(p => p.category === category);
    const categoryIds = new Set(categoryPerms.map(p => p.id));
    
    // Merge with existing selections
    const newSelected = new Set(selectedPermissionIds);
    categoryIds.forEach(id => newSelected.add(id));
    setSelectedPermissionIds(newSelected);
  };

  const handleDeselectCategory = (category: string) => {
    const categoryPerms = filteredPermissions.filter(p => p.category === category);
    const categoryIds = new Set(categoryPerms.map(p => p.id));
    
    // Remove category permissions from selection
    const newSelected = new Set(selectedPermissionIds);
    categoryIds.forEach(id => newSelected.delete(id));
    setSelectedPermissionIds(newSelected);
  };

  const filteredUsers = staffUsers.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedUser = staffUsers.find(u => u.id === selectedUserId);

  return (
    <div className="space-y-6">
      {/* User Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Staff Users
              <Badge variant="outline">
                {staffUsers.length} users
              </Badge>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={fetchStaffUsers}
              disabled={staffLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${staffLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            Select a user to manage their permission overrides (ABAC)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by email, name, or role..."
                value={searchTerm}
                onChange={(e) => {
                  console.log('🔍 [SEARCH] User search:', e.target.value);
                  setSearchTerm(e.target.value);
                }}
                className="pl-10"
              />
              {searchTerm && (
                <button
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setSearchTerm('')}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {staffLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-3 text-muted-foreground">Loading staff users...</p>
              </div>
            ) : (
              <>
                {/* User Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {filteredUsers.map((user) => {
                    const isSelected = selectedUserId === user.id;
                    
                    return (
                      <div
                        key={user.id}
                        className={`
                          bg-white rounded-lg border-2 p-4 
                          transition-all duration-200
                          ${isSelected 
                            ? 'border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-300 ring-offset-1' 
                            : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                          }
                          cursor-pointer select-none
                        `}
                        onClick={() => handleUserSelect(user.id)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUserSelect(user.id)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Select ${user.full_name}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold text-gray-900">{user.full_name}</h4>
                            <p className="text-sm text-gray-600 mt-1">{user.email}</p>
                          </div>
                          <Badge className="capitalize" variant={
                            user.role === 'owner' ? 'default' :
                            user.role === 'manager' ? 'secondary' :
                            user.role === 'supervisor' ? 'outline' : 'secondary'
                          }>
                            {user.role}
                          </Badge>
                        </div>
                        
                        <div className="mt-3 text-xs text-gray-500">
                          {user.is_active ? (
                            <span className="text-green-600">● Active</span>
                          ) : (
                            <span className="text-gray-400">● Inactive</span>
                          )}
                        </div>
                        
                        {isSelected && (
                          <div className="mt-2 text-xs text-blue-600 font-medium flex items-center">
                            <div className="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
                            Selected for ABAC overrides
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {filteredUsers.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    {searchTerm 
                      ? `No users found for "${searchTerm}"`
                      : 'No staff users found'}
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* User Permissions - Only show when user is selected */}
      {selectedUserId && selectedUser && (
        <>
          {/* RBAC Permissions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Role-Based Permissions (RBAC) for {selectedUser.full_name}
                <Badge variant="secondary">
                  {userPermissions?.rbac_permissions?.length || 0} permissions
                </Badge>
              </CardTitle>
              <CardDescription>
                These permissions are inherited from the {selectedUser.role} role
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-3 text-muted-foreground">Loading permissions...</p>
                </div>
              ) : !userPermissions?.rbac_permissions || userPermissions.rbac_permissions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No role permissions found for this user
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {userPermissions?.rbac_permissions.slice(0, 10).map((perm) => (
                    <div key={perm.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{perm.name}</div>
                        <div className="text-sm text-muted-foreground">{perm.description}</div>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {perm.category}
                      </Badge>
                    </div>
                  ))}
                  {userPermissions?.rbac_permissions.length > 10 && (
                    <div className="col-span-2 text-center text-sm text-gray-500 pt-2">
                      Showing 10 of {userPermissions.rbac_permissions.length} permissions
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ABAC Overrides */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Custom Permission Overrides (ABAC)
                    <Badge variant="secondary">
                      {userPermissions?.abac_overrides?.length || 0} overrides
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Grant temporary or conditional permissions beyond their role
                  </CardDescription>
                </div>
                <Button onClick={() => setShowGrantForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Grant Permissions
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!userPermissions?.abac_overrides || userPermissions.abac_overrides.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No custom permission overrides for this user
                </div>
              ) : (
                <div className="space-y-4">
                  {userPermissions?.abac_overrides.map((override) => (
                    <Card key={override.id}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{override.name}</h4>
                              {override.is_allowed ? (
                                <Badge variant="default" className="gap-1 bg-green-100 text-green-800">
                                  <CheckCircle className="h-3 w-3" />
                                  Allowed
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="gap-1">
                                  <XCircle className="h-3 w-3" />
                                  Denied
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {override.description}
                            </p>

                            {/* Conditions */}
                            {override.conditions && (
                              <div className="mt-3 space-y-2">
                                {override.conditions.valid_times && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Clock className="h-3 w-3" />
                                    <span>
                                      {override.conditions.valid_times.start} - {override.conditions.valid_times.end}
                                    </span>
                                  </div>
                                )}

                                {override.conditions.valid_locations && override.conditions.valid_locations.length > 0 && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <MapPin className="h-3 w-3" />
                                    <span>
                                      Locations: {override.conditions.valid_locations.join(', ')}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Expiry */}
                            {override.expires_at && (
                              <div className="flex items-center gap-2 text-sm mt-2">
                                <Calendar className="h-3 w-3" />
                                <span>Expires: {formatDate(override.expires_at)}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-2">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleRevokePermission(override.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            {override.granted_by_email && (
                              <div className="text-xs text-muted-foreground">
                                Granted by: {override.granted_by_email}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Grant Permission Form - MULTIPLE SELECTION VERSION */}
          {showGrantForm && (
            <Card className="relative z-50">
              <CardHeader>
                <CardTitle>Grant Custom Permissions</CardTitle>
                <CardDescription>
                  Add custom permission overrides for {selectedUser.full_name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Selection Summary */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium text-blue-800">
                          {selectedPermissionIds.size} permission(s) selected
                        </div>
                        <div className="text-sm text-blue-600 mt-1">
                          These permissions will be granted as ABAC overrides
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSelectAll}
                          disabled={filteredPermissions.length === 0}
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Select All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDeselectAll}
                          disabled={selectedPermissionIds.size === 0}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Clear All
                        </Button>
                      </div>
                    </div>
                    
                    {/* Selected permissions preview */}
                    {selectedPermissionIds.size > 0 && (
                      <div className="mt-3">
                        <div className="text-sm font-medium text-blue-700 mb-2">Selected Permissions:</div>
                        <div className="flex flex-wrap gap-2">
                          {Array.from(selectedPermissionIds).slice(0, 5).map(permId => {
                            const perm = availablePermissions.find(p => p.id === permId);
                            return perm ? (
                              <Badge key={perm.id} variant="outline" className="bg-white">
                                {perm.name}
                              </Badge>
                            ) : null;
                          })}
                          {selectedPermissionIds.size > 5 && (
                            <Badge variant="secondary">
                              +{selectedPermissionIds.size - 5} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Permission Selection Area */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <Label className="text-lg">Select Permissions</Label>
                      <Badge variant="outline">
                        {filteredPermissions.length} available
                      </Badge>
                    </div>
                    
                    {/* Search and Filter */}
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search permissions by name, description, or category..."
                          value={permissionSearch}
                          onChange={(e) => setPermissionSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      
                      {/* Category Filters */}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={selectedCategory === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedCategory('all')}
                        >
                          All Categories
                        </Button>
                        {permissionCategories.map(category => (
                          <Button
                            key={category}
                            variant={selectedCategory === category ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedCategory(category)}
                          >
                            {category}
                            <Badge variant="secondary" className="ml-2">
                              {availablePermissions.filter(p => p.category === category).length}
                            </Badge>
                          </Button>
                        ))}
                      </div>
                      
                      {/* Category Quick Actions */}
                      {selectedCategory !== 'all' && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSelectCategory(selectedCategory)}
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Select All in {selectedCategory}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeselectCategory(selectedCategory)}
                          >
                            <X className="h-4 w-4 mr-2" />
                            Deselect All in {selectedCategory}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Permissions List */}
                    <div className="border rounded-lg p-4 max-h-80 overflow-y-auto">
                      {filteredPermissions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          No permissions found for "{permissionSearch}"
                          {selectedCategory !== 'all' && ` in category "${selectedCategory}"`}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredPermissions.map((perm) => {
                            const isSelected = selectedPermissionIds.has(perm.id);
                            return (
                              <div
                                key={perm.id}
                                className={`p-3 rounded cursor-pointer transition-all ${
                                  isSelected
                                    ? 'bg-blue-50 border border-blue-200'
                                    : 'hover:bg-gray-50 border border-transparent'
                                }`}
                                onClick={() => handlePermissionSelect(perm.id)}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex items-start gap-3 flex-1">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center mt-0.5 ${
                                      isSelected
                                        ? 'bg-blue-500 border-blue-500'
                                        : 'border-gray-300'
                                    }`}>
                                      {isSelected && (
                                        <Check className="h-3 w-3 text-white" />
                                      )}
                                    </div>
                                    <div className="flex-1">
                                      <div className="font-medium">{perm.name}</div>
                                      <div className="text-sm text-gray-600">{perm.description}</div>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    <Badge variant="outline" className="text-xs capitalize">
                                      {perm.category}
                                    </Badge>
                                    {isSelected && (
                                      <div className="text-xs text-blue-600 font-medium">
                                        Selected
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Grant Settings */}
                  <div className="space-y-4 border-t pt-4">
                    <div>
                      <Label className="text-lg">Grant Settings</Label>
                      <div className="text-sm text-gray-500">
                        Apply these settings to all selected permissions
                      </div>
                    </div>

                    {/* Permission Type */}
                    <div className="space-y-2">
                      <Label>Permission Type *</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            grantData.value 
                              ? 'border-green-500 bg-green-50' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => {
                            console.log('📝 Permission type: allow');
                            setGrantData({...grantData, value: true});
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">Allow Permissions</div>
                              <div className="text-sm text-gray-600">Grant these permissions to the user</div>
                            </div>
                            {grantData.value && (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            )}
                          </div>
                        </div>
                        
                        <div
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            !grantData.value 
                              ? 'border-red-500 bg-red-50' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => {
                            console.log('📝 Permission type: deny');
                            setGrantData({...grantData, value: false});
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">Deny Permissions</div>
                              <div className="text-sm text-gray-600">Override role to block these permissions</div>
                            </div>
                            {!grantData.value && (
                              <XCircle className="h-5 w-5 text-red-500" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expiry Date */}
                    <div>
                      <Label htmlFor="expires_at">Expiry Date (Optional)</Label>
                      <Input
                        type="datetime-local"
                        id="expires_at"
                        value={grantData.expires_at}
                        onChange={(e) => setGrantData({...grantData, expires_at: e.target.value})}
                        className="w-full"
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        Leave empty for permanent permissions
                      </div>
                    </div>

                    {/* Time Conditions */}
                    <div className="space-y-2">
                      <Label>Time Restrictions (Optional)</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-sm mb-1">Start Time (HH:MM)</div>
                          <Input
                            type="time"
                            value={grantData.conditions.valid_times.start}
                            onChange={(e) => setGrantData({
                              ...grantData,
                              conditions: {
                                ...grantData.conditions,
                                valid_times: { ...grantData.conditions.valid_times, start: e.target.value }
                              }
                            })}
                            placeholder="09:00"
                          />
                        </div>
                        <div>
                          <div className="text-sm mb-1">End Time (HH:MM)</div>
                          <Input
                            type="time"
                            value={grantData.conditions.valid_times.end}
                            onChange={(e) => setGrantData({
                              ...grantData,
                              conditions: {
                                ...grantData.conditions,
                                valid_times: { ...grantData.conditions.valid_times, end: e.target.value }
                              }
                            })}
                            placeholder="17:00"
                          />
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        Set time range when permissions are valid (24-hour format)
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowGrantForm(false);
                        setSelectedPermissionIds(new Set());
                        setGrantData({
                          value: true,
                          expires_at: '',
                          conditions: {
                            valid_times: { start: '', end: '' },
                            valid_days: [],
                            valid_locations: []
                          }
                        });
                        setPermissionSearch('');
                        setSelectedCategory('all');
                      }}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleGrantPermissions}
                      disabled={selectedPermissionIds.size === 0}
                      className="flex-1"
                    >
                      Grant {selectedPermissionIds.size} Permission(s)
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
