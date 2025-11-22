import { useState } from 'react';
import { PackageFormData, PackageService } from '@/types/packages';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Checkbox } from '@/components/ui/Checkbox';
import { Plus, Trash2 } from 'lucide-react';

interface PackageFormProps {
  onSubmit: (data: PackageFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  initialData?: Partial<PackageFormData>;
}

export function PackageForm({ onSubmit, onCancel, isLoading = false, initialData }: PackageFormProps) {
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

  const [newService, setNewService] = useState<Omit<PackageService, 'id'>>({
    service_id: '',
    is_required: false,
    default_quantity: 1,
    package_price: 0,
    is_price_overridden: false,
    service_dependencies: [],
    timing_constraints: {},
    resource_requirements: {},
    substitution_rules: { allowed_substitutes: [] },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const addService = () => {
    if (newService.service_id) {
      setFormData(prev => ({
        ...prev,
        services: [...prev.services, { ...newService }]
      }));
      setNewService({
        service_id: '',
        is_required: false,
        default_quantity: 1,
        package_price: 0,
        is_price_overridden: false,
        service_dependencies: [],
        timing_constraints: {},
        resource_requirements: {},
        substitution_rules: { allowed_substitutes: [] },
      });
    }
  };

  const removeService = (index: number) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index)
    }));
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
              <label className="block text-sm font-medium mb-1">Package Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Base Price ($)</label>
              <Input
                type="number"
                step="0.01"
                value={formData.base_price}
                onChange={(e) => setFormData(prev => ({ ...prev, base_price: parseFloat(e.target.value) }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
              <Input
                type="number"
                value={formData.duration_minutes}
                onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) }))}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_customizable"
                checked={formData.is_customizable}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, is_customizable: checked as boolean }))
                }
              />
              <label htmlFor="is_customizable" className="text-sm font-medium">
                Customizable Package
              </label>
            </div>
          </div>

          {formData.is_customizable && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Minimum Services</label>
                <Input
                  type="number"
                  value={formData.min_services}
                  onChange={(e) => setFormData(prev => ({ ...prev, min_services: parseInt(e.target.value) }))}
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Maximum Services</label>
                <Input
                  type="number"
                  value={formData.max_services}
                  onChange={(e) => setFormData(prev => ({ ...prev, max_services: parseInt(e.target.value) }))}
                  min={formData.min_services}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Services Management */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">Package Services</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Service Form */}
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-medium">Add Service to Package</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                placeholder="Service ID"
                value={newService.service_id}
                onChange={(e) => setNewService(prev => ({ ...prev, service_id: e.target.value }))}
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_required"
                  checked={newService.is_required}
                  onCheckedChange={(checked) => 
                    setNewService(prev => ({ ...prev, is_required: checked as boolean }))
                  }
                />
                <label htmlFor="is_required" className="text-sm">Required</label>
              </div>
            </div>
            <Button type="button" onClick={addService} className="flex items-center gap-2">
              <Plus size={16} />
              Add Service
            </Button>
          </div>

          {/* Services List */}
          <div className="space-y-3">
            {formData.services.map((service, index) => (
              <div key={index} className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <span className="font-medium">{service.service_id}</span>
                  {service.is_required && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      Required
                    </span>
                  )}
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
            ))}

            {formData.services.length === 0 && (
              <p className="text-center text-gray-500 py-4">
                No services added yet. Add services to create your package.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Create Package'}
        </Button>
      </div>
    </form>
  );
}
