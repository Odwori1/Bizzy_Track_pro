'use client';

import React from 'react';
import { useCurrency } from '@/lib/currency';
import { Card } from '@/components/ui/Card';

interface AccountingSummary {
  revenue?: number;
  cogs?: number;
  gross_profit?: number;
  gross_margin?: number;
  operating_expenses?: number;
  net_profit?: number;
  journal_entry_count?: number;
  transaction_count?: number;
  period?: {
    start_date: string;
    end_date: string;
  };
}

interface AccountingSummaryCardsProps {
  summary: AccountingSummary;
  loading?: boolean;
}

export const AccountingSummaryCards: React.FC<AccountingSummaryCardsProps> = ({
  summary,
  loading = false
}) => {
  const { format } = useCurrency();

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <div className="p-6">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-2/3"></div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Revenue',
      value: summary.revenue || 0,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-100',
      description: 'Total sales and service income',
      icon: '💰',
      trend: summary.revenue ? 'primary' : 'neutral'
    },
    {
      title: 'Gross Profit',
      value: summary.gross_profit || 0,
      color: summary.gross_profit && summary.gross_profit >= 0 ? 'text-blue-600' : 'text-red-600',
      bgColor: summary.gross_profit && summary.gross_profit >= 0 ? 'bg-blue-50' : 'bg-red-50',
      borderColor: summary.gross_profit && summary.gross_profit >= 0 ? 'border-blue-100' : 'border-red-100',
      description: `Margin: ${summary.gross_margin ? (summary.gross_margin * 100).toFixed(1) : '0.0'}%`,
      icon: '📈',
      trend: summary.gross_profit && summary.gross_profit >= 0 ? 'positive' : 'negative'
    },
    {
      title: 'Net Profit/Loss',
      value: summary.net_profit || 0,
      color: summary.net_profit && summary.net_profit >= 0 ? 'text-green-600' : 'text-red-600',
      bgColor: summary.net_profit && summary.net_profit >= 0 ? 'bg-green-50' : 'bg-red-50',
      borderColor: summary.net_profit && summary.net_profit >= 0 ? 'border-green-100' : 'border-red-100',
      description: summary.net_profit && summary.net_profit >= 0 ? '✅ Profit' : '⚠️ Loss',
      icon: summary.net_profit && summary.net_profit >= 0 ? '✅' : '⚠️',
      trend: summary.net_profit && summary.net_profit >= 0 ? 'positive' : 'negative'
    },
    {
      title: 'Transactions',
      value: summary.transaction_count || 0,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-100',
      description: `${summary.journal_entry_count || 0} journal entries`,
      icon: '📊',
      trend: 'neutral'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Period Display */}
      {summary.period && (
        <div className="text-center">
          <p className="text-sm text-gray-600">
            Period: {summary.period.start_date} to {summary.period.end_date}
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, index) => (
          <Card 
            key={index} 
            className={`${card.bgColor} ${card.borderColor} border-2 hover:shadow-md transition-shadow`}
          >
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-600 mb-2">
                    {card.title}
                  </h3>
                  <div className={`text-2xl font-bold ${card.color} mb-1`}>
                    {card.title.includes('Profit') || card.title === 'Revenue' 
                      ? format(card.value)
                      : card.value.toLocaleString()}
                  </div>
                  <p className="text-xs text-gray-500">
                    {card.description}
                  </p>
                </div>
                <div className="text-2xl">
                  {card.icon}
                </div>
              </div>

              {/* Additional info for specific cards */}
              {card.title === 'Gross Profit' && summary.cogs !== undefined && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Revenue:</span>
                      <span className="font-medium">{format(summary.revenue || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>COGS:</span>
                      <span className="font-medium text-orange-600">{format(summary.cogs || 0)}</span>
                    </div>
                  </div>
                </div>
              )}

              {card.title === 'Net Profit/Loss' && summary.operating_expenses !== undefined && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Gross Profit:</span>
                      <span className={`font-medium ${summary.gross_profit && summary.gross_profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {format(summary.gross_profit || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Operating Expenses:</span>
                      <span className="font-medium text-red-600">{format(summary.operating_expenses || 0)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">COGS</div>
            <div className="text-lg font-medium text-orange-600">
              {format(summary.cogs || 0)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Cost of Goods Sold
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">Operating Expenses</div>
            <div className="text-lg font-medium text-red-600">
              {format(summary.operating_expenses || 0)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Rent, Salaries, Utilities
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">Accounting Health</div>
            <div className="text-lg font-medium text-green-600">
              ✅ Active
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Double-entry accounting enabled
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
