'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/Card';

export default function SecurityAnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security Analytics</h1>
        <p className="text-gray-600 mt-2">
          Monitor security metrics and trends across your business
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">98%</div>
              <p className="text-sm text-gray-600 mt-1">Security Score</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">24</div>
              <p className="text-sm text-gray-600 mt-1">Audits This Month</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">3</div>
              <p className="text-sm text-gray-600 mt-1">Pending Actions</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">0</div>
              <p className="text-sm text-gray-600 mt-1">Critical Issues</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Security Trends</h2>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
            <p className="text-gray-500">Security trends chart will be implemented in Week 12</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
