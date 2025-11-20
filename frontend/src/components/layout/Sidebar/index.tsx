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
    {
      name: 'Security Scans',
      href: '/dashboard/security/scans',
      icon: '🔒',
      permission: 'scan:view',
    },
  ],
};

export const Sidebar: React.FC = () => {
  return (
    <div className="flex flex-col w-64 bg-white border-r border-gray-200 h-full">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 px-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">B</span>
          </div>
          <span className="font-bold text-gray-900">Bizzy Track Pro</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3">
        <nav className="space-y-8">
          <NavigationSection title="Overview" items={navigationItems.overview} />
          <NavigationSection title="Management" items={navigationItems.management} />
          <NavigationSection title="Security" items={navigationItems.security} />
        </nav>
      </div>

      {/* User Profile */}
      <div className="border-t border-gray-200 p-4">
        <UserProfile />
      </div>
    </div>
  );
}
