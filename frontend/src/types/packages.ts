// Simplified package types to avoid Turbopack font issues
export interface PackageService {
  id: string;
  service_id: string;
  is_required: boolean;
  default_quantity: number;
  package_price: number;
  is_price_overridden: boolean;
  service_dependencies: string[];
  timing_constraints: Record<string, any>;
  resource_requirements: Record<string, any>;
  substitution_rules: Record<string, any>;
}

export interface PackageDeconstructionRule {
  id: string;
  package_id: string;
  rule_type: string;
  rule_conditions: Record<string, any>;
  rule_actions: Record<string, any>;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Package {
  id: string;
  business_id: string;
  name: string;
  description: string;
  base_price: number;
  duration_minutes: number;
  category: string;
  is_customizable: boolean;
  min_services: number;
  max_services: number;
  services: PackageService[];
  deconstruction_rules: PackageDeconstructionRule[];
  created_at: string;
  updated_at: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  totalPrice: number;
  totalDuration: number;
}

export interface PackageFormData {
  name: string;
  description: string;
  base_price: number;
  duration_minutes: number;
  category: string;
  is_customizable: boolean;
  min_services: number;
  max_services: number;
  services: Omit<PackageService, 'id'>[];
}
