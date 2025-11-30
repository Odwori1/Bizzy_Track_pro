import { useState, useEffect } from 'react';
import { PackageFormData, PackageService } from '@/types/packages';
import { Service } from '@/types/services';
import { usePackageStore } from '@/store/packageStore';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Checkbox } from '@/components/ui/Checkbox';
import { Plus, Trash2, Search, DollarSign, Clock } from 'lucide-react';
import { useCurrency } from '@/lib/currency'; // ✅ CORRECT IMPORT

interface PackageFormProps {
  onSubmit: (data: PackageFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  initialData?: Partial<PackageFormData>;
}

export function PackageForm({ onSubmit, onCancel, isLoading = false, initialData }: PackageFormProps) {
  const { availableServices, loading: servicesLoading, actions } = usePackageStore();
  const { format } = useCurrency(); // ✅ CORRECT HOOK USAGE

  const [formData, setFormData] = useState<PackageFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    base_price: initialData?.base_price || 0,
    duration_minutes: initialData?.duration_minutes || 60,
    category: initialData?.category || '',
    is_customizable: initialData?.is_customizable || false,
    min_services: initialData?.min_services || 1,
    max_services: initialData?.max_services || 5,
    services: initialData?.services || [],
  });

  const [serviceSearch, setServiceSearch] = useState('');
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  useEffect(() => {
    actions.fetchAvailableServices();
  }, [actions]);

  const filteredServices = availableServices.filter(service =>
    service.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
    service.description?.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const addService = (service: Service) => {
    const existingService = formData.services.find(s => s.service_id === service.id);

    if (!existingService) {
      const newPackageService: Omit<PackageService, 'id'> = {
        service_id: service.id,
        is_required: false,
        default_quantity: 1,
        package_price: service.base_price,
        is_price_overridden: false,
        service_dependencies: [],
        timing_constraints: { min_duration_before_next: 15 },
        resource_requirements: { therapist_level: 'standard' },
        substitution_rules: { allowed_substitutes: [] }
      };

      setFormData(prev => ({
        ...prev,
        services: [...prev.services, newPackageService]
      }));
    }

    setServiceSearch('');
    setShowServiceDropdown(false);
  };

  const removeService = (index: number) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index)
    }));
  };

  const updateService = (index: number, updates: Partial<PackageService>) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.map((service, i) =>
        i === index ? { ...service, ...updates } : service
      )
    }));
  };

  const getServiceInfo = (serviceId: string): Service | undefined => {
    return availableServices.find(s => s.id === serviceId);
  };

  const calculatePackageDuration = () => {
    return formData.services.reduce((total, packageService) => {
      const service = getServiceInfo(packageService.service_id);
      return total + (service?.duration_minutes || 0) * packageService.default_quantity;
    }, 0);
  };

  const calculatePackagePrice = () => {
    return formData.services.reduce((total, packageService) => {
      return total + (packageService.package_price * packageService.default_quantity);
    }, 0);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">Basic Information</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Package Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
                placeholder="e.g., Premium Spa Package"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category *</label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                required
                placeholder="e.g., Spa, Beauty, Wellness"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              placeholder="Describe what this package includes..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Base Price *</label> {/* ✅ CORRECT: No hardcoded currency symbol */}
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.base_price}
                onChange={(e) => setFormData(prev => ({ ...prev, base_price: parseFloat(e.target.value) || 0 }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Duration (minutes) *</label>
              <Input
                type="number"
                min="1"
                value={formData.duration_minutes}
                onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 60 }))}
                required
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="is_customizable"
                checked={formData.is_customizable}
                onChange={(e) =>
                  setFormData(prev => ({ ...prev, is_customizable: e.target.checked }))
                }
              />
              <label htmlFor="is_customizable" className="text-sm font-medium">
                Customizable Package
              </label>
            </div>
          </div>

          {formData.is_customizable && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg">
              <div>
                <label className="block text-sm font-medium mb-1">Minimum Services</label>
                <Input
                  type="number"
                  min="1"
                  max={formData.max_services}
                  value={formData.min_services}
                  onChange={(e) => setFormData(prev => ({ ...prev, min_services: parseInt(e.target.value) || 1 }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Maximum Services</label>
                <Input
                  type="number"
                  min={formData.min_services}
                  value={formData.max_services}
                  onChange={(e) => setFormData(prev => ({ ...prev, max_services: parseInt(e.target.value) || 5 }))}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Services Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Package Services</h3>
            <div className="text-sm text-gray-600">
              {formData.services.length} services • {calculatePackageDuration()} min • {format(calculatePackagePrice())} total {/* ✅ CORRECT: Using format function */}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Service Search */}
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-medium">Add Services from Catalog</h4>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <Input
                placeholder="Search services by name or description..."
                value={serviceSearch}
                onChange={(e) => {
                  setServiceSearch(e.target.value);
                  setShowServiceDropdown(true);
                }}
                onFocus={() => setShowServiceDropdown(true)}
                className="pl-10"
              />
            </div>

            {showServiceDropdown && serviceSearch && (
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {servicesLoading ? (
                  <div className="p-3 text-center text-gray-500">Loading services...</div>
                ) : filteredServices.length > 0 ? (
                  filteredServices.map(service => (
                    <div
                      key={service.id}
                      className="flex justify-between items-center p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                      onClick={() => addService(service)}
                    >
                      <div className="flex-1">
                        <div className="font-medium">{service.name}</div>
                        <div className="text-sm text-gray-600 line-clamp-1">
                          {service.description}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <DollarSign size={12} />
                            <span>{format(service.base_price)}</span> {/* ✅ CORRECT: Using format function */}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock size={12} />
                            <span>{service.duration_minutes} min</span>
                          </div>
                        </div>
                      </div>
                      <Plus size={16} className="text-gray-400" />
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-gray-500">No services found</div>
                )}
              </div>
            )}
          </div>

          {/* Services List */}
          <div className="space-y-3">
            {formData.services.map((packageService, index) => {
              const service = getServiceInfo(packageService.service_id);

              return (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{service?.name || 'Unknown Service'}</div>
                      {service && (
                        <div className="text-sm text-gray-600 mt-1">
                          {service.description}
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <DollarSign size={14} />
                          <span>Base: {format(service?.base_price || 0)}</span> {/* ✅ CORRECT: Using format function */}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock size={14} />
                          <span>Duration: {service?.duration_minutes || 0} min</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => removeService(index)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`required-${index}`}
                        checked={packageService.is_required}
                        onChange={(e) =>
                          updateService(index, { is_required: e.target.checked })
                        }
                      />
                      <label htmlFor={`required-${index}`} className="text-sm">
                        Required
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Package Price</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={packageService.package_price}
                        onChange={(e) => updateService(index, {
                          package_price: parseFloat(e.target.value) || 0,
                          is_price_overridden: true
                        })}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Quantity</label>
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        value={packageService.default_quantity}
                        onChange={(e) => updateService(index, { default_quantity: parseInt(e.target.value) || 1 })}
                        className="w-full"
                      />
                    </div>

                    <div className="flex items-end">
                      <div className="text-sm">
                        <div>Total: {format(packageService.package_price * packageService.default_quantity)}</div> {/* ✅ CORRECT: Using format function */}
                        <div>{((service?.duration_minutes || 0) * packageService.default_quantity)} min</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {formData.services.length === 0 && (
              <div className="text-center text-gray-500 py-8 border-2 border-dashed rounded-lg">
                <p className="mb-2">No services added to this package</p>
                <p className="text-sm">Search and add services from your service catalog above</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Package Summary */}
      {formData.services.length > 0 && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-semibold text-green-800">Package Summary</h4>
                <p className="text-sm text-green-600">
                  {formData.services.length} services • {calculatePackageDuration()} minutes • {format(calculatePackagePrice())} total {/* ✅ CORRECT: Using format function */}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-800">
                  {format(calculatePackagePrice())} {/* ✅ CORRECT: Using format function */}
                </div>
                <div className="text-sm text-green-600">
                  {calculatePackageDuration()} min
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-6 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading || formData.services.length === 0}>
          {isLoading ? 'Saving...' : (initialData ? 'Update Package' : 'Create Package')}
        </Button>
      </div>
    </form>
  );
}
