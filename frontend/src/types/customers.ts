export interface Customer {
  id: string;
  business_id: string;
  category_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  tax_number: string | null;
  address: any | null;
  notes: string | null;
  total_spent: string;
  last_visit: string | null;
  is_active: boolean;
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
  category_name?: string;
  category_color?: string;
}

export interface CustomerCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  discount_percentage: string;
  is_active: boolean;
  created_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
}

export interface CustomerCommunication {
  id: string;
  business_id: string;
  customer_id: string;
  type: 'email' | 'sms' | 'phone' | 'in_person' | 'note';
  direction: 'incoming' | 'outgoing';
  subject: string | null;
  content: string;
  status: 'draft' | 'sent' | 'delivered' | 'read' | 'failed';
  related_job_id: string | null;
  related_invoice_id: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
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
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
}

export interface CustomerFilters {
  search?: string;
  category_id?: string;
  is_active?: boolean;
}
