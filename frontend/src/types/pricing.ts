// Remove the DateTimeObject interface and use simpler types
// Pricing rule types
export interface PricingRule {
  id: string;
  business_id: string;
  name: string;
  description?: string;
  rule_type: 'customer_category' | 'quantity' | 'time_based';
  conditions: Record<string, any>;
  adjustment_type: 'percentage' | 'fixed' | 'override';
  adjustment_value: string;
  target_entity: 'service' | 'package' | 'customer';
  target_id?: string;
  priority: number;
  is_active: boolean;
  valid_from?: string;
  valid_until?: string;
  created_by: string;
  created_at: string; // Simplified from DateTimeObject
  updated_at: string; // Simplified from DateTimeObject
}

// Seasonal pricing types
export interface SeasonalPricing {
  id: string;
  business_id: string;
  name: string;
  description?: string;
  start_date: string; // Simplified from DateTimeObject
  end_date: string;   // Simplified from DateTimeObject
  adjustment_type: 'percentage' | 'fixed' | 'override';
  adjustment_value: string;
  target_type: 'all_services' | 'category' | 'specific_service' | 'customer_segment';
  target_id?: string;
  target_name?: string;
  is_active: boolean;
  priority: number;
  created_by: string;
  created_at: string; // Simplified from DateTimeObject
  updated_at: string; // Simplified from DateTimeObject
}

// Price history types
export interface PriceHistory {
  id: string;
  business_id: string;
  entity_type: 'service' | 'package';
  entity_id: string;
  entity_name: string;
  old_price?: string;
  new_price: string;
  change_type: 'manual' | 'bulk_update' | 'seasonal' | 'pricing_rule' | 'initial';
  change_reason?: string;
  effective_from: string;
  change_source?: string;
  pricing_rule_id?: string;
  seasonal_pricing_id?: string;
  bulk_update_batch?: string;
  changed_by?: string;
  created_at: string; // Simplified from DateTimeObject
}

// Evaluation types
export interface PricingEvaluation {
  original_price: number;
  final_price: number;
  total_discount?: number;
  applied_rules: AppliedRule[];
  adjustments?: Adjustment[];
  abac_context?: ABACContext;
  summary?: EvaluationSummary;
}

export interface AppliedRule {
  rule_id: string;
  rule_name: string;
  rule_type: string;
  adjustment_type: string;
  adjustment_value: string;
  new_price: number;
}

export interface Adjustment {
  type: string;
  rule_name: string;
  adjustment_type: string;
  value: string;
  amount: number;
}

export interface ABACContext {
  can_override: boolean;
  user_restrictions: boolean;
  user_discount_limit: number;
  abac_failed: boolean;
}

export interface EvaluationSummary {
  total_discount: number;
  total_discount_percentage: number;
  requires_approval: boolean;
}

// Bulk operations
export interface BulkUpdatePreview {
  services: Array<{
    service_id: string;
    service_name: string;
    old_price: number;
    new_price: number;
    price_change: number;
    change_percentage: number;
  }>;
  packages: Array<{
    package_id: string;
    package_name: string;
    old_price: number;
    new_price: number;
    price_change: number;
    change_percentage: number;
  }>;
  summary: {
    total_affected: number;
    total_price_change: number;
    average_change_percentage: number;
  };
}
