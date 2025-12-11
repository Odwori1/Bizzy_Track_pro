'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, Plus, Trash2, Clock, MapPin, Calendar,
  User, Shield, CheckCircle, XCircle
} from 'lucide-react';
import { permissionApi } from '@/lib/api/permissions';
import { UserPermissionsResponse, Permission } from '@/types/permissions';
import { formatDate } from '@/lib/date-format';

interface UserPermissionManagerProps {
  onUpdate: () => void;
}

export default function UserPermissionManager({ onUpdate }: UserPermissionManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [userPermissions, setUserPermissions] = useState<UserPermissionsResponse | null>(null);
  const [availablePermissions, setAvailablePermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [grantData, setGrantData] = useState({
    permission_id: '',
    value: true,
    expires_at: '',
    conditions: {
      valid_times: { start: '', end: '' },
      valid_days: [] as number[],
      valid_locations: [] as string[]
    }
  });

  // TODO: Fetch users list from API
  const mockUsers = [
    { id: '56209963-04a0-41ba-af2f-61a025e9ffca', email: 'staff1@test.com', name: 'Staff One', role: 'manager' },
    { id: 'f0708782-ca33-4116-8fb4-c6e259ebf96b', email: 'staff2@test.com', name: 'Staff Two', role: 'supervisor' },
    { id: 'f1048d29-5aa4-49d1-92f5-d8f77aed0b3f', email: 'directstaff@test.com', name: 'Direct Staff', role: 'staff' },
  ];

  // Load available permissions
  useEffect(() => {
    loadAvailablePermissions();
  }, []);

  const loadAvailablePermissions = async () => {
    try {
      const permissions = await permissionApi.getAllPermissions();
      setAvailablePermissions(permissions);
    } catch (error) {
      console.error('Failed to load permissions:', error);
    }
  };

  const loadUserPermissions = async (userId: string) => {
    try {
      setLoading(true);
      const permissions = await permissionApi.getUserPermissions(userId);
      setUserPermissions(permissions);
    } catch (error) {
      console.error('Failed to load user permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    loadUserPermissions(userId);
  };

  const handleGrantPermission = async () => {
    if (!selectedUserId || !grantData.permission_id) return;

    try {
      await permissionApi.addUserPermissionOverride(selectedUserId, grantData);
      
      // Refresh data
      await loadUserPermissions(selectedUserId);
      onUpdate();
      
      // Reset form
      setShowGrantForm(false);
      setGrantData({
        permission_id: '',
        value: true,
        expires_at: '',
        conditions: {
          valid_times: { start: '', end: '' },
          valid_days: [],
          valid_locations: []
        }
      });
      
      alert('Permission granted successfully!');
    } catch (error) {
      console.error('Failed to grant permission:', error);
      alert('Failed to grant permission. Please try again.');
    }
  };

  const handleRevokePermission = async (permissionId: string) => {
    if (!selectedUserId) return;

    if (confirm('Are you sure you want to revoke this permission?')) {
      try {
        await permissionApi.removeUserPermissionOverride(selectedUserId, permissionId);
        await loadUserPermissions(selectedUserId);
        onUpdate();
        alert('Permission revoked successfully!');
      } catch (error) {
        console.error('Failed to revoke permission:', error);
        alert('Failed to revoke permission. Please try again.');
      }
    }
  };

  const filteredUsers = mockUsers.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* User Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select User</CardTitle>
          <CardDescription>
            Choose a user to manage their permission overrides
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by email or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {filteredUsers.map((user) => (
                <Card 
                  key={user.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedUserId === user.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => handleUserSelect(user.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold">{user.name}</h4>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        <Badge variant="outline" className="mt-1 capitalize">
                          {user.role}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Permissions */}
      {selectedUserId && (
        <>
          {/* RBAC Permissions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Role-Based Permissions (RBAC)
                <Badge variant="secondary">
                  {userPermissions?.rbac_permissions.length || 0} permissions
                </Badge>
              </CardTitle>
              <CardDescription>
                These permissions are inherited from the user's role and cannot be modified here
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-3 text-muted-foreground">Loading permissions...</p>
                </div>
              ) : userPermissions?.rbac_permissions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No role permissions found
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {userPermissions?.rbac_permissions.map((perm) => (
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
                      {userPermissions?.abac_overrides.length || 0} overrides
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    These are custom permissions granted specifically to this user
                  </CardDescription>
                </div>
                <Button onClick={() => setShowGrantForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Grant Permission
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {userPermissions?.abac_overrides.length === 0 ? (
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
                                <Badge variant="success" className="gap-1">
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

          {/* Grant Permission Form */}
          {showGrantForm && (
            <Card>
              <CardHeader>
                <CardTitle>Grant Custom Permission</CardTitle>
                <CardDescription>
                  Add a custom permission override for this user
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Permission Selection */}
                  <div>
                    <Label htmlFor="permission">Permission</Label>
                    <Select
                      value={grantData.permission_id}
                      onValueChange={(value) => setGrantData({...grantData, permission_id: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a permission" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePermissions.map((perm) => (
                          <SelectItem key={perm.id} value={perm.id}>
                            {perm.name} - {perm.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Allow/Deny */}
                  <div>
                    <Label htmlFor="value">Permission Type</Label>
                    <Select
                      value={grantData.value ? 'allow' : 'deny'}
                      onValueChange={(value) => setGrantData({...grantData, value: value === 'allow'})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="allow">Allow Permission</SelectItem>
                        <SelectItem value="deny">Deny Permission (Override Role)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Expiry Date */}
                  <div>
                    <Label htmlFor="expires_at">Expiry Date (Optional)</Label>
                    <Input
                      type="datetime-local"
                      value={grantData.expires_at}
                      onChange={(e) => setGrantData({...grantData, expires_at: e.target.value})}
                    />
                  </div>

                  {/* Time Conditions */}
                  <div className="space-y-2">
                    <Label>Time Restrictions (Optional)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Start time (HH:MM)"
                        value={grantData.conditions.valid_times.start}
                        onChange={(e) => setGrantData({
                          ...grantData,
                          conditions: {
                            ...grantData.conditions,
                            valid_times: { ...grantData.conditions.valid_times, start: e.target.value }
                          }
                        })}
                      />
                      <Input
                        placeholder="End time (HH:MM)"
                        value={grantData.conditions.valid_times.end}
                        onChange={(e) => setGrantData({
                          ...grantData,
                          conditions: {
                            ...grantData.conditions,
                            valid_times: { ...grantData.conditions.valid_times, end: e.target.value }
                          }
                        })}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setShowGrantForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleGrantPermission}
                      disabled={!grantData.permission_id}
                    >
                      Grant Permission
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
