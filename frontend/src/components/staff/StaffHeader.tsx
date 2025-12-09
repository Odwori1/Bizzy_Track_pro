'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { useStaffStore } from '@/store/staffStore';

export function StaffHeader() {
  const { statistics, loading } = useStaffStore();
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', name: 'Overview', href: '/dashboard/management/staff' },
    { id: 'list', name: 'All Staff', href: '/dashboard/management/staff/list' },
    { id: 'invitations', name: 'Invitations', href: '/dashboard/management/staff/invitations' },
    { id: 'roles', name: 'Roles', href: '/dashboard/management/staff/roles' },
    { id: 'departments', name: 'Departments', href: '/dashboard/management/staff/departments' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-gray-600">Manage staff accounts, roles, and permissions</p>
        </div>
        <div className="flex space-x-3">
          <Link href="/dashboard/management/staff/create">
            <Button variant="primary">
              + Add Staff
            </Button>
          </Link>
          <Link href="/dashboard/management/staff/invitations">
            <Button variant="secondary">
              Invite Staff
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-sm text-gray-600">Total Staff</div>
            <div className="text-2xl font-bold">{statistics.total}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-sm text-gray-600">Active</div>
            <div className="text-2xl font-bold text-green-600">{statistics.active}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-sm text-gray-600">Pending Invitations</div>
            <div className="text-2xl font-bold text-yellow-600">{statistics.pending_invitations}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-sm text-gray-600">Avg Performance</div>
            <div className="text-2xl font-bold text-blue-600">{statistics.avg_performance.toFixed(1)}%</div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              onClick={() => setActiveTab(tab.id)}
              className={`
                whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.name}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
