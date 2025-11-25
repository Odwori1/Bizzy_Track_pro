'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function FinancialReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Reports</h1>
          <p className="text-gray-600">View and analyze your business finances</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link href="/dashboard/management/finances/reports/profit-loss">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2 text-green-600">📊</div>
              <h3 className="font-semibold text-gray-900">Profit & Loss</h3>
              <p className="text-gray-600 text-sm">Income, expenses, and net profit</p>
            </div>
          </Card>
        </Link>

        <Link href="/dashboard/management/finances/reports/balance-sheet">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2 text-blue-600">⚖️</div>
              <h3 className="font-semibold text-gray-900">Balance Sheet</h3>
              <p className="text-gray-600 text-sm">Assets, liabilities, and equity</p>
            </div>
          </Card>
        </Link>

        <Link href="/dashboard/management/finances/reports/cash-flow">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2 text-purple-600">💸</div>
              <h3 className="font-semibold text-gray-900">Cash Flow</h3>
              <p className="text-gray-600 text-sm">Cash inflows and outflows</p>
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <div className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Quick Reports</h3>
            <div className="space-y-3">
              <Button variant="outline" className="w-full justify-start">
                📅 Monthly Summary
              </Button>
              <Button variant="outline" className="w-full justify-start">
                🎯 Expense Analysis
              </Button>
              <Button variant="outline" className="w-full justify-start">
                💰 Revenue Report
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Export Options</h3>
            <div className="space-y-3">
              <Button variant="outline" className="w-full justify-start">
                📄 Export as PDF
              </Button>
              <Button variant="outline" className="w-full justify-start">
                📊 Export as Excel
              </Button>
              <Button variant="outline" className="w-full justify-start">
                📋 Print Report
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
