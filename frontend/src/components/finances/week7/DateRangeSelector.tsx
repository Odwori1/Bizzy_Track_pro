'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface DateRangeSelectorProps {
  onDateRangeChange: (startDate: string, endDate: string) => void;
  defaultStartDate?: string;
  defaultEndDate?: string;
  className?: string;
}

export default function DateRangeSelector({ 
  onDateRangeChange, 
  defaultStartDate, 
  defaultEndDate,
  className = '' 
}: DateRangeSelectorProps) {
  const [startDate, setStartDate] = useState(defaultStartDate || '');
  const [endDate, setEndDate] = useState(defaultEndDate || '');
  const [isCustom, setIsCustom] = useState(false);

  const quickRanges = [
    { label: 'Today', getRange: () => {
      const today = new Date().toISOString().split('T')[0];
      return { start: today, end: today };
    }},
    { label: 'This Week', getRange: () => {
      const today = new Date();
      const start = new Date(today.setDate(today.getDate() - today.getDay())).toISOString().split('T')[0];
      const end = new Date().toISOString().split('T')[0];
      return { start, end };
    }},
    { label: 'This Month', getRange: () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const end = new Date().toISOString().split('T')[0];
      return { start, end };
    }},
    { label: 'Last Month', getRange: () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0];
      const end = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];
      return { start, end };
    }},
    { label: 'This Year', getRange: () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
      const end = new Date().toISOString().split('T')[0];
      return { start, end };
    }},
    { label: 'Last Year', getRange: () => {
      const today = new Date();
      const start = new Date(today.getFullYear() - 1, 0, 1).toISOString().split('T')[0];
      const end = new Date(today.getFullYear() - 1, 11, 31).toISOString().split('T')[0];
      return { start, end };
    }},
  ];

  const handleQuickRange = (getRange: () => { start: string; end: string }) => {
    const { start, end } = getRange();
    setStartDate(start);
    setEndDate(end);
    setIsCustom(false);
    onDateRangeChange(start, end);
  };

  const handleCustomApply = () => {
    if (startDate && endDate) {
      onDateRangeChange(startDate, endDate);
      setIsCustom(true);
    }
  };

  const isCustomActive = isCustom && startDate && endDate;

  return (
    <Card className={`p-4 ${className}`}>
      <h3 className="font-semibold text-gray-900 mb-3">Select Date Range</h3>
      
      {/* Quick Range Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {quickRanges.map((range, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => handleQuickRange(range.getRange)}
          >
            {range.label}
          </Button>
        ))}
      </div>

      {/* Custom Date Range */}
      <div className="border-t pt-3">
        <div className="flex items-center gap-2 mb-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleCustomApply}
          disabled={!startDate || !endDate}
          className="w-full"
        >
          Apply Custom Range
        </Button>
      </div>

      {/* Selected Range Display */}
      {(startDate && endDate) && (
        <div className="mt-3 p-2 bg-blue-50 rounded text-sm text-blue-800">
          <strong>Selected:</strong> {new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}
        </div>
      )}
    </Card>
  );
}
