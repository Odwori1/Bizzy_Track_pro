'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';

export default function GeneralLedgerPage() {
  const { format } = useCurrency();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">General Ledger</h1>
          <p className="text-gray-600">
            Complete transaction history for each account
          </p>
          <div className="mt-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              📖 Account History
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
              📝 Detailed Records
            </span>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <Button variant="outline">
            📄 Export Ledger
          </Button>
          <Button variant="primary">
            🔍 Search Accounts
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-6">
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📖</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              General Ledger Viewer
            </h3>
            <p className="text-gray-600 mb-6">
              View detailed transaction history for any account in the chart of accounts.
              <br />
              <span className="text-sm text-gray-500">
                Coming soon - Backend endpoint integration in progress
              </span>
            </p>
            <div className="flex justify-center space-x-4">
              <Button variant="primary" disabled>
                View Account Ledger
              </Button>
              <Button variant="outline">
                Browse Chart of Accounts
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Information Card */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">About General Ledger</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">What is a General Ledger?</h4>
              <p className="text-sm text-gray-600">
                The general ledger is the master set of accounts that summarizes all transactions
                occurring within a business. It contains all the accounts for recording transactions
                relating to assets, liabilities, owners' equity, revenue, and expenses.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Key Features</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• <span className="font-medium">Complete history</span>: All transactions for each account</li>
                <li>• <span className="font-medium">Running balances</span>: Current balance for each account</li>
                <li>• <span className="font-medium">Audit trail</span>: Detailed record of every entry</li>
                <li>• <span className="font-medium">Account analysis</span>: Understand account activity over time</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
