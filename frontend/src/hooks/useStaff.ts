import { useState, useCallback } from 'react';
import { Staff, StaffFilters, StaffFormData, StaffUpdateData } from '@/types/staff';
import { staffApi } from '@/lib/api/staff';

export const useStaff = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStaff = useCallback(async (filters?: StaffFilters): Promise<Staff[]> => {
    setLoading(true);
    setError(null);
    
    try {
      const staff = await staffApi.getStaff(filters);
      return staff;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch staff');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createStaff = useCallback(async (staffData: StaffFormData) => {
    setLoading(true);
    setError(null);
    
    try {
      const staff = await staffApi.createStaff(staffData);
      return staff;
    } catch (err: any) {
      setError(err.message || 'Failed to create staff');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStaff = useCallback(async (id: string, staffData: StaffUpdateData) => {
    setLoading(true);
    setError(null);
    
    try {
      const staff = await staffApi.updateStaff(id, staffData);
      return staff;
    } catch (err: any) {
      setError(err.message || 'Failed to update staff');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteStaff = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const staff = await staffApi.deleteStaff(id);
      return staff;
    } catch (err: any) {
      setError(err.message || 'Failed to delete staff');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    fetchStaff,
    createStaff,
    updateStaff,
    deleteStaff,
  };
};
