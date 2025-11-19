export interface Invoice {
  id: string;
  business_id: string;
  invoice_number: string;
  invoice_date: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  due_date: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  job_id?: string;
  customer_id: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  total_amount: string;
  amount_paid: string;
  balance_due: string;
  currency: string;
  currency_symbol: string;
  notes?: string;
  terms?: string;
  created_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  updated_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  line_items: InvoiceLineItem[];
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  service_id?: string;
  service_name?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  created_at: string;
  updated_at: string;
}

export interface CreateInvoiceData {
  job_id?: string;
  customer_id: string;
  due_date: string;
  notes?: string;
  terms?: string;
  line_items: Omit<InvoiceLineItem, 'id' | 'invoice_id' | 'created_at' | 'updated_at'>[];
}

export interface UpdateInvoiceStatusData {
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
}

// FIXED: Changed from amount_paid to amount to match backend validation
export interface RecordPaymentData {
  amount: number;
  payment_method: string;
}

export interface InvoiceFilters {
  status?: string;
  search?: string;
  customer_id?: string;
  date_from?: string;
  date_to?: string;
}
