'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { useCurrency } from '@/lib/currency';
import { accountingApi } from '@/lib/api';

export default function TrialBalancePage() {
  const { format } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trialBalance, setTrialBalance] = useState<any>(null);

  const fetchTrialBalance = async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await accountingApi.getTrialBalance(today);
      setTrialBalance(response);
    } catch (err: any) {
      setError(err.message || 'Failed to load trial balance');
      console.error('Trial balance error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrialBalance();
  }, []);

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trial Balance</h1>
          <p className="text-gray-600">
            Validate that total debits equal total credits
          </p>
          <div className="mt-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              ⚖️ Accounting Validation
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
              ✅ GAAP Compliance
            </span>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <Button variant="outline" onClick={fetchTrialBalance} disabled={loading}>
            {loading ? '🔄 Loading...' : '🔄 Refresh'}
          </Button>
          <Button variant="primary" disabled={!trialBalance}>
            📄 Export Report
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <div className="p-4">
            <div className="text-red-600 font-medium">Error Loading Trial Balance</div>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2"
              onClick={fetchTrialBalance}
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {trialBalance ? (
        <Card>
          <div className="p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Trial Balance Report</h3>
              <p className="text-gray-600">
                As of {trialBalance.period?.end_date || new Date().toISOString().split('T')[0]}
              </p>
            </div>
            
            {/* Add actual trial balance data display here */}
            <div className="text-center py-8">
              <div className="text-3xl mb-4">⚖️</div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">
                Trial Balance Loaded Successfully
              </h4>
              <p className="text-gray-600">
                Total Debits: {format(trialBalance.summary?.total_debits || 0)}
                <br />
                Total Credits: {format(trialBalance.summary?.total_credits || 0)}
                <br />
                <span className={`font-medium ${trialBalance.summary?.is_balanced ? 'text-green-600' : 'text-red-600'}`}>
                  {trialBalance.summary?.is_balanced ? '✅ Balanced' : '❌ Unbalanced'}
                </span>
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="p-6">
            <div className="text-center py-12">
              <div className="text-4xl mb-4">⚖️</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Trial Balance Report
              </h3>
              <p className="text-gray-600 mb-6">
                {error ? 'Failed to load trial balance' : 'Loading trial balance...'}
              </p>
              <Button variant="primary" onClick={fetchTrialBalance}>
                {error ? 'Retry Loading' : 'Loading...'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Information Card */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">About Trial Balance</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">What is a Trial Balance?</h4>
              <p className="text-sm text-gray-600">
                A trial balance is a bookkeeping worksheet where all ledger account balances
                are listed in separate debit and credit columns. The total of both columns
                must match, confirming that the accounting equation (Assets = Liabilities + Equity)
                is maintained.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Why is it important?</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• <span className="font-medium">Error detection</span>: Identifies posting errors</li>
                <li>• <span className="font-medium">Financial accuracy</span>: Ensures books are balanced</li>
                <li>• <span className="font-medium">Audit trail</span>: Provides verification for auditors</li>
                <li>• <span className="font-medium">GAAP compliance</span>: Required for proper financial reporting</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
