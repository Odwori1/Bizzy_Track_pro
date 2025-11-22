'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePackageStore } from '@/store/packageStore';
import { PackageRulesManager } from '@/components/packages/PackageRulesManager';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Save } from 'lucide-react';
import { PackageDeconstructionRule } from '@/types/packages';
import Link from 'next/link';

export default function PackageRulesPage() {
  const params = useParams();
  const router = useRouter();
  const { currentPackage, loading, error, actions } = usePackageStore();

  const packageId = params.packageId as string;
  const [rules, setRules] = useState<PackageDeconstructionRule[]>([]);

  useEffect(() => {
    if (packageId) {
      actions.fetchPackageById(packageId);
    }
  }, [packageId, actions]);

  useEffect(() => {
    if (currentPackage) {
      setRules(currentPackage.deconstruction_rules || []);
    }
  }, [currentPackage]);

  const handleSave = async () => {
    try {
      await actions.updateDeconstructionRules(packageId, rules.map(rule => ({
        rule_type: rule.rule_type,
        rule_conditions: rule.rule_conditions,
        rule_actions: rule.rule_actions,
        priority: rule.priority,
        is_active: rule.is_active
      })));
      alert('Rules updated successfully!');
    } catch (err) {
      // Error handled by store
    }
  };

  if (loading && !currentPackage) {
    return <div className="flex justify-center p-8">Loading package rules...</div>;
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
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <Link href={`/dashboard/management/packages/${packageId}`}>
              <Button variant="outline">
                <ArrowLeft size={16} className="mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Deconstruction Rules</h1>
              <p className="text-gray-600">Manage rules for {currentPackage.name}</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={loading}>
            <Save size={16} className="mr-2" />
            {loading ? 'Saving...' : 'Save Rules'}
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <PackageRulesManager
          rules={rules}
          onRulesChange={setRules}
          package={currentPackage}
        />
      </div>
    </div>
  );
}
