import { create } from 'zustand';
import { apiClient } from '@/lib/api';
import { Invoice, CreateInvoiceData, UpdateInvoiceStatusData, RecordPaymentData, InvoiceFilters } from '@/types/invoices';

interface InvoiceState {
  invoices: Invoice[];
  currentInvoice: Invoice | null;
  loading: boolean;
  error: string | null;
  filters: InvoiceFilters;

  // Actions
  setFilters: (filters: InvoiceFilters) => void;
  clearFilters: () => void;
  fetchInvoices: (filters?: InvoiceFilters) => Promise<void>;
  fetchInvoice: (id: string) => Promise<void>;
  createInvoice: (data: CreateInvoiceData) => Promise<void>;
  updateInvoiceStatus: (id: string, data: UpdateInvoiceStatusData) => Promise<void>;
  recordPayment: (id: string, data: RecordPaymentData) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  clearError: () => void;
  clearCurrentInvoice: () => void;
}

export const useInvoiceStore = create<InvoiceState>((set, get) => ({
  invoices: [],
  currentInvoice: null,
  loading: false,
  error: null,
  filters: {},

  setFilters: (filters) => {
    set({ filters: { ...get().filters, ...filters } });
  },

  clearFilters: () => {
    set({ filters: {} });
  },

  fetchInvoices: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value.toString());
      });

      const endpoint = queryParams.toString()
        ? `/invoices?${queryParams.toString()}`
        : '/invoices';

      const invoices = await apiClient.get<Invoice[]>(endpoint);
      set({ invoices, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  fetchInvoice: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const invoice = await apiClient.get<Invoice>(`/invoices/${id}`);
      set({ currentInvoice: invoice, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  createInvoice: async (data: CreateInvoiceData) => {
    set({ loading: true, error: null });
    try {
      const result = await apiClient.post<Invoice>('/invoices', data);
      set(state => ({
        invoices: [result, ...state.invoices],
        loading: false
      }));
      return result;
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  updateInvoiceStatus: async (id: string, data: UpdateInvoiceStatusData) => {
    set({ loading: true, error: null });
    try {
      const result = await apiClient.patch<Invoice>(`/invoices/${id}/status`, data);
      set(state => ({
        invoices: state.invoices.map(inv =>
          inv.id === id ? result : inv
        ),
        currentInvoice: state.currentInvoice?.id === id ? result : state.currentInvoice,
        loading: false
      }));
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  recordPayment: async (id: string, data: RecordPaymentData) => {
    set({ loading: true, error: null });
    try {
      // FIXED: Changed from PATCH to POST and using correct field name 'amount'
      const result = await apiClient.post<Invoice>(`/invoices/${id}/payment`, data);
      set(state => ({
        invoices: state.invoices.map(inv =>
          inv.id === id ? result : inv
        ),
        currentInvoice: state.currentInvoice?.id === id ? result : state.currentInvoice,
        loading: false
      }));
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  deleteInvoice: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await apiClient.delete(`/invoices/${id}`);
      set(state => ({
        invoices: state.invoices.filter(inv => inv.id !== id),
        currentInvoice: state.currentInvoice?.id === id ? null : state.currentInvoice,
        loading: false
      }));
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
  clearCurrentInvoice: () => set({ currentInvoice: null }),
}));
