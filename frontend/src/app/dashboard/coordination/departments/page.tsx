'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export default function DepartmentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Department Coordination</h1>
          <p className="text-gray-600">
            Manage departments and coordinate workflows
          </p>
        </div>
        
        <div className="flex space-x-2">
          <Button variant="outline">
            Department Hierarchy
          </Button>
          <Button>
            Create Department
          </Button>
        </div>
      </div>

      {/* Coming Soon Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
        <div className="mb-4">
          <svg className="w-16 h-16 text-blue-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-blue-800 mb-2">Week 9.2 - Department Coordination</h3>
        <p className="text-blue-700 mb-4">
          This section is part of Week 9.2 Department Coordination System.
          The backend API endpoints are already complete and tested.
        </p>
        <div className="bg-white rounded-lg p-4 inline-block">
          <p className="text-sm text-gray-700">
            <strong>Available Backend Endpoints:</strong>
          </p>
          <ul className="text-sm text-gray-600 text-left mt-2 space-y-1">
            <li>• GET /api/departments - List departments</li>
            <li>• GET /api/departments/hierarchy - Department hierarchy</li>
            <li>• GET /api/department-performance - Performance overview</li>
            <li>• GET /api/department-billing - Consolidated billing</li>
            <li>• POST /api/job-department-assignments - Assign jobs to departments</li>
          </ul>
        </div>
        <p className="text-blue-600 mt-4">
          Frontend implementation coming in Week 9.2 completion phase.
        </p>
      </div>
    </div>
  );
}
