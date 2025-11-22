import { create } from 'zustand';
import { Customer, CustomerCategory, CustomerCommunication, CustomerFilters } from '@/types/customers';
import { apiClient } from '@/lib/api';

interface CustomerState {
  // State
  customers: Customer[];
  customerCategories: CustomerCategory[];
  customerCommunications: CustomerCommunication[];
  selectedCustomer: Customer | null;
  selectedCustomerCategory: CustomerCategory | null;
  loading: boolean;
  error: string | null;
  filters: CustomerFilters;

  // Actions
  actions: {
    fetchCustomers: (filters?: CustomerFilters) => Promise<void>;
    fetchCustomerCategories: () => Promise<void>;
    fetchCustomerCommunications: (customerId?: string) => Promise<void>;
    fetchCustomer: (id: string) => Promise<void>;
    fetchCustomerCategory: (id: string) => Promise<void>;
    createCustomer: (customerData: any) => Promise<Customer>;
    updateCustomer: (id: string, customerData: any) => Promise<Customer>;
    deleteCustomer: (id: string) => Promise<void>;
    createCustomerCategory: (categoryData: any) => Promise<CustomerCategory>;
    updateCustomerCategory: (id: string, categoryData: any) => Promise<CustomerCategory>;
    deleteCustomerCategory: (id: string) => Promise<void>;
    createCustomerCommunication: (communicationData: any) => Promise<CustomerCommunication>;
    updateCustomerCommunication: (id: string, communicationData: any) => Promise<CustomerCommunication>;
    deleteCustomerCommunication: (id: string) => Promise<void>;
    setFilters: (filters: CustomerFilters) => void;
    clearError: () => void;
  };
}

