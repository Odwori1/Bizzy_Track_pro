'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { SeasonalPricing } from '@/types/pricing';

interface SeasonalCalendarProps {
  seasonalPricing: SeasonalPricing[];
}

export default function SeasonalCalendar({ seasonalPricing }: SeasonalCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Helper to handle various date object shapes
  const getDateFromObject = (dateObj: any) => {
    if (!dateObj) return new Date();

    if (dateObj.iso_local) {
      return new Date(dateObj.iso_local);
    } else if (dateObj.utc) {
      return new Date(dateObj.utc);
    } else if (dateObj.timestamp) {
      return new Date(dateObj.timestamp);
    } else if (typeof dateObj === 'string') {
      return new Date(dateObj);
    }

    return new Date();
  };

  const activePricing = seasonalPricing.filter(sp => {
    const startDate = getDateFromObject(sp.start_date);
    const endDate = getDateFromObject(sp.end_date);

    return (
      sp.is_active &&
      endDate >= new Date() &&
      startDate <= new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
    );
  });

  // Calendar setup
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDay = firstDay.getDay();

  // Generate calendar days
  const calendarDays: any[] = [];

  // Empty days before month starts
  for (let i = 0; i < startingDay; i++) {
    calendarDays.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = new Date(year, month, day);

    const dayPricing = seasonalPricing.filter(sp => {
      const startDate = getDateFromObject(sp.start_date);
      const endDate = getDateFromObject(sp.end_date);

      return sp.is_active && currentDate >= startDate && currentDate <= endDate;
    });

    calendarDays.push({
      day,
      pricing: dayPricing,
    });
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">Seasonal Pricing Calendar</h2>

      <div className="bg-white border rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() =>
              setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
            }
            className="p-2 hover:bg-gray-100 rounded"
          >
            ←
          </button>

          <h3 className="font-medium">
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>

          <button
            onClick={() =>
              setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
            }
            className="p-2 hover:bg-gray-100 rounded"
          >
            →
          </button>
        </div>

        {/* Week Days Header */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div
              key={day}
              className="text-center text-sm font-medium text-gray-500 py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((dayInfo, index) => (
            <div
              key={index}
              className={`border rounded p-1 min-h-16 text-sm ${
                !dayInfo ? 'bg-gray-50' : 'bg-white'
              }`}
            >
              {dayInfo && (
                <>
                  <div className="text-right text-gray-700">{dayInfo.day}</div>

                  {dayInfo.pricing.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {dayInfo.pricing.slice(0, 2).map(pricing => (
                        <div
                          key={pricing.id}
                          className="text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded truncate"
                          title={pricing.name}
                        >
                          {pricing.adjustment_value}
                          {pricing.adjustment_type === 'percentage' ? '%' : '$'}
                        </div>
                      ))}

                      {dayInfo.pricing.length > 2 && (
                        <div className="text-xs text-gray-500">
                          +{dayInfo.pricing.length - 2} more
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Active Pricing List */}
        {activePricing.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium mb-2">Active This Month:</h4>

            <div className="space-y-1">
              {activePricing.map(pricing => (
                <div key={pricing.id} className="flex items-center text-sm">
                  <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>

                  <span>{pricing.name}</span>

                  <span className="text-gray-500 ml-2">
                    ({pricing.adjustment_value}
                    {pricing.adjustment_type === 'percentage' ? '%' : '$'})
                  </span>

                  <span className="text-gray-400 text-xs ml-2">
                    {getDateFromObject(pricing.start_date).toLocaleDateString()} -{' '}
                    {getDateFromObject(pricing.end_date).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

