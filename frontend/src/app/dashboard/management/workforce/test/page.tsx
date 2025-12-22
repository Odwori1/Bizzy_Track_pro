'use client';

import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { workforceApi } from '@/lib/api/workforce';
import { Button } from '@/components/ui/Button';

export default function WorkforceTestPage() {
  const { user } = useAuthStore();
  const [testResults, setTestResults] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const runTests = async () => {
    setLoading(true);
    const results: any = {};

    try {
      // Test 1: Staff Profiles
      results.staffProfiles = await workforceApi.getStaffProfiles();
      results.staffProfilesSuccess = true;
    } catch (error: any) {
      results.staffProfilesError = error.message;
      results.staffProfilesSuccess = false;
    }

    try {
      // Test 2: Shifts
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const nextWeekStr = nextWeek.toISOString().split('T')[0];
      
      results.shifts = await workforceApi.getShifts({
        start_date: today,
        end_date: nextWeekStr
      });
      results.shiftsSuccess = true;
    } catch (error: any) {
      results.shiftsError = error.message;
      results.shiftsSuccess = false;
    }

    try {
      // Test 3: Timesheets
      results.timesheets = await workforceApi.getTimesheets();
      results.timesheetsSuccess = true;
    } catch (error: any) {
      results.timesheetsError = error.message;
      results.timesheetsSuccess = false;
    }

    setTestResults(results);
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      runTests();
    }
  }, [user]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Workforce API Test</h1>
      
      <div className="mb-6">
        <Button onClick={runTests} disabled={loading}>
          {loading ? 'Running Tests...' : 'Run Tests'}
        </Button>
      </div>

      <div className="space-y-6">
        {/* Staff Profiles Test */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Staff Profiles API</h2>
          {testResults.staffProfilesSuccess !== undefined && (
            <div className={testResults.staffProfilesSuccess ? 'text-green-600' : 'text-red-600'}>
              {testResults.staffProfilesSuccess ? '✅ Success' : '❌ Failed'}
              {testResults.staffProfilesError && (
                <p className="text-sm mt-1">Error: {testResults.staffProfilesError}</p>
              )}
              {testResults.staffProfiles && (
                <p className="text-sm mt-1">
                  Count: {testResults.staffProfiles.length} profiles
                </p>
              )}
            </div>
          )}
        </div>

        {/* Shifts Test */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Shifts API</h2>
          {testResults.shiftsSuccess !== undefined && (
            <div className={testResults.shiftsSuccess ? 'text-green-600' : 'text-red-600'}>
              {testResults.shiftsSuccess ? '✅ Success' : '❌ Failed'}
              {testResults.shiftsError && (
                <p className="text-sm mt-1">Error: {testResults.shiftsError}</p>
              )}
              {testResults.shifts && (
                <p className="text-sm mt-1">
                  Count: {testResults.shifts.length} shifts
                </p>
              )}
            </div>
          )}
        </div>

        {/* Timesheets Test */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Timesheets API</h2>
          {testResults.timesheetsSuccess !== undefined && (
            <div className={testResults.timesheetsSuccess ? 'text-green-600' : 'text-red-600'}>
              {testResults.timesheetsSuccess ? '✅ Success' : '❌ Failed'}
              {testResults.timesheetsError && (
                <p className="text-sm mt-1">Error: {testResults.timesheetsError}</p>
              )}
              {testResults.timesheets && (
                <p className="text-sm mt-1">
                  Count: {testResults.timesheets.length} timesheets
                </p>
              )}
            </div>
          )}
        </div>

        {/* User Info */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">User Info</h2>
          {user ? (
            <div>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Role:</strong> {user.role}</p>
              <p><strong>Business ID:</strong> {user.businessId}</p>
            </div>
          ) : (
            <p className="text-yellow-600">No user logged in</p>
          )}
        </div>
      </div>
    </div>
  );
}
