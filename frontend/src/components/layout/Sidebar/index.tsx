'use client';

import { NavigationSection } from './NavigationSection';
import { UserProfile } from './UserProfile';

const navigationItems = {
  overview: [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: '📊',
      permission: 'dashboard:view',
    },
  ],
  management: [
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
    // WEEK 6 - ASSET & EQUIPMENT MANAGEMENT
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
  pricing: [
    {
      name: 'Pricing Rules',
      href: '/dashboard/management/pricing/rules',
      icon: '💰',
      permission: 'pricing:view',
    },
    {
      name: 'Seasonal Pricing',
      href: '/dashboard/management/pricing/seasonal',
      icon: '📅',
      permission: 'pricing:view',
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
      permission: 'pricing:view',
    },
    {
      name: 'Evaluation Tool',
      href: '/dashboard/management/pricing/evaluate',
      icon: '🔍',
      permission: 'pricing:view',
    },
  ],
  security: [
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
  ],
};

export const Sidebar: React.FC = () => {
  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-800">Bizzy Track Pro</h1>
        <p className="text-sm text-gray-600">Business Management</p>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3">
        <nav className="space-y-8">
          <NavigationSection title="Overview" items={navigationItems.overview} />
          <NavigationSection title="Management" items={navigationItems.management} />
          <NavigationSection title="Pricing Management" items={navigationItems.pricing} />
          <NavigationSection title="Security" items={navigationItems.security} />
        </nav>
      </div>

      {/* User Profile */}
      <div className="border-t border-gray-200 p-4">
        <UserProfile />
      </div>
    </div>
  );
};
