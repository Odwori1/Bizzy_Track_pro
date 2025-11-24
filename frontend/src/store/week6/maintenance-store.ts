import { create } from 'zustand';
import { MaintenanceRecord } from '@/types/assets';
import { apiClient } from '@/lib/api';

interface MaintenanceState {
  maintenanceRecords: MaintenanceRecord[];
  upcomingMaintenance: MaintenanceRecord[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchMaintenanceRecords: () => Promise<void>;
  fetchUpcomingMaintenance: () => Promise<void>;
  fetchMaintenanceByAsset: (assetId: string) => Promise<void>;
  createMaintenance: (maintenanceData: Partial<MaintenanceRecord>) => Promise<void>;
  updateMaintenance: (maintenanceId: string, maintenanceData: Partial<MaintenanceRecord>) => Promise<void>;
  deleteMaintenance: (maintenanceId: string) => Promise<void>;
  clearError: () => void;
}

// Helper function to safely extract and format dates
const safeDateTransform = (data: any): MaintenanceRecord => {
  // Extract date strings from backend format
  const getDateString = (dateField: any): string => {
    if (!dateField) return '';
    if (typeof dateField === 'string') return dateField;
    if (dateField.iso_local) return dateField.iso_local;
    if (dateField.utc) return dateField.utc;
    if (dateField.formatted) return dateField.formatted;
    return '';
  };

  // Format date for display
  const formatDisplayDate = (dateString: string): string => {
    if (!dateString) return 'Not scheduled';
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? 'Invalid Date' : 
        date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        });
    } catch {
      return 'Invalid Date';
    }
  };

  const maintenanceDate = getDateString(data.maintenance_date);
  const nextMaintenanceDate = getDateString(data.next_maintenance_date);
  const createdAt = getDateString(data.created_at);
  const updatedAt = getDateString(data.updated_at);

  return {
    id: data.id || '',
    asset_id: data.asset_id || '',
    asset_name: data.asset_name || '',
    asset_code: data.asset_code || '',
    maintenance_type: data.maintenance_type || 'routine',
    maintenance_date: maintenanceDate,
    next_maintenance_date: nextMaintenanceDate,
    cost: typeof data.cost === 'string' ? parseFloat(data.cost) : (data.cost || 0),
    technician: data.technician || '',
    description: data.description || '',
    status: data.status || 'scheduled',
    created_at: createdAt,
    updated_at: updatedAt,
    
    // Formatted dates for display
    formatted_maintenance_date: formatDisplayDate(maintenanceDate),
    formatted_next_maintenance_date: formatDisplayDate(nextMaintenanceDate),
    formatted_created_at: formatDisplayDate(createdAt)
  };
};

export const useMaintenanceStore = create<MaintenanceState>((set, get) => ({
  maintenanceRecords: [],
  upcomingMaintenance: [],
  isLoading: false,
  error: null,

  fetchMaintenanceRecords: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get('/maintenance');
      console.log('Maintenance API Response:', response); // Debug log
      
      // Handle different response structures
      let records = [];
      if (response.data && Array.isArray(response.data)) {
        records = response.data.map(safeDateTransform);
      } else if (Array.isArray(response)) {
        records = response.map(safeDateTransform);
      }
      
      set({ maintenanceRecords: records, isLoading: false });
    } catch (error: any) {
      console.error('Error fetching maintenance:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  fetchUpcomingMaintenance: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get('/maintenance/upcoming');
      console.log('Upcoming Maintenance API Response:', response); // Debug log
      
      let records = [];
      if (response.data && Array.isArray(response.data)) {
        records = response.data.map(safeDateTransform);
      } else if (Array.isArray(response)) {
        records = response.map(safeDateTransform);
      }
      
      set({ upcomingMaintenance: records, isLoading: false });
    } catch (error: any) {
      console.error('Error fetching upcoming maintenance:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  fetchMaintenanceByAsset: async (assetId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get(`/maintenance/asset/${assetId}`);
      console.log('Maintenance by Asset API Response:', response); // Debug log
      
      let records = [];
      if (response.data && Array.isArray(response.data)) {
        records = response.data.map(safeDateTransform);
      } else if (Array.isArray(response)) {
        records = response.map(safeDateTransform);
      }
      
      set({ maintenanceRecords: records, isLoading: false });
    } catch (error: any) {
      console.error('Error fetching maintenance by asset:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  createMaintenance: async (maintenanceData: Partial<MaintenanceRecord>) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.post('/maintenance', maintenanceData);
      const newMaintenance = safeDateTransform(response.data);
      set(state => ({
        maintenanceRecords: [...state.maintenanceRecords, newMaintenance],
        isLoading: false
      }));
      return newMaintenance;
    } catch (error: any) {
      console.error('Error creating maintenance:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  updateMaintenance: async (maintenanceId: string, maintenanceData: Partial<MaintenanceRecord>) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.put(`/maintenance/${maintenanceId}`, maintenanceData);
      const updatedMaintenance = safeDateTransform(response.data);
      set(state => ({
        maintenanceRecords: state.maintenanceRecords.map(record =>
          record.id === maintenanceId ? updatedMaintenance : record
        ),
        isLoading: false
      }));
      return updatedMaintenance;
    } catch (error: any) {
      console.error('Error updating maintenance:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  deleteMaintenance: async (maintenanceId: string) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.delete(`/maintenance/${maintenanceId}`);
      set(state => ({
        maintenanceRecords: state.maintenanceRecords.filter(record => record.id !== maintenanceId),
        isLoading: false
      }));
    } catch (error: any) {
      console.error('Error deleting maintenance:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null })
}));
