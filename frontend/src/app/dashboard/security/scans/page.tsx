'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function SecurityScansPage() {
  const scans = [
    {
      id: 1,
      name: 'Full System Scan',
      status: 'completed',
      date: '2025-11-17 22:15:00',
      issues: 2,
    },
    {
      id: 2,
      name: 'Permission Audit',
      status: 'completed',
      date: '2025-11-17 20:30:00',
      issues: 0,
    },
    {
      id: 3,
      name: 'Compliance Check',
      status: 'running',
      date: '2025-11-17 23:00:00',
      issues: null,
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Security Scans</h1>
          <p className="text-gray-600 mt-2">
            Run and monitor security scans across your system
          </p>
        </div>
        <Button variant="primary">
          Run New Scan
        </Button>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Recent Scans</h2>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {scans.map((scan) => (
              <div
                key={scan.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
              >
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{scan.name}</h3>
                  <p className="text-sm text-gray-600">{scan.date}</p>
                </div>
                <div className="flex items-center space-x-4">
                  {scan.issues !== null && (
                    <span className="text-sm text-gray-600">
                      {scan.issues} {scan.issues === 1 ? 'issue' : 'issues'}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                      scan.status
                    )}`}
                  >
                    {scan.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
