'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/store/authStore';

// Import BOTH hooks to compare
import { useWorkforce } from '@/hooks/useWorkforce';
import { useUnifiedEmployees } from '@/hooks/useUnifiedEmployees';
import { UnifiedEmployee, StaffProfile } from '@/types/workforce';

export default function UnifiedTimeClockTestPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuthStore();
  
  // OLD system
  const { 
    fetchStaffProfiles: fetchOldProfiles,
    fetchClockEvents: fetchOldEvents,
    clockIn: oldClockIn,
    clockOut: oldClockOut,
    loading: oldLoading 
  } = useWorkforce();
  
  // NEW unified system
  const { 
    fetchEmployees: fetchNewEmployees,
    fetchClockEvents: fetchNewEvents,
    clockIn: newClockIn,
    clockOut: newClockOut,
    loading: newLoading 
  } = useUnifiedEmployees();

  const [oldData, setOldData] = useState<StaffProfile[]>([]);
  const [newData, setNewData] = useState<UnifiedEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [useUnified, setUseUnified] = useState(false); // Toggle between systems

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadData();
  }, [authLoading, isAuthenticated, router, useUnified]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (useUnified) {
        // Use NEW unified system
        const employees = await fetchNewEmployees();
        setNewData(employees);
        setOldData([]);
      } else {
        // Use OLD workforce system
        const profiles = await fetchOldProfiles();
        setOldData(profiles);
        setNewData([]);
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSystem = () => {
    setUseUnified(!useUnified);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const currentData = useUnified ? newData : oldData;
  const systemName = useUnified ? "NEW Unified System (/api/employees)" : "OLD Workforce System (/api/workforce)";
  const dataCount = currentData.length;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">System Comparison</h1>
        <p className="text-gray-600 mt-1">Testing unified vs old workforce system</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>System Selection</span>
            <Badge className={useUnified ? 'bg-green-500' : 'bg-blue-500'}>
              {useUnified ? 'Using NEW System' : 'Using OLD System'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Button onClick={handleToggleSystem} className="w-full">
              Switch to {useUnified ? 'OLD System' : 'NEW Unified System'}
            </Button>
            
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dataCount}</div>
                    <div className="text-sm text-gray-600">Records Found</div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-lg font-bold">{systemName}</div>
                    <div className="text-sm text-gray-600">Current System</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Preview (First 5 records)</CardTitle>
          <CardDescription>
            {useUnified ? 'Unified Employee Data' : 'Workforce Profile Data'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentData.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No data found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentData.slice(0, 5).map((item, index) => (
                <div key={index} className="p-4 border border-gray-200 rounded-lg">
                  {useUnified ? (
                    // Unified Employee display
                    <div>
                      <div className="font-medium">{(item as UnifiedEmployee).full_name}</div>
                      <div className="text-sm text-gray-600">
                        ID: {(item as UnifiedEmployee).employee_id} • 
                        Role: {(item as UnifiedEmployee).role} • 
                        Status: {(item as UnifiedEmployee).status}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Can Clock In: {(item as UnifiedEmployee).can_clock_in ? 'Yes' : 'No'}
                      </div>
                    </div>
                  ) : (
                    // Old Workforce Profile display
                    <div>
                      <div className="font-medium">{(item as StaffProfile).user_full_name}</div>
                      <div className="text-sm text-gray-600">
                        ID: {(item as StaffProfile).employee_id} • 
                        Job: {(item as StaffProfile).job_title}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-bold mb-2">System Comparison Notes:</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li><strong>OLD System:</strong> Uses `/api/workforce/staff-profiles` - Workforce data only</li>
          <li><strong>NEW System:</strong> Uses `/api/employees` - Combined staff + workforce data</li>
          <li><strong>Key difference:</strong> NEW system includes user info + workforce info in one call</li>
          <li><strong>Status:</strong> NEW system shows combined status (Active/Inactive)</li>
          <li><strong>Clock In:</strong> NEW system uses `/api/employees/{id}/clock-in`</li>
        </ul>
      </div>
    </div>
  );
}
