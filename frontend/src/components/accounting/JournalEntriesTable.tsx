'use client';

import React, { useState } from 'react';
import { useCurrency } from '@/lib/currency';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface JournalEntryLine {
  id: string;
  account_code: string;
  account_name: string;
  line_type: 'debit' | 'credit';
  amount: string;
  description: string;
}

interface JournalEntry {
  id: string;
  reference_number: string;
  journal_date: {
    formatted: string;
  };
  reference_type: string;
  description: string;
  total_amount: string;
  lines: JournalEntryLine[];
  line_count: number;
  total_debits: number;
  total_credits: number;
  is_balanced: boolean;
}

interface JournalEntriesTableProps {
  entries: JournalEntry[];
  loading?: boolean;
  onRowClick?: (entry: JournalEntry) => void;
}

export const JournalEntriesTable: React.FC<JournalEntriesTableProps> = ({
  entries,
  loading = false,
  onRowClick
}) => {
  const { format } = useCurrency();
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <div className="p-4">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <div className="text-center py-8">
          <div className="text-gray-500">No journal entries found</div>
          <p className="text-sm text-gray-400 mt-1">
            Accounting entries will appear here when transactions occur
          </p>
        </div>
      </Card>
    );
  }

  const toggleEntryExpansion = (entryId: string) => {
    if (expandedEntry === entryId) {
      setExpandedEntry(null);
    } else {
      setExpandedEntry(entryId);
    }
  };

  const getReferenceTypeBadge = (type: string) => {
    const typeConfig: Record<string, { label: string; color: string; bgColor: string }> = {
      pos_transaction: { label: 'POS Sale', color: 'text-green-700', bgColor: 'bg-green-100' },
      expense: { label: 'Expense', color: 'text-red-700', bgColor: 'bg-red-100' },
      manual: { label: 'Manual Entry', color: 'text-blue-700', bgColor: 'bg-blue-100' },
      purchase_order: { label: 'Purchase', color: 'text-purple-700', bgColor: 'bg-purple-100' },
    };

    const config = typeConfig[type] || { label: type, color: 'text-gray-700', bgColor: 'bg-gray-100' };
    
    return (
      <span className={`text-xs px-2 py-1 rounded ${config.bgColor} ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getAccountTypeColor = (accountCode: string) => {
    if (accountCode.startsWith('1')) return 'text-blue-600'; // Assets
    if (accountCode.startsWith('2')) return 'text-orange-600'; // Liabilities
    if (accountCode.startsWith('3')) return 'text-purple-600'; // Equity
    if (accountCode.startsWith('4')) return 'text-green-600'; // Revenue
    if (accountCode.startsWith('5')) return 'text-red-600'; // Expenses
    return 'text-gray-600';
  };

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <Card key={entry.id} className="overflow-hidden">
          <div 
            className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => {
              toggleEntryExpansion(entry.id);
              if (onRowClick) onRowClick(entry);
            }}
          >
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h3 className="font-medium text-gray-900">
                    {entry.reference_number}
                  </h3>
                  {getReferenceTypeBadge(entry.reference_type)}
                  {entry.is_balanced ? (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      ✅ Balanced
                    </span>
                  ) : (
                    <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                      ⚠️ Unbalanced
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600">{entry.description}</p>
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <span>{entry.journal_date.formatted}</span>
                  <span>•</span>
                  <span>{entry.line_count} line{entry.line_count !== 1 ? 's' : ''}</span>
                  <span>•</span>
                  <span className="font-medium">{format(entry.total_amount)}</span>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleEntryExpansion(entry.id);
                }}
              >
                {expandedEntry === entry.id ? 'Hide Details' : 'Show Details'}
              </Button>
            </div>

            {/* Quick summary */}
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Debits:</span>
                <span className="font-medium text-green-600">
                  {format(entry.total_debits)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Credits:</span>
                <span className="font-medium text-blue-600">
                  {format(entry.total_credits)}
                </span>
              </div>
            </div>
          </div>

          {/* Expanded details */}
          {expandedEntry === entry.id && (
            <div className="border-t px-4 py-3 bg-gray-50">
              <div className="mb-2">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Journal Entry Lines</h4>
                <div className="space-y-2">
                  {entry.lines.map((line, index) => (
                    <div key={line.id} className="flex justify-between items-center py-2 px-3 bg-white rounded border">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${
                            line.line_type === 'debit' ? 'bg-green-500' : 'bg-blue-500'
                          }`}></div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className={`text-sm font-medium ${getAccountTypeColor(line.account_code)}`}>
                                {line.account_code}
                              </span>
                              <span className="text-xs text-gray-500">•</span>
                              <span className="text-sm text-gray-700">{line.account_name}</span>
                            </div>
                            {line.description && (
                              <p className="text-xs text-gray-500 mt-1">{line.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-medium ${
                          line.line_type === 'debit' ? 'text-green-600' : 'text-blue-600'
                        }`}>
                          {line.line_type === 'debit' ? 'Debit' : 'Credit'}: {format(line.amount)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Accounting equation */}
              <div className="mt-4 pt-3 border-t">
                <div className="flex justify-between items-center text-sm">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span className="text-gray-700">Total Debits:</span>
                      <span className="font-medium text-green-600">{format(entry.total_debits)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <span className="text-gray-700">Total Credits:</span>
                      <span className="font-medium text-blue-600">{format(entry.total_credits)}</span>
                    </div>
                  </div>
                  <div className={`text-sm font-medium ${
                    entry.is_balanced ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {entry.is_balanced ? '✅ Debits = Credits' : '❌ Debits ≠ Credits'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
};
