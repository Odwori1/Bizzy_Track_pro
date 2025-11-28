'use client';

import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { CurrencyTest } from '@/components/test/CurrencyTest';



export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.firstName}!
        </h1>
        <Button onClick={logout} variant="outline">
          Logout
        </Button>
      </div>
      

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Security Overview Card - Week 16 Features */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">Security Overview</h3>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              Monitor your security posture and compliance status.
            </p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Last Audit</span>
                <span className="text-sm font-medium text-green-600">Passed</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Compliance</span>
                <span className="text-sm font-medium text-blue-600">98%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions Card */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start">
              View Security Audits
            </Button>
            <Button variant="outline" className="w-full justify-start">
              Check Compliance
            </Button>
            <Button variant="outline" className="w-full justify-start">
              Security Analytics
            </Button>
          </CardContent>
        </Card>

        {/* System Status Card */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">System Status</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Backend API</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Online
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Database</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Connected
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Security</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Week 16 Security Features Section */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-bold text-gray-900">Security & Compliance</h2>
          <p className="text-gray-600">
            Manage security audits, compliance frameworks, and security analytics
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <span className="text-blue-600 font-bold">A</span>
                  </div>
                  <h4 className="font-semibold text-gray-900">Permission Audits</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Review and manage user permissions
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <span className="text-green-600 font-bold">C</span>
                  </div>
                  <h4 className="font-semibold text-gray-900">Compliance</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Manage compliance frameworks
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <span className="text-purple-600 font-bold">S</span>
                  </div>
                  <h4 className="font-semibold text-gray-900">Security Analytics</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    View security metrics and trends
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <span className="text-orange-600 font-bold">SC</span>
                  </div>
                  <h4 className="font-semibold text-gray-900">Security Scans</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Run and monitor security scans
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
