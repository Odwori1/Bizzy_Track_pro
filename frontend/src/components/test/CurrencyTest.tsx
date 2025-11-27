'use client';

import { useCurrency } from '@/lib/currency';
import { useAuthStore } from '@/store/authStore';
import { Card } from '@/components/ui/Card';

export const CurrencyTest: React.FC = () => {
  const { business } = useAuthStore();
  const { format } = useCurrency();

  return (
    <Card>
      <div className="p-6">
        <h3 className="text-lg font-bold mb-4">Currency System Test</h3>
        <div className="space-y-2">
          <div>Business: {business?.name}</div>
          <div>Currency: {business?.currency} ({business?.currencySymbol})</div>
          <div className="border-t pt-2">
            <div>Small amount: {format(15.50)}</div>
            <div>Medium amount: {format(250.75)}</div>
            <div>Large amount: {format(12500.99)}</div>
            <div>String amount: {format("350.25")}</div>
          </div>
        </div>
      </div>
    </Card>
  );
};
