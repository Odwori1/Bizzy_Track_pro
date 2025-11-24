import { create } from 'zustand';
import { EquipmentAsset, HireBooking } from '@/types/assets';
import { apiClient } from '@/lib/api';

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface EquipmentState {
  equipment: EquipmentAsset[];
  hireBookings: HireBooking[];
  activeHireBookings: HireBooking[];
  customers: Customer[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchEquipment: () => Promise<void>;
  fetchAvailableEquipment: () => Promise<void>;
  fetchHireBookings: () => Promise<void>;
  fetchActiveHireBookings: () => Promise<void>;
  fetchCustomers: () => Promise<void>;
  createEquipment: (equipmentData: Partial<EquipmentAsset>) => Promise<void>;
  updateEquipment: (equipmentId: string, equipmentData: Partial<EquipmentAsset>) => Promise<void>;
  deleteEquipment: (equipmentId: string) => Promise<void>;
  createHireBooking: (bookingData: any) => Promise<void>;
  updateHireBooking: (bookingId: string, bookingData: any) => Promise<void>;
  returnEquipment: (bookingId: string, returnData: any) => Promise<void>;
  clearError: () => void;
}

export const useEquipmentStore = create<EquipmentState>((set, get) => ({
  equipment: [],
  hireBookings: [],
  activeHireBookings: [],
  customers: [],
  isLoading: false,
  error: null,

  fetchEquipment: async () => {
    set({ isLoading: true, error: null });
    try {
      // Get equipment from backend
      let backendEquipment: EquipmentAsset[] = [];
      try {
        const response = await apiClient.get<any>('/equipment-hire/equipment/available');
        const equipmentData = Array.isArray(response) ? response : (response?.data || []);
        
        backendEquipment = equipmentData.map((eq: any) => ({
          id: eq.id,
          business_id: eq.business_id,
          asset_name: eq.asset_name || 'Unknown Equipment',
          asset_code: eq.asset_code || 'N/A',
          category: 'equipment',
          description: eq.description || '',
          purchase_date: eq.purchase_date || new Date().toISOString().split('T')[0],
          purchase_price: eq.purchase_price || 0,
          current_value: eq.current_value || 0,
          location: eq.location || 'Unknown',
          condition_status: eq.condition_status || 'good',
          serial_number: eq.serial_number || '',
          is_available: true,
          hire_rate: eq.hire_rate_per_day || 50,
          deposit_amount: eq.deposit_amount || 100,
          min_hire_duration: eq.minimum_hire_period || 1,
          max_hire_duration: 7,
          photos: eq.photos || [],
          created_by: eq.created_by,
          created_at: eq.created_at?.utc || new Date().toISOString(),
          updated_at: eq.updated_at?.utc || new Date().toISOString()
        } as EquipmentAsset));
      } catch (error) {
        console.log('Could not fetch equipment from backend:', error);
      }

      // Get local equipment as fallback
      const localEquipment = JSON.parse(localStorage.getItem('bizzy_equipment') || '[]');

      // Combine equipment
      const allEquipment = [...backendEquipment, ...localEquipment];

      console.log('All equipment loaded:', allEquipment);
      set({ equipment: allEquipment, isLoading: false });
    } catch (error: any) {
      console.error('Failed to fetch equipment:', error);
      set({ equipment: [], error: error.message, isLoading: false });
    }
  },

  fetchAvailableEquipment: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get<any>('/equipment-hire/equipment/available');
      const equipmentData = Array.isArray(response) ? response : (response?.data || []);
      
      const availableEquipment = equipmentData.map((eq: any) => ({
        id: eq.id,
        business_id: eq.business_id,
        asset_name: eq.asset_name || 'Unknown Equipment',
        asset_code: eq.asset_code || 'N/A',
        category: 'equipment',
        description: eq.description || '',
        purchase_date: eq.purchase_date || new Date().toISOString().split('T')[0],
        purchase_price: eq.purchase_price || 0,
        current_value: eq.current_value || 0,
        location: eq.location || 'Unknown',
        condition_status: eq.condition_status || 'good',
        serial_number: eq.serial_number || '',
        is_available: true,
        hire_rate: eq.hire_rate_per_day || 50,
        deposit_amount: eq.deposit_amount || 100,
        min_hire_duration: eq.minimum_hire_period || 1,
        max_hire_duration: 7,
        photos: eq.photos || [],
        created_by: eq.created_by,
        created_at: eq.created_at?.utc || new Date().toISOString(),
        updated_at: eq.updated_at?.utc || new Date().toISOString()
      } as EquipmentAsset));

      console.log('Available equipment:', availableEquipment);
      set({ equipment: availableEquipment, isLoading: false });
    } catch (error: any) {
      console.error('Failed to fetch available equipment:', error);
      set({ equipment: [], error: error.message, isLoading: false });
    }
  },

  fetchHireBookings: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get<any>('/equipment-hire/bookings');
      console.log('Raw bookings response:', response);

      let hireBookings: HireBooking[] = [];

      const bookingsData = Array.isArray(response) ? response : (response?.data || []);

      if (Array.isArray(bookingsData) && bookingsData.length > 0) {
        hireBookings = bookingsData.map((booking: any) => {
          const startDate = booking.hire_start_date?.utc || booking.hire_start_date;
          const endDate = booking.hire_end_date?.utc || booking.hire_end_date;
          const assetId = booking.asset_id || booking.equipment_asset_id;

          return {
            id: booking.id,
            equipment_id: assetId,
            business_id: booking.business_id,
            customer_id: booking.customer_id,
            start_date: startDate,
            end_date: endDate,
            total_amount: parseFloat(booking.total_amount) || 0,
            deposit_paid: parseFloat(booking.deposit_paid) || 0,
            status: booking.status || 'reserved',
            condition_before: booking.pre_hire_condition,
            condition_after: booking.post_hire_condition,
            actual_return_date: booking.actual_return_date,
            damage_notes: booking.damage_notes,
            damage_charges: parseFloat(booking.damage_charges) || 0,
            deposit_returned: parseFloat(booking.deposit_returned) || 0,
            final_amount: parseFloat(booking.final_amount) || 0,
            booking_number: booking.booking_number,
            created_by: booking.created_by,
            created_at: booking.created_at?.utc || booking.created_at,
            updated_at: booking.updated_at?.utc || booking.updated_at
          } as HireBooking;
        });
      }

      console.log('Processed hire bookings:', hireBookings);
      set({ hireBookings, isLoading: false });
    } catch (error: any) {
      console.error('Failed to fetch hire bookings:', error);
      set({ hireBookings: [], error: error.message, isLoading: false });
    }
  },

  fetchActiveHireBookings: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get<any>('/equipment-hire/bookings');
      console.log('Active bookings response:', response);

      let activeHireBookings: HireBooking[] = [];

      const bookingsData = Array.isArray(response) ? response : (response?.data || []);

      if (Array.isArray(bookingsData) && bookingsData.length > 0) {
        // Filter for active status bookings (not completed)
        activeHireBookings = bookingsData
          .filter((booking: any) => booking.status !== 'completed')
          .map((booking: any) => {
            const startDate = booking.hire_start_date?.utc || booking.hire_start_date;
            const endDate = booking.hire_end_date?.utc || booking.hire_end_date;
            const assetId = booking.asset_id || booking.equipment_asset_id;

            return {
              id: booking.id,
              equipment_id: assetId,
              business_id: booking.business_id,
              customer_id: booking.customer_id,
              start_date: startDate,
              end_date: endDate,
              total_amount: parseFloat(booking.total_amount) || 0,
              deposit_paid: parseFloat(booking.deposit_paid) || 0,
              status: booking.status || 'reserved',
              condition_before: booking.pre_hire_condition,
              condition_after: booking.post_hire_condition,
              actual_return_date: booking.actual_return_date,
              damage_notes: booking.damage_notes,
              damage_charges: parseFloat(booking.damage_charges) || 0,
              deposit_returned: parseFloat(booking.deposit_returned) || 0,
              final_amount: parseFloat(booking.final_amount) || 0,
              booking_number: booking.booking_number,
              created_by: booking.created_by,
              created_at: booking.created_at?.utc || booking.created_at,
              updated_at: booking.updated_at?.utc || booking.updated_at
            } as HireBooking;
          });
      }

      console.log('Active hire bookings:', activeHireBookings);
      set({ activeHireBookings, isLoading: false });
    } catch (error: any) {
      console.error('Failed to fetch active hire bookings:', error);
      set({ activeHireBookings: [], error: error.message, isLoading: false });
    }
  },

  fetchCustomers: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get<any>('/customers');
      console.log('Customers response:', response);

      let customers: Customer[] = [];

      const customersData = Array.isArray(response) ? response : (response?.data || []);

      if (Array.isArray(customersData) && customersData.length > 0) {
        customers = customersData.map((customer: any) => ({
          id: customer.id,
          name: customer.name || `${customer.first_name} ${customer.last_name}`.trim() || 'Unknown Customer',
          email: customer.email,
          phone: customer.phone
        }));
      }

      // If no customers found from API, create a fallback customer for testing
      if (customers.length === 0) {
        console.log('No customers found from API, creating fallback customer for testing');
        customers = [
          {
            id: 'demo-customer-001',
            name: 'Demo Customer',
            email: 'demo@example.com',
            phone: '+254700000000'
          }
        ];
      }

      console.log('Processed customers:', customers);
      set({ customers, isLoading: false });
    } catch (error: any) {
      console.error('Failed to fetch customers:', error);
      // Create fallback customers for testing
      console.log('Creating fallback customers for testing');
      set({
        customers: [
          {
            id: 'demo-customer-001',
            name: 'Demo Customer',
            email: 'demo@example.com',
            phone: '+254700000000'
          },
          {
            id: 'demo-customer-002', 
            name: 'Test Client',
            email: 'test@example.com',
            phone: '+254711111111'
          }
        ],
        isLoading: false
      });
    }
  },

  createEquipment: async (equipmentData: Partial<EquipmentAsset>) => {
    set({ isLoading: true, error: null });
    try {
      const newEquipment: EquipmentAsset = {
        id: `local-equipment-${Date.now()}`,
        business_id: 'local-business',
        asset_name: equipmentData.asset_name || 'New Equipment',
        asset_code: equipmentData.asset_code || `EQ-${Date.now()}`,
        category: equipmentData.category || 'equipment',
        description: equipmentData.description || '',
        purchase_date: equipmentData.purchase_date || new Date().toISOString().split('T')[0],
        purchase_price: equipmentData.purchase_price || 0,
        current_value: equipmentData.current_value || 0,
        location: equipmentData.location || '',
        condition_status: equipmentData.condition_status || 'good',
        serial_number: equipmentData.serial_number || '',
        is_available: true,
        hire_rate: equipmentData.hire_rate || 0,
        deposit_amount: equipmentData.deposit_amount || 0,
        min_hire_duration: equipmentData.min_hire_duration || 1,
        max_hire_duration: equipmentData.max_hire_duration || 7,
        photos: equipmentData.photos || [],
        created_by: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Save to localStorage
      const currentEquipment = JSON.parse(localStorage.getItem('bizzy_equipment') || '[]');
      const updatedEquipment = [...currentEquipment, newEquipment];
      localStorage.setItem('bizzy_equipment', JSON.stringify(updatedEquipment));

      console.log('Equipment created and saved locally:', newEquipment);

      set(state => ({
        equipment: [...state.equipment, newEquipment],
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  updateEquipment: async (equipmentId: string, equipmentData: Partial<EquipmentAsset>) => {
    set({ isLoading: true, error: null });
    try {
      // Update in localStorage
      const currentEquipment = JSON.parse(localStorage.getItem('bizzy_equipment') || '[]');
      const updatedEquipment = currentEquipment.map((eq: EquipmentAsset) =>
        eq.id === equipmentId ? { ...eq, ...equipmentData } : eq
      );
      localStorage.setItem('bizzy_equipment', JSON.stringify(updatedEquipment));

      set(state => ({
        equipment: state.equipment.map(equipment =>
          equipment.id === equipmentId ? { ...equipment, ...equipmentData } : equipment
        ),
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  deleteEquipment: async (equipmentId: string) => {
    set({ isLoading: true, error: null });
    try {
      // Remove from localStorage
      const currentEquipment = JSON.parse(localStorage.getItem('bizzy_equipment') || '[]');
      const updatedEquipment = currentEquipment.filter((eq: EquipmentAsset) => eq.id !== equipmentId);
      localStorage.setItem('bizzy_equipment', JSON.stringify(updatedEquipment));

      set(state => ({
        equipment: state.equipment.filter(equipment => equipment.id !== equipmentId),
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  createHireBooking: async (bookingData: any) => {
    set({ isLoading: true, error: null });
    try {
      console.log('Creating hire booking with data:', bookingData);

      // Validate required fields
      if (!bookingData.equipment_asset_id) {
        throw new Error('Equipment selection is required');
      }
      if (!bookingData.customer_id) {
        throw new Error('Customer selection is required');
      }
      if (!bookingData.hire_start_date || !bookingData.hire_end_date) {
        throw new Error('Hire dates are required');
      }

      const formattedData = {
        equipment_asset_id: bookingData.equipment_asset_id,
        customer_id: bookingData.customer_id,
        hire_start_date: bookingData.hire_start_date,
        hire_end_date: bookingData.hire_end_date,
        hire_rate: bookingData.hire_rate || 50,
        total_amount: bookingData.total_amount,
        deposit_paid: bookingData.deposit_paid || 0,
        status: 'reserved',
        pre_hire_condition: bookingData.pre_hire_condition || 'Equipment in good condition'
      };

      console.log('Formatted booking data for API:', formattedData);

      const newBooking = await apiClient.post<HireBooking>('/equipment-hire/bookings', formattedData);
      console.log('Booking created successfully:', newBooking);

      // Mark equipment as not available when booked
      if (bookingData.equipment_asset_id && bookingData.equipment_asset_id.startsWith('local-equipment-')) {
        const currentEquipment = JSON.parse(localStorage.getItem('bizzy_equipment') || '[]');
        const updatedEquipment = currentEquipment.map((eq: EquipmentAsset) =>
          eq.id === bookingData.equipment_asset_id ? { ...eq, is_available: false } : eq
        );
        localStorage.setItem('bizzy_equipment', JSON.stringify(updatedEquipment));

        // Update the store state
        set(state => ({
          equipment: state.equipment.map(equipment =>
            equipment.id === bookingData.equipment_asset_id ? { ...equipment, is_available: false } : equipment
          )
        }));
      }

      set(state => ({
        hireBookings: [...state.hireBookings, newBooking],
        activeHireBookings: [...state.activeHireBookings, newBooking],
        isLoading: false
      }));

      return newBooking;
    } catch (error: any) {
      console.error('Failed to create hire booking:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  updateHireBooking: async (bookingId: string, bookingData: any) => {
    set({ isLoading: true, error: null });
    try {
      const updatedBooking = await apiClient.put<HireBooking>(`/equipment-hire/bookings/${bookingId}`, bookingData);
      
      // Update both hireBookings and activeHireBookings
      set(state => ({
        hireBookings: state.hireBookings.map(booking =>
          booking.id === bookingId ? updatedBooking : booking
        ),
        activeHireBookings: state.activeHireBookings
          .map(booking => booking.id === bookingId ? updatedBooking : booking)
          .filter(booking => booking.status !== 'completed'), // Remove completed from active
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  returnEquipment: async (bookingId: string, returnData: any) => {
    set({ isLoading: true, error: null });
    try {
      console.log('Processing equipment return for booking:', bookingId, returnData);

      // Update the booking status to completed with all return data
      const updatedBooking = await apiClient.put<HireBooking>(`/equipment-hire/bookings/${bookingId}`, {
        status: 'completed',
        post_hire_condition: returnData.condition_after,
        actual_return_date: new Date().toISOString().split('T')[0],
        damage_notes: returnData.damage_notes,
        damage_charges: returnData.damage_charges || 0,
        deposit_returned: returnData.deposit_returned || 0,
        final_amount: returnData.final_amount
      });

      console.log('Booking updated for return:', updatedBooking);

      // If this was a local equipment, mark it as available again
      const booking = get().hireBookings.find(b => b.id === bookingId);
      if (booking && booking.equipment_id && booking.equipment_id.startsWith('local-equipment-')) {
        const currentEquipment = JSON.parse(localStorage.getItem('bizzy_equipment') || '[]');
        const updatedEquipment = currentEquipment.map((eq: EquipmentAsset) =>
          eq.id === booking.equipment_id ? { ...eq, is_available: true } : eq
        );
        localStorage.setItem('bizzy_equipment', JSON.stringify(updatedEquipment));

        // Update the store state
        set(state => ({
          equipment: state.equipment.map(equipment =>
            equipment.id === booking.equipment_id ? { ...equipment, is_available: true } : equipment
          )
        }));
      }

      // Update the bookings lists - remove from active, keep in all bookings
      set(state => ({
        hireBookings: state.hireBookings.map(booking =>
          booking.id === bookingId ? updatedBooking : booking
        ),
        activeHireBookings: state.activeHireBookings.filter(booking => booking.id !== bookingId),
        isLoading: false
      }));

      return updatedBooking;
    } catch (error: any) {
      console.error('Failed to process equipment return:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null })
}));
