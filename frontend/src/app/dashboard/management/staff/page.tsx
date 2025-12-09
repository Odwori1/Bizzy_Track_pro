'use client';

import { useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useStaffStore } from '@/store/staffStore';
import { StaffList } from '@/components/staff/StaffList';
import { formatDate } from '@/lib/date-format';
import { useCurrency } from '@/lib/currency';
import Link from 'next/link';

export default function StaffDashboardPage() {
  const { dashboardData, statistics, loading, error, actions } = useStaffStore();
  const { format } = useCurrency();

  useEffect(() => {
    actions.fetchDashboardData();
    actions.fetchStatistics();
    actions.fetchStaff();
  }, []);

  if (loading && !dashboardData) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="text-gray-500 text-lg">Loading staff dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => actions.fetchDashboardData()} 
            className="mt-2"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Dashboard Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Recent Activity */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
                <Link href="/dashboard/management/staff/list">
                  <Button variant="secondary" size="sm">
                    View All
                  </Button>
                </Link>
              </div>
              
              <div className="space-y-4">
                {dashboardData?.recent_activity?.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <div>
                        <div className="font-medium">{activity.staff_name}</div>
                        <div className="text-sm text-gray-600">{activity.action}</div>
                        {activity.details && (
                          <div className="text-xs text-gray-500 mt-1">{activity.details}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {formatDate(activity.timestamp)}
                    </div>
                  </div>
                ))}

                {(!dashboardData?.recent_activity || dashboardData.recent_activity.length === 0) && (
                  <div className="text-center py-4 text-gray-500">
                    No recent activity
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Department Distribution */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Staff by Department</h2>
              <div className="space-y-3">
                {dashboardData?.department_distribution?.map((dept) => (
                  <div key={dept.department_id} className="flex items-center justify-between">
                    <div className="text-sm text-gray-700">{dept.department_name || 'No Department'}</div>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full"
                          style={{ 
                            width: `${(dept.staff_count / (statistics?.total || 1)) * 100}%` 
                          }}
                        ></div>
                      </div>
                      <div className="text-sm font-medium">{dept.staff_count}</div>
                    </div>
                  </div>
                ))}

                {(!dashboardData?.department_distribution || dashboardData.department_distribution.length === 0) && (
                  <div className="text-center py-4 text-gray-500">
                    No department assignments yet
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column - Quick Actions & Performance */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <Link href="/dashboard/management/staff/create">
                  <Button variant="primary" className="w-full justify-start">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Staff Account
                  </Button>
                </Link>
                <Link href="/dashboard/management/staff/invitations">
                  <Button variant="secondary" className="w-full justify-start">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Send Invitations
                  </Button>
                </Link>
                <Link href="/dashboard/management/staff/roles">
                  <Button variant="secondary" className="w-full justify-start">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Manage Roles
                  </Button>
                </Link>
              </div>
            </div>
          </Card>

          {/* Top Performers */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Performers</h2>
              <div className="space-y-4">
                {dashboardData?.performance_overview?.top_performers?.slice(0, 3).map((performer, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-medium">{index + 1}</span>
                      </div>
                      <div>
                        <div className="font-medium text-sm">Staff Member</div>
                        <div className="text-xs text-gray-500">
                          {performer.jobs_completed} jobs • {format(performer.revenue_generated)}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-medium text-green-600">
                      {performer.efficiency_score?.toFixed(1)}%
                    </div>
                  </div>
                ))}

                {(!dashboardData?.performance_overview?.top_performers || 
                  dashboardData.performance_overview.top_performers.length === 0) && (
                  <div className="text-center py-4 text-gray-500">
                    No performance data yet
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Staff List Preview */}
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Staff</h2>
            <Link href="/dashboard/management/staff/list">
              <Button variant="secondary" size="sm">
                View All Staff
              </Button>
            </Link>
          </div>
          <StaffList limit={5} />
        </div>
      </Card>
    </div>
  );
}
