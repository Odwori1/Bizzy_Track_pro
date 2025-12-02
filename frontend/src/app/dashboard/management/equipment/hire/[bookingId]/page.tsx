'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEquipmentStore } from '@/store/week6/equipment-store';
import { useUniversalCartStore } from '@/store/universal-cart-store';
import { useCurrency } from '@/lib/currency';  // ✅ CORRECT IMPORT
import { Button } from '@/components/ui/Button';

export default function HireBookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.bookingId as string;

  const { hireBookings, fetchHireBookings, updateHireBooking } = useEquipmentStore();
  const { addEquipmentBookingToCart } = useUniversalCartStore();
  const { format } = useCurrency();  // ✅ CORRECT HOOK USAGE
  
  const [currentBooking, setCurrentBooking] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [cartMessage, setCartMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchHireBookings();
  }, [fetchHireBookings]);

  useEffect(() => {
    if (bookingId && hireBookings.length > 0) {
      const foundBooking = hireBookings.find(booking => booking.id === bookingId);
      setCurrentBooking(foundBooking);
    }
  }, [bookingId, hireBookings]);

  // Handle adding booking to POS cart
  const handleAddToCart = async () => {
    if (!currentBooking) return;

    setIsAddingToCart(true);
    setCartMessage(null);

    try {
      const result = await addEquipmentBookingToCart(bookingId);
      
      if (result.success) {
        setCartMessage({ type: 'success', text: result.message });
        
        // Auto-clear success message after 3 seconds
        setTimeout(() => setCartMessage(null), 3000);
        
        // Optionally redirect to cart after successful add
        // router.push('/dashboard/management/pos/cart');
      } else {
        setCartMessage({ type: 'error', text: result.message });
      }
    } catch (error: any) {
      console.error('Failed to add booking to cart:', error);
      setCartMessage({ type: 'error', text: error.message || 'Failed to add to cart' });
    } finally {
      setIsAddingToCart(false);
    }
  };

  // Action handlers
  const handleUpdateStatus = async () => {
    if (!currentBooking) return;

    const statusOptions = ['reserved', 'confirmed', 'active', 'completed', 'cancelled'];
    const currentStatus = currentBooking.status;

    let newStatus = prompt(`Current status: ${currentStatus}\n\nEnter new status (${statusOptions.join('/')}):`, currentStatus);

    if (newStatus && statusOptions.includes(newStatus)) {
      setIsLoading(true);
      try {
        await updateHireBooking(bookingId, { status: newStatus });
        alert(`Status updated to ${newStatus} successfully!`);
        fetchHireBookings(); // Refresh data
      } catch (error) {
        console.error('Failed to update status:', error);
        alert('Failed to update status. Please try again.');
      } finally {
        setIsLoading(false);
      }
    } else if (newStatus) {
      alert(`Invalid status: ${newStatus}. Please use one of: ${statusOptions.join(', ')}`);
    }
  };

  const handleRecordReturn = () => {
    if (currentBooking?.status === 'completed') {
      alert('This booking is already marked as completed. Equipment has been returned.');
      return;
    }
    router.push(`/dashboard/management/equipment/hire/${bookingId}/return`);
  };

  const handleAddCharges = () => {
    const currentCharges = currentBooking?.damage_charges || 0;
    const currentTotal = currentBooking?.total_amount || 0;

    const charges = prompt(`Current damage charges: ${format(currentCharges)}\nCurrent total: ${format(currentTotal)}\n\nEnter additional charges amount:`, currentCharges.toString());

    if (charges && !isNaN(parseFloat(charges))) {
      const damageCharges = parseFloat(charges);
      const finalAmount = currentTotal + damageCharges;

      if (confirm(`Add ${format(damageCharges)} in charges? Final amount will be ${format(finalAmount)}`)) {
        setIsLoading(true);
        updateHireBooking(bookingId, {
          damage_charges: damageCharges,
          final_amount: finalAmount
        })
        .then(() => {
          alert('Charges added successfully!');
          fetchHireBookings();
        })
        .catch(error => {
          console.error('Failed to add charges:', error);
          alert('Failed to add charges. Please try again.');
        })
        .finally(() => {
          setIsLoading(false);
        });
      }
    }
  };

  const handleCancelBooking = async () => {
    if (!currentBooking) return;

    if (!confirm(`Are you sure you want to cancel booking "${currentBooking.booking_number}"? This will make the equipment available again.`)) {
      return;
    }

    setIsLoading(true);
    try {
      await updateHireBooking(bookingId, { status: 'cancelled' });
      alert('Booking cancelled successfully!');
      router.push('/dashboard/management/equipment/hire');
    } catch (error) {
      console.error('Failed to cancel booking:', error);
      alert('Failed to cancel booking. Please try again.');
    } finally {
      setIsLoading(false);
    }
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
          <div className="text-lg text-gray-600">Loading booking details...</div>
          <Link href="/dashboard/management/equipment" className="text-blue-600 hover:text-blue-800 mt-2 inline-block">
            Back to Equipment
          </Link>
        </div>
      </div>
    );
  }

  const canRecordReturn = currentBooking.status !== 'completed' && currentBooking.status !== 'cancelled';
  const canCancel = currentBooking.status !== 'completed' && currentBooking.status !== 'cancelled';
  const canAddToCart = currentBooking.status === 'reserved' || currentBooking.status === 'confirmed';

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
          <h1 className="text-2xl font-bold text-gray-900">Hire Booking Details</h1>
          <p className="text-gray-600">Booking #: {currentBooking.booking_number || currentBooking.id.slice(-8)}</p>
        </div>
        <div className="space-x-2">
          <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
            currentBooking.status === 'completed' ? 'bg-green-100 text-green-800' :
            currentBooking.status === 'active' ? 'bg-blue-100 text-blue-800' :
            currentBooking.status === 'confirmed' ? 'bg-yellow-100 text-yellow-800' :
            currentBooking.status === 'reserved' ? 'bg-purple-100 text-purple-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {currentBooking.status}
          </span>
        </div>
      </div>

      {/* Cart Message Alert */}
      {cartMessage && (
        <div className={`p-4 rounded-lg ${
          cartMessage.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center">
            {cartMessage.type === 'success' ? (
              <svg className="w-5 h-5 text-green-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            <span className={`text-sm font-medium ${
              cartMessage.type === 'success' ? 'text-green-800' : 'text-red-800'
            }`}>
              {cartMessage.text}
            </span>
            {cartMessage.type === 'success' && (
              <Link
                href="/dashboard/management/pos/cart"
                className="ml-3 text-sm font-medium text-green-700 hover:text-green-800 underline"
              >
                Go to Cart →
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Booking Information */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Booking Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Hire Period</h3>
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Start Date</dt>
                    <dd className="text-sm text-gray-900">{formatDate(currentBooking.start_date)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">End Date</dt>
                    <dd className="text-sm text-gray-900">{formatDate(currentBooking.end_date)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Actual Return</dt>
                    <dd className="text-sm text-gray-900">{formatDate(currentBooking.actual_return_date)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Duration</dt>
                    <dd className="text-sm text-gray-900">
                      {(() => {
                        const start = new Date(currentBooking.start_date);
                        const end = new Date(currentBooking.end_date);
                        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                        return `${days} days`;
                      })()}
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Financial Details</h3>
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Total Amount</dt>
                    <dd className="text-sm text-gray-900">{format(currentBooking.total_amount)}</dd>  {/* ✅ CORRECT CURRENCY */}
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Deposit Paid</dt>
                    <dd className="text-sm text-gray-900">{format(currentBooking.deposit_paid)}</dd>  {/* ✅ CORRECT CURRENCY */}
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Damage Charges</dt>
                    <dd className="text-sm text-gray-900">{format(currentBooking.damage_charges || 0)}</dd>  {/* ✅ CORRECT CURRENCY */}
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Final Amount</dt>
                    <dd className="text-sm font-medium text-green-600">{format(currentBooking.final_amount || currentBooking.total_amount)}</dd>  {/* ✅ CORRECT CURRENCY */}
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* Condition Reports */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Condition Reports</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Pre-Hire Condition</h3>
                <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded border min-h-[80px]">
                  {currentBooking.condition_before || 'No condition notes recorded'}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Post-Hire Condition</h3>
                <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded border min-h-[80px]">
                  {currentBooking.condition_after || 'Not yet returned'}
                </p>
              </div>
            </div>

            {currentBooking.damage_notes && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Damage Notes</h3>
                <p className="text-sm text-gray-900 bg-red-50 p-3 rounded border">
                  {currentBooking.damage_notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* POS Cart Action */}
          {canAddToCart && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">POS Cart</h3>
              <div className="space-y-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">Add to Cart</h4>
                  <p className="text-sm text-blue-700">
                    Add this booking to POS cart to process payment through the central payment system.
                  </p>
                </div>
                
                <Button
                  onClick={handleAddToCart}
                  disabled={isAddingToCart}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  {isAddingToCart ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Adding to Cart...
                    </span>
                  ) : (
                    'Add to POS Cart'
                  )}
                </Button>
                
                <Link href="/dashboard/management/pos/cart" className="block">
                  <Button variant="outline" className="w-full">
                    View Cart
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Booking Actions */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Booking Actions</h3>
            <div className="space-y-2">
              <button
                onClick={handleUpdateStatus}
                disabled={isLoading}
                className="w-full bg-blue-50 text-blue-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Updating...' : 'Update Status'}
              </button>

              <button
                onClick={handleRecordReturn}
                disabled={isLoading || !canRecordReturn}
                className="w-full bg-green-50 text-green-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {currentBooking.status === 'completed' ? 'Already Returned' : 'Record Return'}
              </button>

              <button
                onClick={handleAddCharges}
                disabled={isLoading}
                className="w-full bg-yellow-50 text-yellow-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-yellow-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Charges
              </button>

              {canCancel && (
                <button
                  onClick={handleCancelBooking}
                  disabled={isLoading}
                  className="w-full bg-red-50 text-red-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Cancelling...' : 'Cancel Booking'}
                </button>
              )}

              <Link
                href="/dashboard/management/equipment"
                className="w-full bg-gray-50 text-gray-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-gray-100 transition-colors block"
              >
                Back to Equipment
              </Link>
            </div>

            {!canRecordReturn && currentBooking.status === 'completed' && (
              <p className="text-xs text-gray-500 mt-3 text-center">
                Equipment already returned on {formatDate(currentBooking.actual_return_date)}
              </p>
            )}
          </div>

          {/* Status Timeline */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Status Timeline</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${
                  currentBooking.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'
                }`}></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Booking Created</p>
                  <p className="text-xs text-gray-500">{formatDate(currentBooking.created_at)}</p>
                </div>
              </div>

              {['confirmed', 'active', 'completed'].includes(currentBooking.status) && (
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                    ['active', 'completed'].includes(currentBooking.status) ? 'bg-blue-500' : 'bg-gray-300'
                  }`}></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Confirmed</p>
                    <p className="text-xs text-gray-500">Deposit paid</p>
                  </div>
                </div>
              )}

              {['active', 'completed'].includes(currentBooking.status) && (
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                    currentBooking.status === 'completed' ? 'bg-purple-500' : 'bg-gray-300'
                  }`}></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Active</p>
                    <p className="text-xs text-gray-500">Equipment in use</p>
                  </div>
                </div>
              )}

              {currentBooking.status === 'completed' && (
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Completed</p>
                    <p className="text-xs text-gray-500">
                      Returned on {formatDate(currentBooking.actual_return_date)}
                    </p>
                  </div>
                </div>
              )}

              {currentBooking.status === 'cancelled' && (
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Cancelled</p>
                    <p className="text-xs text-gray-500">Booking was cancelled</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