export const useCustomerStore = create<CustomerState>()((set, get) => ({
  // Initial state
  customers: [],
  customerCategories: [],
  customerCommunications: [],
  selectedCustomer: null,
  selectedCustomerCategory: null,
  loading: false,
  error: null,
  filters: {},

  // Actions
  actions: {
    fetchCustomers: async (filters = {}) => {
      set({ loading: true, error: null });
      try {
        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, value.toString());
          }
        });

        const endpoint = queryParams.toString() 
          ? `/customers?${queryParams.toString()}`
          : '/customers';

        const customers = await apiClient.get<Customer[]>(endpoint);
        set({ customers, loading: false, filters });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch customers'
        });
      }
    },

    fetchCustomerCategories: async () => {
      set({ loading: true, error: null });
      try {
        const customerCategories = await apiClient.get<CustomerCategory[]>('/customer-categories');
        set({ customerCategories, loading: false });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch customer categories'
        });
      }
    },

    fetchCustomerCommunications: async (customerId?: string) => {
      set({ loading: true, error: null });
      try {
        let communications: CustomerCommunication[];
        if (customerId) {
          communications = await apiClient.get<CustomerCommunication[]>(`/customer-communications/customer/${customerId}`);
        } else {
          communications = await apiClient.get<CustomerCommunication[]>('/customer-communications');
        }
        set({ customerCommunications: communications, loading: false });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch customer communications'
        });
      }
    },

    fetchCustomer: async (id: string) => {
      set({ loading: true, error: null });
      try {
        const customer = await apiClient.get<Customer>(`/customers/${id}`);
        set({ selectedCustomer: customer, loading: false });
        return customer;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch customer'
        });
        throw error;
      }
    },

    fetchCustomerCategory: async (id: string) => {
      set({ loading: true, error: null });
      try {
        const category = await apiClient.get<CustomerCategory>(`/customer-categories/${id}`);
        set({ selectedCustomerCategory: category, loading: false });
        return category;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch customer category'
        });
        throw error;
      }
    },

    createCustomer: async (customerData: any) => {
      set({ loading: true, error: null });
      try {
        const newCustomer = await apiClient.post<Customer>('/customers', customerData);
        set(state => ({
          customers: [...state.customers, newCustomer],
          loading: false
        }));
        return newCustomer;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to create customer'
        });
        throw error;
      }
    },

    updateCustomer: async (id: string, customerData: any) => {
      set({ loading: true, error: null });
      try {
        const updatedCustomer = await apiClient.put<Customer>(`/customers/${id}`, customerData);
        set(state => ({
          customers: state.customers.map(customer => 
            customer.id === id ? updatedCustomer : customer
          ),
          selectedCustomer: state.selectedCustomer?.id === id ? updatedCustomer : state.selectedCustomer,
          loading: false
        }));
        return updatedCustomer;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to update customer'
        });
        throw error;
      }
    },

    deleteCustomer: async (id: string) => {
      set({ loading: true, error: null });
      try {
        await apiClient.delete(`/customers/${id}`);
        set(state => ({
          customers: state.customers.filter(customer => customer.id !== id),
          selectedCustomer: state.selectedCustomer?.id === id ? null : state.selectedCustomer,
          loading: false
        }));
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to delete customer'
        });
        throw error;
      }
    },

    createCustomerCategory: async (categoryData: any) => {
      set({ loading: true, error: null });
      try {
        const newCategory = await apiClient.post<CustomerCategory>('/customer-categories', categoryData);
        set(state => ({
          customerCategories: [...state.customerCategories, newCategory],
          loading: false
        }));
        return newCategory;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to create customer category'
        });
        throw error;
      }
    },

    updateCustomerCategory: async (id: string, categoryData: any) => {
      set({ loading: true, error: null });
      try {
        const updatedCategory = await apiClient.put<CustomerCategory>(`/customer-categories/${id}`, categoryData);
        set(state => ({
          customerCategories: state.customerCategories.map(category => 
            category.id === id ? updatedCategory : category
          ),
          selectedCustomerCategory: state.selectedCustomerCategory?.id === id ? updatedCategory : state.selectedCustomerCategory,
          loading: false
        }));
        return updatedCategory;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to update customer category'
        });
        throw error;
      }
    },

    deleteCustomerCategory: async (id: string) => {
      set({ loading: true, error: null });
      try {
        await apiClient.delete(`/customer-categories/${id}`);
        set(state => ({
          customerCategories: state.customerCategories.filter(category => category.id !== id),
          selectedCustomerCategory: state.selectedCustomerCategory?.id === id ? null : state.selectedCustomerCategory,
          loading: false
        }));
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to delete customer category'
        });
        throw error;
      }
    },

    createCustomerCommunication: async (communicationData: any) => {
      set({ loading: true, error: null });
      try {
        const newCommunication = await apiClient.post<CustomerCommunication>('/customer-communications', communicationData);
        set(state => ({
          customerCommunications: [...state.customerCommunications, newCommunication],
          loading: false
        }));
        return newCommunication;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to create customer communication'
        });
        throw error;
      }
    },

    updateCustomerCommunication: async (id: string, communicationData: any) => {
      set({ loading: true, error: null });
      try {
        const updatedCommunication = await apiClient.put<CustomerCommunication>(`/customer-communications/${id}`, communicationData);
        set(state => ({
          customerCommunications: state.customerCommunications.map(comm => 
            comm.id === id ? updatedCommunication : comm
          ),
          loading: false
        }));
        return updatedCommunication;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to update customer communication'
        });
        throw error;
      }
    },

    deleteCustomerCommunication: async (id: string) => {
      set({ loading: true, error: null });
      try {
        await apiClient.delete(`/customer-communications/${id}`);
        set(state => ({
          customerCommunications: state.customerCommunications.filter(comm => comm.id !== id),
          loading: false
        }));
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to delete customer communication'
        });
        throw error;
      }
    },

    setFilters: (filters: CustomerFilters) => {
      set({ filters });
    },

    clearError: () => {
      set({ error: null });
    },
  },
}));
