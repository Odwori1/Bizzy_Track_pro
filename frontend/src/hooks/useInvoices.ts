import { useInvoiceStore } from '@/store/invoiceStore';

// Re-export everything from the store with the hook interface
export const useInvoices = () => {
  const {
    invoices,
    currentInvoice,
    loading,
    error,
    filters,
    setFilters,
    clearFilters,
    fetchInvoices,
    fetchInvoice,
    createInvoice,
    updateInvoiceStatus,
    recordPayment,
    deleteInvoice,
    clearError,
    clearCurrentInvoice,
  } = useInvoiceStore();

  return {
    invoices,
    currentInvoice,
    loading,
    error,
    filters,
    setFilters,
    clearFilters,
    fetchInvoices,
    fetchInvoice,
    createInvoice,
    updateInvoiceStatus,
    recordPayment,
    deleteInvoice,
    clearError,
    clearCurrentInvoice,
  };
};
