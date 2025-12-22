'use client';

import { useState, useEffect } from 'react';
import { NavigationSection } from './NavigationSection';
import { UserProfile } from './UserProfile';
import { usePermissions } from '@/hooks/usePermissions';
import { checkPermission } from '@/lib/permissionMapping';
import { useAuthStore } from '@/store/authStore'; // ADDED: For owner detection

// Color-coded sections for better visual organization
const navigationSections = [
  {
    id: 'overview',
    title: 'Overview',
    color: 'gray',
    items: [
      {
        name: 'Dashboard',
        href: '/dashboard',
        icon: '📊',
        permission: 'dashboard:view',
      },
    ],
  },
  {
    id: 'pos',
    title: 'Point of Sale',
    color: 'green',
    items: [
      {
        name: 'POS Checkout',
        href: '/dashboard/management/pos/checkout',
        icon: '🛒',
        permission: 'pos:view',
      },
      {
        name: 'Transactions',
        href: '/dashboard/management/pos/transactions',
        icon: '🧾',
        permission: 'transaction:view',
      },
      {
        name: 'Receipts',
        href: '/dashboard/management/pos/receipts',
        icon: '🎫',
        permission: 'receipt:view',
      },
    ],
  },
  {
    id: 'products',
    title: 'Product Management',
    color: 'blue',
    items: [
      {
        name: 'Product Catalog',
        href: '/dashboard/management/products',
        icon: '📦',
        permission: 'product:view',
      },
      {
        name: 'Categories',
        href: '/dashboard/management/products/categories',
        icon: '🏷️',
        permission: 'service_category:read', // CHANGED FROM 'category:view'
      },
      {
        name: 'Suppliers',
        href: '/dashboard/management/suppliers',
        icon: '🏢',
        permission: 'supplier:view',
      },
      {
        name: 'Purchase Orders',
        href: '/dashboard/management/purchase-orders',
        icon: '📋',
        permission: 'purchase_order:view',
      },
    ],
  },
  {
    id: 'staff',
    title: 'Staff Management',
    color: 'purple',
    items: [
      {
        name: 'All Staff',
        href: '/dashboard/management/staff',
        icon: '👥',
        permission: 'staff:read',
      },
      {
        name: 'Add Staff',
        href: '/dashboard/management/staff/create',
        icon: '➕',
        permission: 'staff:create',
      },
      {
        name: 'Invitations',
        href: '/dashboard/management/staff/invitations',
        icon: '✉️',
        permission: 'staff:create',
      },
      // REMOVED: 'Departments' and 'Performance' - moved to coordination section
    ],
  },
  {
    id: 'coordination',
    title: 'Department Coordination',
    color: 'cyan',
    items: [
      {
        name: 'Departments',
        href: '/dashboard/coordination/departments',
        icon: '🏢',
        permission: 'department:read',
      },
      {
        name: 'Workflow',
        href: '/dashboard/coordination/workflow',
        icon: '🔄',
        permission: 'workflow:view',
      },
      {
        name: 'Billing',
        href: '/dashboard/coordination/billing',
        icon: '💰',
        permission: 'billing:view',
      },
      {
        name: 'Performance',
        href: '/dashboard/coordination/performance',
        icon: '📊',
        permission: 'analytics:view',
      },
    ],
  },
  {
    id: 'analytics',
    title: 'Sales Analytics',
    color: 'purple',
    items: [
      {
        name: 'Sales Dashboard',
        href: '/dashboard/analytics/sales',
        icon: '📈',
        permission: 'analytics:view', // Supervisor doesn't have - will hide
      },
      {
        name: 'Sales Reports',
        href: '/dashboard/analytics/sales/reports',
        icon: '📊',
        permission: 'report:view',
      },
      {
        name: 'Performance Metrics',
        href: '/dashboard/analytics/sales/performance',
        icon: '🎯',
        permission: 'analytics:view', // Supervisor doesn't have - will hide
      },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    color: 'orange',
    items: [
      {
        name: 'Barcode Lookup',
        href: '/dashboard/operations/barcode/lookup',
        icon: '📱',
        permission: 'products:read', // TEMPORARY: Use products:read since barcode:view doesn't exist
      },
      {
        name: 'Barcode Scanner',
        href: '/dashboard/operations/barcode/scanner',
        icon: '🔍',
        permission: 'products:read', // TEMPORARY
      },
    ],
  },
  {
    id: 'business',
    title: 'Business Management',
    color: 'indigo',
    items: [
      {
        name: 'Job Management',
        href: '/dashboard/management/jobs',
        icon: '🔧',
        permission: 'job:view',
      },
      {
        name: 'Invoice Management',
        href: '/dashboard/management/invoices',
        icon: '🧾',
        permission: 'invoice:view',
      },
      {
        name: 'Customer Management',
        href: '/dashboard/management/customers',
        icon: '👥',
        permission: 'customer:view',
      },
      {
        name: 'Service Management',
        href: '/dashboard/management/services',
        icon: '🎯',
        permission: 'service:view',
      },
      {
        name: 'Package Management',
        href: '/dashboard/management/packages',
        icon: '📦',
        permission: 'package:view',
      },
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory & Assets',
    color: 'teal',
    items: [
      {
        name: 'Inventory Management',
        href: '/dashboard/management/inventory',
        icon: '📦',
        permission: 'inventory:view',
      },
      {
        name: 'Asset Management',
        href: '/dashboard/management/assets',
        icon: '🏢',
        permission: 'asset:view',
      },
      {
        name: 'Equipment & Hire',
        href: '/dashboard/management/equipment',
        icon: '🔌',
        permission: 'equipment:view',
      },
      {
        name: 'Maintenance',
        href: '/dashboard/management/maintenance',
        icon: '🔧',
        permission: 'maintenance:view',
      },
      {
        name: 'Depreciation',
        href: '/dashboard/management/depreciation',
        icon: '📉',
        permission: 'depreciation:view',
      },
    ],
  },
  {
    id: 'finances',
    title: 'Financial Management',
    color: 'emerald',
    items: [
      {
        name: 'Financial Overview',
        href: '/dashboard/management/finances',
        icon: '💰',
        permission: 'finance:view',
      },
      {
        name: 'Wallet Management',
        href: '/dashboard/management/finances/wallets',
        icon: '💳',
        permission: 'wallet:view',
      },
      {
        name: 'Expense Management',
        href: '/dashboard/management/finances/expenses',
        icon: '📝',
        permission: 'expense:view',
      },
      // Accounting Dropdown - REPLACES the single accounting item
      {
        name: 'Accounting System',
        href: '/dashboard/management/finances/accounting',
        icon: '📒',
        permission: 'finance:view',
        isDropdown: true, // Add this flag
        dropdownItems: [
          {
            name: 'Dashboard',
            href: '/dashboard/management/finances/accounting',
            icon: '📊',
            permission: 'finance:view',
          },
          {
            name: 'Journal Entries',
            href: '/dashboard/management/finances/accounting/journal-entries',
            icon: '📝',
            permission: 'finance:view',
          },
          {
            name: 'Trial Balance',
            href: '/dashboard/management/finances/accounting/trial-balance',
            icon: '⚖️',
            permission: 'finance:view',
          },
          {
            name: 'General Ledger',
            href: '/dashboard/management/finances/accounting/general-ledger',
            icon: '📖',
            permission: 'finance:view',
          },
        ]
      },
      {
        name: 'Financial Reports',
        href: '/dashboard/management/finances/reports',
        icon: '📊',
        permission: 'report:view',
      },
    ],
  },
  {
    id: 'pricing',
    title: 'Pricing Management',
    color: 'amber',
    items: [
      {
        name: 'Pricing Rules',
        href: '/dashboard/management/pricing/rules',
        icon: '💰',
        permission: 'pricing_rule:read', // CHANGED FROM 'pricing:view'
      },
      {
        name: 'Seasonal Pricing',
        href: '/dashboard/management/pricing/seasonal',
        icon: '📅',
        permission: 'seasonal_pricing:read', // CHANGED FROM 'pricing:view'
      },
      {
        name: 'Bulk Operations',
        href: '/dashboard/management/pricing/bulk',
        icon: '⚡',
        permission: 'pricing:manage',
      },
      {
        name: 'Price History',
        href: '/dashboard/management/pricing/history',
        icon: '📊',
        permission: 'price_history:read', // CHANGED FROM 'pricing:view'
      },
      {
        name: 'Evaluation Tool',
        href: '/dashboard/management/pricing/evaluate',
        icon: '🔍',
        permission: 'pricing:view',
      },
    ],
  },
  {
    id: 'security',
    title: 'Security & Compliance',
    color: 'red',
    items: [
      {
        name: 'Business Settings',
        href: '/dashboard/security/business-settings', // CHANGED PATH
        icon: '⚙️',
        permission: 'business:settings:manage',
      },
      {
        name: 'Permission Audits',
        href: '/dashboard/security/audits',
        icon: '🔍',
        permission: 'audit:view',
      },
      {
        name: 'Compliance Frameworks',
        href: '/dashboard/security/compliance',
        icon: '🛡️',
        permission: 'compliance:view',
      },
      {
        name: 'Security Analytics',
        href: '/dashboard/security/analytics',
        icon: '📈',
        permission: 'analytics:view',
      },
      {
        name: 'Security Scans',
        href: '/dashboard/security/scans',
        icon: '🔐',
        permission: 'security:scan',
      },
    ],
  },
  {
    id: 'settings',
    title: 'System Settings',
    color: 'gray',
    items: [
      {
        name: 'Business Settings',
        href: '/dashboard/settings',
        icon: '⚙️',
        permission: 'business:settings:manage',
      },
      {
        name: 'Permission Management',
        href: '/dashboard/settings',
        icon: '🔐',
        permission: 'permission:manage',
      },
      {
        name: 'Role Configuration',
        href: '/dashboard/settings',
        icon: '👥',
        permission: 'role:manage',
      },
      {
        name: 'Audit Logs',
        href: '/dashboard/settings',
        icon: '📋',
        permission: 'audit:view',
      },
    ],
  },
];

// Color mapping for section headers
const colorClasses = {
  gray: 'text-gray-700 border-gray-200 bg-gray-50',
  green: 'text-green-700 border-green-200 bg-green-50',
  blue: 'text-blue-700 border-blue-200 bg-blue-50',
  purple: 'text-purple-700 border-purple-200 bg-purple-50',
  orange: 'text-orange-700 border-orange-200 bg-orange-50',
  indigo: 'text-indigo-700 border-indigo-200 bg-indigo-50',
  teal: 'text-teal-700 border-teal-200 bg-teal-50',
  emerald: 'text-emerald-700 border-emerald-200 bg-emerald-50',
  amber: 'text-amber-700 border-amber-200 bg-amber-50',
  red: 'text-red-700 border-red-200 bg-red-50',
  cyan: 'text-cyan-700 border-cyan-200 bg-cyan-50',
};

// FilteredSection component that checks permissions before rendering
const FilteredSection = ({ section }: { section: any }) => {
  const { getAllPermissionNames } = usePermissions();
  const { user } = useAuthStore(); // GET USER FOR OWNER CHECK
  const [hasVisibleItems, setHasVisibleItems] = useState(false);
  const userPermissionNames = getAllPermissionNames();

  // Check if any item in this section is visible
  useEffect(() => {
    // CRITICAL FIX: OWNER BYPASS - If user is owner, show everything
    if (user && user.role === 'owner') {
      setHasVisibleItems(true);
      return;
    }
    
    // For non-owners, apply permission checks
    const hasItems = section.items.some((item: any) => {
      if (!item.permission) return true;
      return checkPermission(userPermissionNames, item.permission);
    });
    setHasVisibleItems(hasItems);
  }, [section.items, userPermissionNames, user]);

  if (!hasVisibleItems) {
    return null;
  }

  return (
    <div className="mb-6">
      <div className={`
        flex items-center px-3 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg border
        ${colorClasses[section.color as keyof typeof colorClasses]}
        mb-2
      `}>
        <span className="mr-2">
          {section.id === 'overview' ? '📊' :
           section.id === 'pos' ? '🛒' :
           section.id === 'products' ? '📦' :
           section.id === 'staff' ? '👥' :
           section.id === 'coordination' ? '🔄' :
           section.id === 'analytics' ? '📈' :
           section.id === 'operations' ? '⚙️' :
           section.id === 'business' ? '🏢' :
           section.id === 'inventory' ? '📦' :
           section.id === 'finances' ? '💰' :
           section.id === 'pricing' ? '🏷️' :
           section.id === 'security' ? '🔒' :
           section.id === 'settings' ? '⚙️' : '📊'}
        </span>
        {section.title}
      </div>
      <NavigationSection items={section.items} color={section.color} />
    </div>
  );
};

export const Sidebar: React.FC = () => {
  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-purple-600">
        <h1 className="text-xl font-bold text-white">Bizzy Track Pro</h1>
        <p className="text-sm text-blue-100">Business Management System</p>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {navigationSections.map((section) => (
            <FilteredSection key={section.id} section={section} />
          ))}
        </nav>
      </div>

      {/* User Profile */}
      <UserProfile />
    </div>
  );
}
