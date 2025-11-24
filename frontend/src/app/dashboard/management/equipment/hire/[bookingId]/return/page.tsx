'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEquipmentStore } from '@/store/week6/equipment-store';

export default function EquipmentReturnPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.bookingId as string;
  
  const { hireBookings, returnEquipment, fetchHireBookings } = useEquipmentStore();
  const [currentBooking, setCurrentBooking] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchHireBookings();
  }, [fetchHireBookings]);

  useEffect(() => {
    if (bookingId && hireBookings.length > 0) {
      const foundBooking = hireBookings.find(booking => booking.id === bookingId);
      setCurrentBooking(foundBooking);
    }
  }, [bookingId, hireBookings]);

  const [formData, setFormData] = useState({
    condition_after: '',
    damage_notes: '',
    damage_charges: 0,
    deposit_returned: 0,
    final_amount: 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await returnEquipment(bookingId, formData);
      alert('Equipment returned successfully!');
      router.push('/dashboard/management/equipment');
    } catch (error) {
      console.error('Failed to return equipment:', error);
      alert('Failed to return equipment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatDate = (dateInput: any): string => {
    if (!dateInput) return 'Not set';
    try {
      const dateString = dateInput.utc || dateInput.iso_local || dateInput;
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Date not set';
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Date error';
    }
  };

  if (!currentBooking) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-center">
          <div className="text-lg text-gray-600">Booking not found</div>
          <Link href="/dashboard/management/equipment" className="text-blue-600 hover:text-blue-800">
            Back to Equipment
          </Link>
        </div>
      </div>
    );
  }

  // Calculate suggested deposit return (full deposit if no damages)
  const suggestedDepositReturn = currentBooking.deposit_paid - formData.damage_charges;
  const suggestedFinalAmount = currentBooking.total_amount + formData.damage_charges;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Link 
            href="/dashboard/management/equipment" 
            className="text-blue-600 hover:text-blue-800 mb-2 inline-block"
          >
            ← Back to Equipment
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Return Equipment</h1>
          <p className="text-gray-600">Process equipment return and finalize booking</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Booking Information */}
              <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Booking Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Booking ID</p>
                    <p className="text-sm font-medium">{currentBooking.id.slice(-8)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Hire Period</p>
                    <p className="text-sm font-medium">
                      {formatDate(currentBooking.start_date)} - {formatDate(currentBooking.end_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="text-sm font-medium">${currentBooking.total_amount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Deposit Paid</p>
                    <p className="text-sm font-medium">${currentBooking.deposit_paid}</p>
                  </div>
                </div>
              </div>

              {/* Condition After Return */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Equipment Condition After Return *
                </label>
                <textarea
                  value={formData.condition_after}
                  onChange={(e) => handleChange('condition_after', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe the equipment condition after return. Note any changes from the pre-hire condition."
                  required
                />
              </div>

              {/* Damage Assessment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Damage Notes
                </label>
                <textarea
                  value={formData.damage_notes}
                  onChange={(e) => handleChange('damage_notes', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Note any damages, missing parts, or issues found during inspection..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Damage Charges ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.damage_charges}
                    onChange={(e) => handleChange('damage_charges', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Additional charges for damages or repairs needed
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Deposit Returned ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.deposit_returned}
                    onChange={(e) => handleChange('deposit_returned', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={suggestedDepositReturn.toString()}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Suggested: ${suggestedDepositReturn} (Deposit - Damage Charges)
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Final Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.final_amount}
                  onChange={(e) => handleChange('final_amount', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={suggestedFinalAmount.toString()}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Suggested: ${suggestedFinalAmount} (Total + Damage Charges)
                </p>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t">
                <Link
                  href="/dashboard/management/equipment"
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {isLoading ? 'Processing...' : 'Complete Return'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Return Summary */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Return Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Original Total</span>
                <span className="text-sm font-medium">${currentBooking.total_amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Damage Charges</span>
                <span className="text-sm font-medium text-red-600">+${formData.damage_charges}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Deposit Returned</span>
                <span className="text-sm font-medium text-green-600">-${formData.deposit_returned}</span>
              </div>
              <div className="border-t pt-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-900">Final Balance</span>
                  <span className="text-lg font-bold text-blue-600">
                    ${currentBooking.total_amount + formData.damage_charges - formData.deposit_returned}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Return Guidelines */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-yellow-800 mb-2">Return Guidelines</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Inspect equipment thoroughly before return</li>
              <li>• Note any damages or missing parts</li>
              <li>• Take photos if there are damages</li>
              <li>• Calculate charges for repairs/replacements</li>
              <li>• Return deposit minus any damage charges</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
