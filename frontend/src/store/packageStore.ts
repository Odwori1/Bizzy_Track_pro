import { create } from 'zustand';
import { Package, PackageFormData, ValidationResult, PackageDeconstructionRule } from '@/types/packages';
import { Service } from '@/types/services';
import { apiClient } from '@/lib/api';

interface PackageState {
  // State
  packages: Package[];
  currentPackage: Package | null;
  availableServices: Service[];
  loading: boolean;
  error: string | null;
  validationResult: ValidationResult | null;

  // Actions
  actions: {
    fetchPackages: () => Promise<void>;
    fetchPackageById: (id: string) => Promise<void>;
    fetchAvailableServices: () => Promise<void>;
    createPackage: (data: PackageFormData) => Promise<Package>;
    updatePackage: (id: string, data: Partial<PackageFormData>) => Promise<Package>;
    deletePackage: (id: string) => Promise<void>;
    validateDeconstruction: (
      packageId: string,
      selectedServices: Array<{ service_id: string; quantity: number }>
    ) => Promise<ValidationResult>;
    updateDeconstructionRules: (
      packageId: string,
      rules: Omit<PackageDeconstructionRule, 'id' | 'package_id' | 'created_at' | 'updated_at'>[]
    ) => Promise<PackageDeconstructionRule[]>;
    clearError: () => void;
    setCurrentPackage: (pkg: Package | null) => void;
    setValidationResult: (result: ValidationResult | null) => void;
  };
}

export const usePackageStore = create<PackageState>()((set, get) => ({
  // Initial state
  packages: [],
  currentPackage: null,
  availableServices: [],
  loading: false,
  error: null,
  validationResult: null,

  // Actions
  actions: {
    fetchPackages: async () => {
      set({ loading: true, error: null });
      try {
        const packages = await apiClient.get<Package[]>('/packages');
        set({ packages, loading: false });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch packages'
        });
      }
    },

    fetchPackageById: async (id: string) => {
      if (id === 'new' || id === 'edit') {
        set({ currentPackage: null, loading: false });
        return;
      }

      set({ loading: true, error: null });
      try {
        const packageData = await apiClient.get<Package>(`/packages/${id}`);
        
        // Log the package data to see service structure
        console.log('Package data received:', packageData);
        
        set({ currentPackage: packageData, loading: false });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch package'
        });
      }
    },

    fetchAvailableServices: async () => {
      set({ loading: true, error: null });
      try {
        const services = await apiClient.get<Service[]>('/services');
        set({ availableServices: services, loading: false });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch services'
        });
      }
    },

    createPackage: async (data: PackageFormData) => {
      set({ loading: true, error: null });
      try {
        const newPackage = await apiClient.post<Package>('/packages', data);
        set(state => ({
          packages: [...state.packages, newPackage],
          loading: false
        }));
        return newPackage;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to create package'
        });
        throw error;
      }
    },

    updatePackage: async (id: string, data: Partial<PackageFormData>) => {
      set({ loading: true, error: null });
      try {
        const updatedPackage = await apiClient.put<Package>(`/packages/${id}`, data);
        set(state => ({
          packages: state.packages.map(pkg =>
            pkg.id === id ? updatedPackage : pkg
          ),
          currentPackage: state.currentPackage?.id === id ? updatedPackage : state.currentPackage,
          loading: false
        }));
        return updatedPackage;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to update package'
        });
        throw error;
      }
    },

    deletePackage: async (id: string) => {
      set({ loading: true, error: null });
      try {
        await apiClient.delete(`/packages/${id}`);
        set(state => ({
          packages: state.packages.filter(pkg => pkg.id !== id),
          currentPackage: state.currentPackage?.id === id ? null : state.currentPackage,
          loading: false
        }));
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to delete package'
        });
        throw error;
      }
    },

    validateDeconstruction: async (
      packageId: string,
      selectedServices: Array<{ service_id: string; quantity: number }>
    ) => {
      set({ loading: true, error: null });
      try {
        const validationResult = await apiClient.post<ValidationResult>(
          `/packages/${packageId}/validate-deconstruction`,
          { selected_services: selectedServices }
        );
        set({ validationResult, loading: false });
        return validationResult;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to validate deconstruction'
        });
        throw error;
      }
    },

    updateDeconstructionRules: async (
      packageId: string,
      rules: Omit<PackageDeconstructionRule, 'id' | 'package_id' | 'created_at' | 'updated_at'>[]
    ) => {
      set({ loading: true, error: null });
      try {
        const updatedRules = await apiClient.put<PackageDeconstructionRule[]>(
          `/packages/${packageId}/deconstruction-rules`,
          { rules }
        );

        set(state => ({
          packages: state.packages.map(pkg =>
            pkg.id === packageId ? { ...pkg, deconstruction_rules: updatedRules } : pkg
          ),
          currentPackage: state.currentPackage?.id === packageId
            ? { ...state.currentPackage, deconstruction_rules: updatedRules }
            : state.currentPackage,
          loading: false
        }));

        return updatedRules;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to update deconstruction rules'
        });
        throw error;
      }
    },

    clearError: () => {
      set({ error: null });
    },

    setCurrentPackage: (currentPackage: Package | null) => {
      set({ currentPackage });
    },

    setValidationResult: (validationResult: ValidationResult | null) => {
      set({ validationResult });
    },
  },
}));
