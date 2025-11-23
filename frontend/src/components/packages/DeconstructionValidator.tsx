import { useState, useEffect } from 'react';
import { Package, PackageService } from '@/types/packages';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Shield, Clock, Users, AlertTriangle } from 'lucide-react';
import { useBusinessCurrency } from '@/hooks/useBusinessCurrency'; // ADDED IMPORT

interface DeconstructionValidatorProps {
  package: Package;
  selectedServices: Array<{service_id: string; quantity: number}>;
  onSelectionChange: (selection: Array<{service_id: string; quantity: number}>) => void;
}

export function DeconstructionValidator({
  package: pkg,
  selectedServices,
  onSelectionChange
}: DeconstructionValidatorProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const { formatCurrency } = useBusinessCurrency(); // ADDED HOOK

  // Safely handle services array
  const services = pkg.services || [];

  // Helper function to get service display name
  const getServiceDisplayName = (service: any) => {
    return service.service_name || service.service_id;
  };

  useEffect(() => {
    // Initialize quantities
    const initialQuantities: Record<string, number> = {};
    services.forEach(service => {
      initialQuantities[service.service_id] = service.default_quantity || 1;
    });
    setQuantities(initialQuantities);
  }, [services]);

  const handleServiceToggle = (serviceId: string, isRequired: boolean) => {
    const isSelected = selectedServices.some(s => s.service_id === serviceId);

    if (isSelected) {
      // Remove service
      onSelectionChange(selectedServices.filter(s => s.service_id !== serviceId));
    } else {
      // Add service
      onSelectionChange([
        ...selectedServices,
        { service_id: serviceId, quantity: quantities[serviceId] || 1 }
      ]);
    }
  };

  const handleQuantityChange = (serviceId: string, quantity: number) => {
    setQuantities(prev => ({ ...prev, [serviceId]: quantity }));

    // Update selected services
    const updatedSelection = selectedServices.map(service =>
      service.service_id === serviceId
        ? { ...service, quantity }
        : service
    );
    onSelectionChange(updatedSelection);
  };

  const isServiceSelected = (serviceId: string) => {
    return selectedServices.some(s => s.service_id === serviceId);
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold">Customize Package Services</h3>
        <p className="text-sm text-gray-600">
          Select services for your customized package. Required services are pre-selected.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {services.map((service, index) => {
          const isSelected = isServiceSelected(service.service_id);
          const isRequired = service.is_required;

          return (
            <div
              key={service.service_id || index}
              className={`border rounded-lg p-4 ${
                isSelected ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <Checkbox
                    checked={isSelected || isRequired}
                    onChange={(e) => {
                      if (!isRequired) {
                        handleServiceToggle(service.service_id, isRequired);
                      }
                    }}
                    disabled={isRequired}
                  />

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{getServiceDisplayName(service)}</span>
                      {isRequired && (
                        <Badge variant="secondary" className="text-xs">
                          Required
                        </Badge>
                      )}
                      {service.is_price_overridden && (
                        <Badge variant="outline" className="text-xs">
                          Custom Price: {formatCurrency(service.package_price)} {/* FIXED: Dynamic currency */}
                        </Badge>
                      )}
                    </div>

                    {/* Constraints Display */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {service.timing_constraints?.min_duration_before_next && (
                        <div className="flex items-center gap-1 text-xs text-blue-600">
                          <Clock size={12} />
                          <span>+{service.timing_constraints.min_duration_before_next}min</span>
                        </div>
                      )}

                      {service.resource_requirements?.therapist_level && (
                        <div className="flex items-center gap-1 text-xs text-purple-600">
                          <Users size={12} />
                          <span>{service.resource_requirements.therapist_level}</span>
                        </div>
                      )}

                      {service.service_dependencies && service.service_dependencies.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-orange-600">
                          <Shield size={12} />
                          <span>Dependencies</span>
                        </div>
                      )}
                    </div>

                    {/* Warnings */}
                    {isRequired && !isSelected && (
                      <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                        <AlertTriangle size={12} />
                        <span>This service is required</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quantity Selector */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Qty:</label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={quantities[service.service_id] || 1}
                    onChange={(e) => handleQuantityChange(service.service_id, parseInt(e.target.value) || 1)}
                    className="w-16"
                    disabled={!isSelected && !isRequired}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* Selection Summary */}
        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <div className="flex justify-between">
            <span>Selected Services:</span>
            <span className="font-medium">
              {selectedServices.length} of {services.length}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Required Services:</span>
            <span className="font-medium">
              {services.filter(s => s.is_required).length}
            </span>
          </div>
        </div>

        {services.length === 0 && (
          <div className="text-center text-gray-500 py-4">
            No services available in this package
          </div>
        )}
      </CardContent>
    </Card>
  );
}
