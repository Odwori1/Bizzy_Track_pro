import { Package } from '@/types/packages';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DollarSign, Clock, Settings, Users } from 'lucide-react';

interface PackageDetailsProps {
  package: Package;
}

export function PackageDetails({ package: pkg }: PackageDetailsProps) {
  // Safely handle all possible undefined values
  const services = pkg.services || [];
  const rules = pkg.deconstruction_rules || [];

  return (
    <div className="space-y-6">
      {/* Package Summary */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Package Summary</h2>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center gap-3">
            <DollarSign className="text-green-600" size={20} />
            <div>
              <p className="text-sm text-gray-600">Base Price</p>
              <p className="font-semibold">${pkg.base_price}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="text-blue-600" size={20} />
            <div>
              <p className="text-sm text-gray-600">Duration</p>
              <p className="font-semibold">{pkg.duration_minutes} min</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Settings className="text-purple-600" size={20} />
            <div>
              <p className="text-sm text-gray-600">Services</p>
              <p className="font-semibold">{services.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Users className="text-orange-600" size={20} />
            <div>
              <p className="text-sm text-gray-600">Rules</p>
              <p className="font-semibold">{rules.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customization Settings */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Customization Settings</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-gray-600">Customizable</label>
              <div className="font-medium">
                <Badge variant={pkg.is_customizable ? "default" : "secondary"}>
                  {pkg.is_customizable ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
            {pkg.is_customizable && (
              <>
                <div>
                  <label className="text-sm text-gray-600">Min Services</label>
                  <div className="font-medium">{pkg.min_services}</div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Max Services</label>
                  <div className="font-medium">{pkg.max_services}</div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Services List */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Package Services</h2>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {services.map((service, index) => (
              <div key={service.service_id || index} className="flex items-center justify-between border rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium">{service.service_id}</p>
                    <div className="flex gap-2 mt-1">
                      {service.is_required && (
                        <Badge variant="secondary" className="text-xs">
                          Required
                        </Badge>
                      )}
                      {service.is_price_overridden && (
                        <Badge variant="outline" className="text-xs">
                          ${service.package_price}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  Qty: {service.default_quantity}
                </div>
              </div>
            ))}
            {services.length === 0 && (
              <p className="text-center text-gray-500 py-4">No services in this package</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
