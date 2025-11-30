'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEquipmentStore } from '@/store/week6/equipment-store';
import { EquipmentCard } from '@/components/equipment/EquipmentCard';
import { useCurrency } from '@/lib/currency'; // ✅ ADDED IMPORT

export default function EquipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const equipmentId = params.equipmentId as string;
  const { format } = useCurrency(); // ✅ ADDED HOOK

  const { equipment, hireBookings, fetchEquipment, fetchHireBookings } = useEquipmentStore();
  const [currentEquipment, setCurrentEquipment] = useState<any>(null);
  const [equipmentBookings, setEquipmentBookings] = useState<any[]>([]);

  useEffect(() => {
    fetchEquipment();
    fetchHireBookings();
  }, [fetchEquipment, fetchHireBookings]);

  useEffect(() => {
    if (equipmentId && equipment.length > 0) {
      const foundEquipment = equipment.find(eq => eq.id === equipmentId);
      setCurrentEquipment(foundEquipment);

      // Filter bookings for this equipment
      const relatedBookings = hireBookings.filter(booking =>
        booking.equipment_id === equipmentId
      );
      setEquipmentBookings(relatedBookings);
    }
  }, [equipmentId, equipment, hireBookings]);

  if (!currentEquipment) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-center">
          <div className="text-lg text-gray-600">Equipment not found</div>
          <Link href="/dashboard/management/equipment" className="text-blue-600 hover:text-blue-800">
            Back to Equipment List
          </Link>
        </div>
      </div>
    );
  }

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <Link
            href="/dashboard/management/equipment"
            className="text-blue-600 hover:text-blue-800 mb-2 inline-block"
          >
            ← Back to Equipment
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{currentEquipment.asset_name}</h1>
          <p className="text-gray-600">{currentEquipment.asset_code}</p>
        </div>
        <div className="space-x-2">
          <Link
            href={`/dashboard/management/equipment/${equipmentId}/edit`}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Edit Equipment
          </Link>
          {currentEquipment.is_available && (
            <Link
              href={`/dashboard/management/equipment/hire?equipmentId=${equipmentId}`}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            >
              Hire This Equipment
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Equipment Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Equipment Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <EquipmentCard equipment={currentEquipment} showActions={false} />
          </div>

          {/* Detailed Information */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Detailed Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500">Basic Details</h3>
                <dl className="mt-2 space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Asset Code</dt>
                    <dd className="text-sm text-gray-900">{currentEquipment.asset_code}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Serial Number</dt>
                    <dd className="text-sm text-gray-900">{currentEquipment.serial_number}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Category</dt>
                    <dd className="text-sm text-gray-900 capitalize">{currentEquipment.category}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Location</dt>
                    <dd className="text-sm text-gray-900">{currentEquipment.location}</dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500">Hire Information</h3>
                <dl className="mt-2 space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Hire Rate</dt>
                    <dd className="text-sm text-gray-900">{format(currentEquipment.hire_rate)}/day</dd> {/* ✅ CORRECT: Using format function */}
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Deposit Amount</dt>
                    <dd className="text-sm text-gray-900">{format(currentEquipment.deposit_amount)}</dd> {/* ✅ CORRECT: Using format function */}
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Min Hire Duration</dt>
                    <dd className="text-sm text-gray-900">{currentEquipment.min_hire_duration} days</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Max Hire Duration</dt>
                    <dd className="text-sm text-gray-900">{currentEquipment.max_hire_duration} days</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Description */}
            {currentEquipment.description && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-500">Description</h3>
                <p className="mt-1 text-sm text-gray-900">{currentEquipment.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Bookings & Actions */}
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Equipment Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Availability</span>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  currentEquipment.is_available
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {currentEquipment.is_available ? 'Available' : 'Hired Out'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Condition</span>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  currentEquipment.condition_status === 'excellent' ? 'bg-green-100 text-green-800' :
                  currentEquipment.condition_status === 'good' ? 'bg-blue-100 text-blue-800' :
                  currentEquipment.condition_status === 'fair' ? 'bg-yellow-100 text-yellow-800' :
                  currentEquipment.condition_status === 'poor' ? 'bg-orange-100 text-orange-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {currentEquipment.condition_status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Active Bookings</span>
                <span className="text-sm font-medium text-gray-900">{equipmentBookings.length}</span>
              </div>
            </div>
          </div>

          {/* Recent Bookings */}
          {equipmentBookings.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Bookings</h3>
              <div className="space-y-3">
                {equipmentBookings.slice(0, 3).map((booking) => (
                  <div key={booking.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        Booking #{booking.id.slice(-8)}
                      </span>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        booking.status === 'completed' ? 'bg-green-100 text-green-800' :
                        booking.status === 'active' ? 'bg-blue-100 text-blue-800' :
                        booking.status === 'reserved' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {booking.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div>Period: {formatDate(booking.start_date)} - {formatDate(booking.end_date)}</div>
                      <div>Amount: {format(booking.total_amount)}</div> {/* ✅ CORRECT: Using format function */}
                    </div>
                    <Link
                      href={`/dashboard/management/equipment/hire/${booking.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800 mt-2 inline-block"
                    >
                      View Details →
                    </Link>
                  </div>
                ))}
                {equipmentBookings.length > 3 && (
                  <Link
                    href="/dashboard/management/equipment"
                    className="text-sm text-blue-600 hover:text-blue-800 block text-center"
                  >
                    View all bookings
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Link
                href={`/dashboard/management/equipment/${equipmentId}/edit`}
                className="w-full bg-blue-50 text-blue-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-blue-100 transition-colors block"
              >
                Edit Equipment
              </Link>
              {currentEquipment.is_available ? (
                <Link
                  href={`/dashboard/management/equipment/hire?equipmentId=${equipmentId}`}
                  className="w-full bg-green-50 text-green-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-green-100 transition-colors block"
                >
                  Create Hire Booking
                </Link>
              ) : (
                <button
                  disabled
                  className="w-full bg-gray-100 text-gray-400 text-sm font-medium py-2 px-3 rounded text-center cursor-not-allowed"
                >
                  Equipment Not Available
                </button>
              )}
              <Link
                href="/dashboard/management/maintenance/new"
                className="w-full bg-yellow-50 text-yellow-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-yellow-100 transition-colors block"
              >
                Schedule Maintenance
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
