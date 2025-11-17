'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/Card';

export default function CompliancePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Compliance Frameworks</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">GDPR</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Compliant
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Last Review</span>
                <span className="text-sm font-medium">2025-11-15</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">ISO 27001</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  In Progress
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Last Review</span>
                <span className="text-sm font-medium">2025-11-10</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">PCI DSS</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Compliant
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Last Review</span>
                <span className="text-sm font-medium">2025-11-12</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
