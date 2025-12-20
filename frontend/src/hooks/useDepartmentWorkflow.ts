import { useState } from 'react';
import { departmentApi } from '@/lib/api/department';

export const useDepartmentWorkflow = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completeDepartmentWork = async (
    assignmentId: string,
    departmentId: string,
    jobId: string,
    description: string,
    hoursWorked: number,
    hourlyRate: number
  ) => {
    setLoading(true);
    setError(null);

    try {
      // 1. Update assignment status to "completed"
      await departmentApi.updateJobAssignment(assignmentId, {
        status: 'completed',
        actual_end: new Date().toISOString(),
        actual_hours: hoursWorked
      });

      // 2. Auto-create billing entry
      await departmentApi.allocateCharge({
        department_id: departmentId,
        job_id: jobId,
        description: `Completed work: ${description}`,
        quantity: hoursWorked,
        unit_price: hourlyRate,
        total_amount: hoursWorked * hourlyRate,
        billing_type: 'service',
        billing_date: new Date().toISOString().split('T')[0]
      });

      return { success: true };
    } catch (error: any) {
      console.error('Failed to complete department work:', error);
      setError(error.message || 'Failed to complete work');
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  return {
    completeDepartmentWork,
    loading,
    error
  };
};
