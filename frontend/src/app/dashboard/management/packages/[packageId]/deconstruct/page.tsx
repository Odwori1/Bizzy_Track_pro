'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePackageStore } from '@/store/packageStore';
import { DeconstructionValidator } from '@/components/packages/DeconstructionValidator';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, CheckCircle, AlertCircle, Calendar } from 'lucide-react';
import Link from 'next/link';
import { useCurrency } from '@/lib/currency'; // ✅ CORRECT IMPORT

export default function DeconstructPackagePage() {
  const params = useParams();
  const router = useRouter();
  const { currentPackage, validationResult, loading, error, actions } = usePackageStore();
  const { format } = useCurrency(); // ✅ CORRECT HOOK USAGE

  const packageId = params.packageId as string;
  const [selectedServices, setSelectedServices] = useState<Array<{service_id: string; quantity: number}>>([]);
  const [serviceDetails, setServiceDetails] = useState<any[]>([]);

  useEffect(() => {
    if (packageId) {
      actions.fetchPackageById(packageId);
    }
  }, [packageId, actions]);

  useEffect(() => {
    if (currentPackage && selectedServices.length > 0) {
      actions.validateDeconstruction(packageId, selectedServices);
      // Get service details from the package
      const details = selectedServices.map(selection => {
        const service = currentPackage.services.find((s: any) => s.service_id === selection.service_id);
        return service ? {
          ...service,
          quantity: selection.quantity,
          service_name: service.service_name,
          service_base_price: service.service_base_price,
          service_duration: service.service_duration
        } : null;
      }).filter(Boolean);
      setServiceDetails(details);
    } else {
      actions.setValidationResult(null);
      setServiceDetails([]);
    }
  }, [selectedServices, packageId, currentPackage, actions]);

  const handleCreateJob = () => {
    if (validationResult?.isValid && currentPackage && serviceDetails.length > 0) {
      // Prepare package job data for auto-fill
      const jobData = {
        packageId: currentPackage.id,
        packageName: currentPackage.name,
        selectedServices: selectedServices,
        totalPrice: validationResult.totalPrice,
        totalDuration: validationResult.totalDuration,
        isCustomized: true
      };

      // Store in sessionStorage for job creation page to read
      sessionStorage.setItem('customizedPackage', JSON.stringify(jobData));

      // Navigate to job creation with package context
      router.push('/dashboard/management/jobs/new?source=package');
    }
  };

  const handleQuickBook = () => {
    if (validationResult?.isValid && currentPackage) {
      // For quick booking, use existing calendar functionality
      const bookingData = {
        packageId: currentPackage.id,
        selectedServices: selectedServices,
        totalPrice: validationResult.totalPrice,
        totalDuration: validationResult.totalDuration
      };

      sessionStorage.setItem('quickBookPackage', JSON.stringify(bookingData));
      router.push('/dashboard/management/jobs/calendar');
    }
  };

  if (loading && !currentPackage) {
    return <div className="flex justify-center p-8">Loading package...</div>;
  }

  if (error && !currentPackage) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800">{error}</div>
          <Button variant="secondary" onClick={() => actions.fetchPackageById(packageId)} className="mt-2">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!currentPackage) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Package not found</div>
        <Link href="/dashboard/management/packages">
          <Button className="mt-4">Back to Packages</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href={`/dashboard/management/packages/${packageId}`}>
            <Button variant="outline">
              <ArrowLeft size={16} className="mr-2" />
              Back to Package
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Customize: {currentPackage.name}</h1>
            <p className="text-gray-600">Select services and customize your package experience</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Service Selection */}
          <div className="lg:col-span-2">
            <DeconstructionValidator
              package={currentPackage}
              selectedServices={selectedServices}
              onSelectionChange={setSelectedServices}
            />
          </div>

          {/* Validation Results & Actions */}
          <div className="space-y-4">
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Configuration Summary</h3>

              {validationResult ? (
                <div className="space-y-3">
                  <div className={`flex items-center gap-2 ${
                    validationResult.isValid ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {validationResult.isValid ? (
                      <CheckCircle size={20} />
                    ) : (
                      <AlertCircle size={20} />
                    )}
                    <span className="font-medium">
                      {validationResult.isValid ? 'Valid Configuration' : 'Invalid Configuration'}
                    </span>
                  </div>

                  {validationResult.errors.length > 0 && (
                    <div>
                      <h4 className="font-medium text-red-700 mb-1">Errors:</h4>
                      <ul className="text-sm text-red-600 space-y-1">
                        {validationResult.errors.map((error, index) => (
                          <li key={index}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validationResult.warnings.length > 0 && (
                    <div>
                      <h4 className="font-medium text-yellow-700 mb-1">Warnings:</h4>
                      <ul className="text-sm text-yellow-600 space-y-1">
                        {validationResult.warnings.map((warning, index) => (
                          <li key={index}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="pt-2 border-t">
                    <div className="flex justify-between text-sm mb-2">
                      <span>Selected Services:</span>
                      <span className="font-semibold">{selectedServices.length}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Total Price:</span>
                      <span className="font-semibold">{format(validationResult.totalPrice)}</span> {/* ✅ CORRECT: Using format function */}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total Duration:</span>
                      <span className="font-semibold">{validationResult.totalDuration} min</span>
                    </div>
                  </div>

                  {/* Selected Services Preview */}
                  {serviceDetails.length > 0 && (
                    <div className="pt-2 border-t">
                      <h4 className="font-medium text-gray-700 mb-2">Selected Services:</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {serviceDetails.map((service: any, index: number) => (
                          <li key={service.service_id} className="flex justify-between items-center">
                            <div>
                              <span className="font-medium">{service.service_name}</span>
                              <span className="text-gray-500 ml-2">(Qty: {service.quantity})</span>
                            </div>
                            <span className="font-medium">{format(service.package_price || service.service_base_price)}</span> {/* ✅ CORRECT: Using format function */}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">
                  Select services to see configuration summary and pricing
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <Button
                onClick={handleCreateJob}
                disabled={!validationResult?.isValid || serviceDetails.length === 0}
                className="w-full"
                size="lg"
              >
                Create Job with Selected Services
              </Button>

              <Button
                onClick={handleQuickBook}
                disabled={!validationResult?.isValid}
                variant="outline"
                className="w-full flex items-center gap-2"
              >
                <Calendar size={16} />
                Quick Book Appointment
              </Button>

              <div className="text-xs text-gray-500 text-center">
                {validationResult?.isValid
                  ? `Job will be pre-filled with ${selectedServices.length} selected service(s)`
                  : 'Complete service selection to continue'
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
