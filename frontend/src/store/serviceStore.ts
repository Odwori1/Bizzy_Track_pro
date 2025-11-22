import { create } from 'zustand';
import { Service, ServiceCategory, ServiceFilters } from '@/types/services';
import { apiClient } from '@/lib/api';

interface ServiceState {
  // State
  services: Service[];
  serviceCategories: ServiceCategory[];
  selectedService: Service | null;
  selectedServiceCategory: ServiceCategory | null;
  loading: boolean;
  error: string | null;
  filters: ServiceFilters;

  // Actions
  actions: {
    fetchServices: (filters?: ServiceFilters) => Promise<void>;
    fetchServiceCategories: () => Promise<void>;
    fetchService: (id: string) => Promise<void>;
    fetchServiceCategory: (id: string) => Promise<void>;
    createService: (serviceData: any) => Promise<Service>;
    updateService: (id: string, serviceData: any) => Promise<Service>;
    deleteService: (id: string) => Promise<void>;
    createServiceCategory: (categoryData: any) => Promise<ServiceCategory>;
    updateServiceCategory: (id: string, categoryData: any) => Promise<ServiceCategory>;
    deleteServiceCategory: (id: string) => Promise<void>;
    setFilters: (filters: ServiceFilters) => void;
    clearError: () => void;
  };
}

export const useServiceStore = create<ServiceState>()((set, get) => ({
  // Initial state
  services: [],
  serviceCategories: [],
  selectedService: null,
  selectedServiceCategory: null,
  loading: false,
  error: null,
  filters: {},

  // Actions
  actions: {
    fetchServices: async (filters = {}) => {
      set({ loading: true, error: null });
      try {
        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, value.toString());
          }
        });

        const endpoint = queryParams.toString() 
          ? `/services?${queryParams.toString()}`
          : '/services';

        const services = await apiClient.get<Service[]>(endpoint);
        set({ services, loading: false, filters });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch services'
        });
      }
    },

    fetchServiceCategories: async () => {
      set({ loading: true, error: null });
      try {
        const serviceCategories = await apiClient.get<ServiceCategory[]>('/service-categories');
        set({ serviceCategories, loading: false });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch service categories'
        });
      }
    },

    fetchService: async (id: string) => {
      set({ loading: true, error: null });
      try {
        const service = await apiClient.get<Service>(`/services/${id}`);
        set({ selectedService: service, loading: false });
        return service;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch service'
        });
        throw error;
      }
    },

    fetchServiceCategory: async (id: string) => {
      set({ loading: true, error: null });
      try {
        const category = await apiClient.get<ServiceCategory>(`/service-categories/${id}`);
        set({ selectedServiceCategory: category, loading: false });
        return category;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch service category'
        });
        throw error;
      }
    },

    createService: async (serviceData: any) => {
      set({ loading: true, error: null });
      try {
        const newService = await apiClient.post<Service>('/services', serviceData);
        set(state => ({
          services: [...state.services, newService],
          loading: false
        }));
        return newService;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to create service'
        });
        throw error;
      }
    },

    updateService: async (id: string, serviceData: any) => {
      set({ loading: true, error: null });
      try {
        const updatedService = await apiClient.put<Service>(`/services/${id}`, serviceData);
        set(state => ({
          services: state.services.map(service => 
            service.id === id ? updatedService : service
          ),
          selectedService: state.selectedService?.id === id ? updatedService : state.selectedService,
          loading: false
        }));
        return updatedService;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to update service'
        });
        throw error;
      }
    },

    deleteService: async (id: string) => {
      set({ loading: true, error: null });
      try {
        await apiClient.delete(`/services/${id}`);
        set(state => ({
          services: state.services.filter(service => service.id !== id),
          selectedService: state.selectedService?.id === id ? null : state.selectedService,
          loading: false
        }));
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to delete service'
        });
        throw error;
      }
    },

    createServiceCategory: async (categoryData: any) => {
      set({ loading: true, error: null });
      try {
        const newCategory = await apiClient.post<ServiceCategory>('/service-categories', categoryData);
        set(state => ({
          serviceCategories: [...state.serviceCategories, newCategory],
          loading: false
        }));
        return newCategory;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to create service category'
        });
        throw error;
      }
    },

    updateServiceCategory: async (id: string, categoryData: any) => {
      set({ loading: true, error: null });
      try {
        const updatedCategory = await apiClient.put<ServiceCategory>(`/service-categories/${id}`, categoryData);
        set(state => ({
          serviceCategories: state.serviceCategories.map(category => 
            category.id === id ? updatedCategory : category
          ),
          selectedServiceCategory: state.selectedServiceCategory?.id === id ? updatedCategory : state.selectedServiceCategory,
          loading: false
        }));
        return updatedCategory;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to update service category'
        });
        throw error;
      }
    },

    deleteServiceCategory: async (id: string) => {
      set({ loading: true, error: null });
      try {
        await apiClient.delete(`/service-categories/${id}`);
        set(state => ({
          serviceCategories: state.serviceCategories.filter(category => category.id !== id),
          selectedServiceCategory: state.selectedServiceCategory?.id === id ? null : state.selectedServiceCategory,
          loading: false
        }));
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to delete service category'
        });
        throw error;
      }
    },

    setFilters: (filters: ServiceFilters) => {
      set({ filters });
    },

    clearError: () => {
      set({ error: null });
    },
  },
}));
