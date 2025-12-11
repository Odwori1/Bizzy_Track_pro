export interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
  action: string;
  resource_type: string;
  created_at: string;
  has_permission?: boolean;
  role_name?: string;
}

export interface PermissionCategory {
  category: string;
  permission_count: number;
  sample_description: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  is_system_role: boolean;
  created_at: string;
  permission_count: number;
}

export interface RolePermission {
  id: string;
  name: string;
  description: string;
  category: string;
  has_permission: boolean;
  role_name: string;
}

export interface UserPermission {
  id: string;
  name: string;
  description: string;
  category: string;
  source: 'role' | 'abac';
  expires_at?: string;
  conditions?: any;
  is_allowed?: boolean;
  granted_at?: string;
  granted_by_email?: string;
}

export interface UserPermissionsResponse {
  user: {
    id: string;
    email: string;
    role: string;
    role_name: string;
  };
  rbac_permissions: UserPermission[];
  abac_overrides: UserPermission[];
  summary: {
    rbac_count: number;
    abac_count: number;
  };
}

export interface PermissionOverrideData {
  permission_id: string;
  value: boolean;
  conditions?: {
    valid_times?: {
      start: string;
      end: string;
    };
    valid_days?: number[];
    valid_locations?: string[];
  };
  expires_at?: string;
}

export interface PermissionAuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  user_id: string;
  user_email: string;
  old_values: any;
  new_values: any;
  created_at: string;
}
