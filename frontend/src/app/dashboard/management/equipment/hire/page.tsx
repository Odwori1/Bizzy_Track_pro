'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useEquipmentStore } from '@/store/week6/equipment-store';

export default function HireBookingsPage() {
  const { hireBookings, equipment, fetchHireBookings, fetchEquipment, updateHireBooking } = useEquipmentStore();
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchHireBookings();
    fetchEquipment();
  }, [fetchHireBookings, fetchEquipment]);

  const handleDeleteBooking = async (bookingId: string, bookingNumber: string) => {
    if (!confirm(`Are you sure you want to delete booking "${bookingNumber}"? This will make the equipment available again.`)) {
      return;
    }

    setIsLoading(true);
    try {
      await updateHireBooking(bookingId, { status: 'cancelled' });
      alert('Booking cancelled successfully!');
      fetchHireBookings(); // Refresh the list
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

  const filteredBookings = hireBookings.filter(booking => {
    if (statusFilter === 'all') return true;
    return booking.status === statusFilter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'active':
        return 'bg-blue-100 text-blue-800';
      case 'confirmed':
        return 'bg-yellow-100 text-yellow-800';
      case 'reserved':
        return 'bg-purple-100 text-purple-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

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
          <h1 className="text-2xl font-bold text-gray-900">Hire Bookings</h1>
          <p className="text-gray-600">Manage equipment hire bookings and returns</p>
        </div>
        <Link
          href="/dashboard/management/equipment/hire/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          New Booking
        </Link>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-blue-100 p-3 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Bookings</p>
              <p className="text-2xl font-bold text-gray-900">{hireBookings.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-yellow-100 p-3 rounded-lg">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-2xl font-bold text-gray-900">
                {hireBookings.filter(b => b.status === 'active').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-green-100 p-3 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-gray-900">
                {hireBookings.filter(b => b.status === 'completed').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-purple-100 p-3 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Cancelled</p>
              <p className="text-2xl font-bold text-gray-900">
                {hireBookings.filter(b => b.status === 'cancelled').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Filter by Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Bookings</option>
            <option value="reserved">Reserved</option>
            <option value="confirmed">Confirmed</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Booking Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Equipment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hire Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Financials
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No bookings found matching the current filter.
                  </td>
                </tr>
              ) : (
                filteredBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{booking.booking_number}</div>
                        <div className="text-sm text-gray-500">ID: {booking.id.slice(-8)}</div>
                        <div className="text-xs text-gray-400">
                          Created: {formatDate(booking.created_at)}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {equipment.find(eq => eq.id === booking.equipment_id)?.asset_name || 'Unknown Equipment'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {equipment.find(eq => eq.id === booking.equipment_id)?.asset_code || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {formatDate(booking.start_date)} - {formatDate(booking.end_date)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {(() => {
                          const start = new Date(booking.start_date);
                          const end = new Date(booking.end_date);
                          const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                          return `${days} days`;
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">${booking.total_amount}</div>
                      <div className="text-sm text-gray-500">
                        Deposit: ${booking.deposit_paid}
                      </div>
                      {booking.final_amount && (
                        <div className="text-sm font-medium text-green-600">
                          Final: ${booking.final_amount}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(booking.status)}`}>
                        {booking.status}
                      </span>
                      {booking.actual_return_date && (
                        <div className="text-xs text-gray-500 mt-1">
                          Returned: {formatDate(booking.actual_return_date)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                      <Link
                        href={`/dashboard/management/equipment/hire/${booking.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </Link>
                      
                      {booking.status !== 'completed' && booking.status !== 'cancelled' && (
                        <>
                          <Link
                            href={`/dashboard/management/equipment/hire/${booking.id}/return`}
                            className="text-green-600 hover:text-green-900"
                          >
                            Return
                          </Link>
                          <button
                            onClick={() => handleDeleteBooking(booking.id, booking.booking_number || booking.id.slice(-8))}
                            disabled={isLoading}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      
                      {booking.status === 'completed' && (
                        <span className="text-gray-400 cursor-not-allowed" title="Completed bookings cannot be modified">
                          Completed
                        </span>
                      )}
                      
                      {booking.status === 'cancelled' && (
                        <span className="text-gray-400 cursor-not-allowed" title="Cancelled bookings cannot be modified">
                          Cancelled
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
