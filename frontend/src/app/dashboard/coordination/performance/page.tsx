'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';

export default function CoordinationPerformancePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Department Performance</h1>
          <p className="text-gray-600">
            Analytics and metrics for department coordination
          </p>
        </div>
        
        <Button variant="outline">
          Export Reports
        </Button>
      </div>

      {/* Coming Soon Notice */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-8 text-center">
        <div className="mb-4">
          <svg className="w-16 h-16 text-purple-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-purple-800 mb-2">Week 9.2 - Performance Analytics</h3>
        <p className="text-purple-700 mb-4">
          This section will display department performance metrics and analytics.
          Backend endpoints are ready and tested.
        </p>
        <div className="bg-white rounded-lg p-4 inline-block">
          <p className="text-sm text-gray-700">
            <strong>Ready Backend Features:</strong>
          </p>
          <ul className="text-sm text-gray-600 text-left mt-2 space-y-1">
            <li>• Department performance overview</li>
            <li>• Real-time status updates</li>
            <li>• Consolidated billing system</li>
            <li>• Hospital-style job tracking</li>
            <li>• Department hierarchy management</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
