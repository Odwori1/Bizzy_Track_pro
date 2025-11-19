export interface InvoiceLineItem {
  id?: string;
  service_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tax_rate: number;
  tax_amount: number;
  service_name?: string;
}

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
  subtotal: string;
  tax_amount: string;
  tax_rate: string;
  discount_amount: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  payment_method?: string;
  payment_date?: string;
  notes?: string;
  terms?: string;
  created_by: string;
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
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  customer_phone: string;
  customer_company?: string;
  job_number?: string;
  job_title?: string;
  line_items: InvoiceLineItem[];
  display_amounts: {
    subtotal: string;
    tax_amount: string;
    discount_amount: string;
    total_amount: string;
    amount_paid: string;
    balance_due: string;
  };
  currency: string;
  currency_symbol: string;
}

export interface CreateInvoiceData {
  job_id?: string;
  customer_id: string;
  due_date: string;
  notes?: string;
  terms?: string;
  line_items: Omit<InvoiceLineItem, 'id' | 'total_price' | 'tax_amount' | 'service_name'>[];
}

export interface UpdateInvoiceStatusData {
  status: Invoice['status'];
}

export interface RecordPaymentData {
  amount_paid: number;
  payment_method: string;
}

export interface InvoiceFilters {
  status?: string;
  customer_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}
