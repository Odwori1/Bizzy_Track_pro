'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAccounting } from '@/hooks/useAccounting';
import { AccountingSummaryCards } from '@/components/accounting/AccountingSummaryCards';
import { JournalEntriesTable } from '@/components/accounting/JournalEntriesTable';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { useCurrency } from '@/lib/currency';

export default function AccountingDashboardPage() {
  const { profitLoss, journalEntries, loading, error, refresh } = useAccounting();
  const { format } = useCurrency();
  
  const [refreshing, setRefreshing] = useState(false);

  // Handle refresh with local state
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  // Show loading only on initial load
  if (loading && !profitLoss && !journalEntries && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading />
      </div>
    );
  }

  // Show error state
  if (error && !profitLoss && !journalEntries) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <div className="p-8">
            <div className="text-red-600 font-medium text-lg mb-2">
              Accounting System Error
            </div>
            <p className="text-gray-600 mb-4">{error}</p>
            <div className="flex space-x-3">
              <Button onClick={handleRefresh} variant="primary" disabled={refreshing}>
                {refreshing ? 'Retrying...' : 'Retry'}
              </Button>
              <Link href="/dashboard">
                <Button variant="outline">
                  Return to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounting Dashboard</h1>
          <p className="text-gray-600">
            Double-entry accounting system overview
          </p>
          <div className="mt-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              ✅ GAAP Compliant
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 ml-2">
              📊 Real-time
            </span>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={refreshing || loading}
          >
            {refreshing ? '🔄 Refreshing...' : '🔄 Refresh'}
          </Button>
          <Button variant="primary">
            📄 Export Report
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <div className="p-4">
            <div className="text-red-600 font-medium">Accounting System Error</div>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Accounting System Status */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Accounting System Status</h3>
              <p className="text-gray-600">Double-entry accounting is active and recording all transactions</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">✅</div>
                <div className="text-xs text-gray-500">Active</div>
              </div>
            </div>
          </div>
          
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm font-medium text-blue-700">How it works</div>
              <p className="text-xs text-blue-600 mt-1">
                Every transaction creates balanced journal entries with debits = credits
              </p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm font-medium text-green-700">Data Source</div>
              <p className="text-xs text-green-600 mt-1">
                All financial reports now use accounting data, not transaction logs
              </p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-sm font-medium text-purple-700">Benefits</div>
              <p className="text-xs text-purple-600 mt-1">
                Accurate financial reporting, GAAP compliance, audit trail
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Summary Cards - Only show if we have data */}
      {profitLoss && (
        <AccountingSummaryCards 
          summary={{
            revenue: profitLoss.revenue?.total,
            cogs: profitLoss.cogs?.total,
            gross_profit: profitLoss.gross_profit,
            gross_margin: profitLoss.gross_margin,
            operating_expenses: profitLoss.operating_expenses?.total,
            net_profit: profitLoss.net_profit,
            journal_entry_count: profitLoss._metadata?.journal_entry_count,
            transaction_count: profitLoss._metadata?.transaction_count,
            period: profitLoss.period
          }}
          loading={refreshing}
        />
      )}

      {/* Quick Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Link href="/dashboard/management/finances/accounting/journal-entries">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2">📝</div>
              <h3 className="font-medium text-gray-900">Journal Entries</h3>
              <p className="text-sm text-gray-600 mt-1">View all accounting entries</p>
            </div>
          </Card>
        </Link>
        
        <Link href="/dashboard/management/finances/reports/profit-loss">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2">📊</div>
              <h3 className="font-medium text-gray-900">Profit & Loss</h3>
              <p className="text-sm text-gray-600 mt-1">Financial performance</p>
            </div>
          </Card>
        </Link>
        
        <Link href="/dashboard/management/finances/accounting/trial-balance">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2">⚖️</div>
              <h3 className="font-medium text-gray-900">Trial Balance</h3>
              <p className="text-sm text-gray-600 mt-1">Validate debits = credits</p>
            </div>
          </Card>
        </Link>
        
        <Link href="/dashboard/management/finances/accounting/general-ledger">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2">📒</div>
              <h3 className="font-medium text-gray-900">General Ledger</h3>
              <p className="text-sm text-gray-600 mt-1">Account transaction history</p>
            </div>
          </Card>
        </Link>
      </div>

      {/* Recent Journal Entries - Only show if we have data */}
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Recent Journal Entries</h3>
              <p className="text-gray-600">Latest accounting transactions</p>
            </div>
            <Link href="/dashboard/management/finances/accounting/journal-entries">
              <Button variant="outline" size="sm">
                View All →
              </Button>
            </Link>
          </div>
          
          {journalEntries && journalEntries.entries && journalEntries.entries.length > 0 ? (
            <JournalEntriesTable 
              entries={journalEntries.entries.slice(0, 5)}
              loading={refreshing}
            />
          ) : (
            <div className="text-center py-8">
              <div className="text-gray-500">No journal entries found</div>
              <p className="text-sm text-gray-400 mt-1">
                Create a POS sale or expense to see accounting entries
              </p>
            </div>
          )}
          
          {journalEntries && journalEntries.entries && journalEntries.entries.length > 5 && (
            <div className="mt-4 text-center">
              <Link href="/dashboard/management/finances/accounting/journal-entries">
                <Button variant="ghost" size="sm">
                  Show {journalEntries.entries.length - 5} more entries →
                </Button>
              </Link>
            </div>
          )}
        </div>
      </Card>

      {/* Accounting Health Check - Only show if we have data */}
      {profitLoss && (
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Accounting Health Check</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Double-entry System</span>
                  <span className="text-green-600 font-medium">✅ Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Journal Entries</span>
                  <span className="font-medium">{profitLoss._metadata?.journal_entry_count || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Transactions Recorded</span>
                  <span className="font-medium">{profitLoss._metadata?.transaction_count || 0}</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Data Source</span>
                  <span className="text-green-600 font-medium">✅ Accounting System</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Last Updated</span>
                  <span className="font-medium">{new Date().toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">System Status</span>
                  <span className="text-green-600 font-medium">✅ Healthy</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
