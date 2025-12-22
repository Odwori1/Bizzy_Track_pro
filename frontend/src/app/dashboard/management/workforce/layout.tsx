'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/rolePermissions';
import { Button } from '@/components/ui/Button';

export default function WorkforceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, loading: authLoading } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Navigation items for workforce management with proper permissions
  const navigationItems = [
    {
      name: 'Dashboard',
      href: '/dashboard/management/workforce',
      icon: '📊',
      permission: 'workforce:dashboard:view',
    },
    {
      name: 'Staff Profiles',
      href: '/dashboard/management/workforce/staff/profiles',
      icon: '👥',
      permission: 'staff_profile:read',
    },
    {
      name: 'Shift Management',
      href: '/dashboard/management/workforce/shifts',
      icon: '📅',
      permission: 'shift:read',
    },
    {
      name: 'Timesheets',
      href: '/dashboard/management/workforce/timesheets',
      icon: '⏰',
      permission: 'timesheet:read',
    },
    {
      name: 'Performance',
      href: '/dashboard/management/workforce/performance',
      icon: '📈',
      permission: 'performance:read',
    },
    {
      name: 'Availability',
      href: '/dashboard/management/workforce/availability',
      icon: '✅',
      permission: 'availability:read',
    },
    {
      name: 'Payroll',
      href: '/dashboard/management/workforce/payroll',
      icon: '💰',
      permission: 'payroll:read',
    },
  ];

  const subNavigationItems = [
    {
      name: 'Shift Templates',
      href: '/dashboard/management/workforce/shifts/templates',
      icon: '📋',
      permission: 'shift_template:read',
    },
    {
      name: 'Schedule',
      href: '/dashboard/management/workforce/shifts/schedule',
      icon: '🗓️',
      permission: 'shift:create',
    },
    {
      name: 'Roster',
      href: '/dashboard/management/workforce/shifts/roster',
      icon: '👨‍💼',
      permission: 'shift:read',
    },
    {
      name: 'Clock In/Out',
      href: '/dashboard/management/workforce/timesheets/clock',
      icon: '🕐',
      permission: 'clock:in',
    },
    {
      name: 'Approvals',
      href: '/dashboard/management/workforce/timesheets/approval',
      icon: '✅',
      permission: 'timesheet:approve',
    },
  ];

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    router.push('/auth/login');
    return null;
  }

  // Check if user has any workforce permissions
  const hasWorkforceAccess = navigationItems.some(item => 
    hasPermission(user.role as any, item.permission)
  );

  if (!hasWorkforceAccess) {
    // User doesn't have workforce permissions, redirect to dashboard
    router.push('/dashboard');
    return null;
  }

  // Filter navigation items based on permissions
  const filteredNavItems = navigationItems.filter(item => 
    hasPermission(user.role as any, item.permission)
  );

  const filteredSubNavItems = subNavigationItems.filter(item => 
    hasPermission(user.role as any, item.permission)
  );

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </Button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40
          w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out
          lg:flex lg:flex-col lg:inset-y-0
        `}>
          {/* Sidebar Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Workforce Management</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(false)}
                className="lg:hidden"
              >
                ✕
              </Button>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Manage staff, shifts, timesheets, and payroll
            </p>
          </div>

          {/* Main Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            <div className="px-3 space-y-1">
              {filteredNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
                    ${isActive(item.href)
                      ? 'bg-blue-50 text-blue-700 border border-blue-100'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }
                  `}
                >
                  <span className="mr-3 text-lg">{item.icon}</span>
                  {item.name}
                </Link>
              ))}
            </div>

            {/* Sub-navigation */}
            {filteredSubNavItems.length > 0 && (
              <div className="mt-8 px-3">
                <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Quick Actions
                </h3>
                <div className="space-y-1">
                  {filteredSubNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`
                        flex items-center px-3 py-2 text-sm rounded-lg transition-colors
                        ${isActive(item.href)
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }
                      `}
                    >
                      <span className="mr-2">{item.icon}</span>
                      {item.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Back to Staff Management */}
            <div className="mt-8 px-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  router.push('/dashboard/management/staff');
                  setMobileMenuOpen(false);
                }}
                className="w-full"
              >
                ← Back to Staff Management
              </Button>
            </div>
          </nav>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-gray-200">
            <div className="text-xs text-gray-500">
              <p>Workforce Management System</p>
              <p className="mt-1">v1.0 • Week 10 Implementation</p>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 lg:ml-0">
          {/* Mobile overlay */}
          {mobileMenuOpen && (
            <div
              className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          <div className="p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
