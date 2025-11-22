'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePackageStore } from '@/store/packageStore';
import { DeconstructionValidator } from '@/components/packages/DeconstructionValidator';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function DeconstructPackagePage() {
  const params = useParams();
  const router = useRouter();
  const { currentPackage, validationResult, loading, error, actions } = usePackageStore();

  const packageId = params.packageId as string;
  const [selectedServices, setSelectedServices] = useState<Array<{service_id: string; quantity: number}>>([]);

  useEffect(() => {
    if (packageId) {
      actions.fetchPackageById(packageId);
    }
  }, [packageId, actions]);

  useEffect(() => {
    if (currentPackage && selectedServices.length > 0) {
      actions.validateDeconstruction(packageId, selectedServices);
    }
  }, [selectedServices, packageId, currentPackage, actions]);

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

  const handleProceed = () => {
    if (validationResult?.isValid) {
      // Navigate to job creation or booking with selected services
      alert('Ready to create job with customized package!');
      // router.push(`/dashboard/jobs/new?package=${packageId}&services=${JSON.stringify(selectedServices)}`);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href={`/dashboard/management/packages/${packageId}`}>
            <Button variant="outline">
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Customize Package</h1>
            <p className="text-gray-600">Select services and customize your package</p>
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

          {/* Validation Results */}
          <div className="space-y-4">
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Validation Results</h3>

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
                    <div className="flex justify-between text-sm">
                      <span>Total Price:</span>
                      <span className="font-semibold">
                        ${validationResult.totalPrice.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total Duration:</span>
                      <span className="font-semibold">
                        {validationResult.totalDuration} min
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">
                  Select services to see validation results
                </p>
              )}
            </div>

            <Button
              onClick={handleProceed}
              disabled={!validationResult?.isValid}
              className="w-full"
            >
              Proceed with Customized Package
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
