'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useEquipmentStore } from '@/store/week6/equipment-store';
import { useCurrency } from '@/lib/currency';
import { posEngine } from '@/lib/pos-engine';
import { Button } from '@/components/ui/Button';

export default function EquipmentPage() {
  const { equipment, activeHireBookings, fetchEquipment, fetchActiveHireBookings, deleteEquipment } = useEquipmentStore();
  const { format } = useCurrency();
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);

  useEffect(() => {
    fetchEquipment();
    fetchActiveHireBookings();
  }, [fetchEquipment, fetchActiveHireBookings]);

  const handleDeleteEquipment = async (equipmentId: string, equipmentName: string) => {
    if (!confirm(`Are you sure you want to delete "${equipmentName}"? This action cannot be undone.`)) {
      return;
    }

    setIsLoading(true);
    try {
      await deleteEquipment(equipmentId);
      alert('Equipment deleted successfully!');
    } catch (error) {
      console.error('Failed to delete equipment:', error);
      alert('Failed to delete equipment. Please try again.');
    } finally {
      setIsLoading(false);
      setDeleteConfirm(null);
    }
  };

  const handleAddToCart = async (equipment: any) => {
    if (!equipment.is_available) {
      alert('This equipment is not available for hire');
      return;
    }

    setAddingToCart(equipment.id);

    try {
      // Create universal sellable item for equipment hire
      const sellableItem = {
        id: equipment.id,
        type: 'equipment_hire' as const,
        sourceModule: 'hire' as const,
        name: equipment.asset_name,
        description: `Equipment hire: ${equipment.asset_name}`,
        unitPrice: parseFloat(equipment.hire_rate) || 0,
        quantity: 1,
        category: 'Equipment Hire',
        metadata: {
          equipment_id: equipment.id,
          hire_duration_days: 1, // Default 1 day, can be updated in cart
          asset_code: equipment.asset_code
        },
        business_id: '' // Will be set by backend based on auth
      };

      // Add to universal cart using POS engine
      posEngine.addItem(sellableItem);

      // Show success feedback
      console.log(`✅ Added "${equipment.asset_name}" to cart`);

      // Optional: Show toast notification here
      // toast.success(`Added ${equipment.asset_name} to cart`);

    } catch (error: any) {
      console.error('❌ Failed to add equipment to cart:', error);
      alert(`Failed to add equipment to cart: ${error.message}`);
    } finally {
      setAddingToCart(null);
    }
  };

  const getEquipmentStatus = (equipmentId: string) => {
    const isHired = activeHireBookings.some(booking => booking.equipment_id === equipmentId);
    return isHired ? 'Hired' : 'Available';
  };

  const getStatusColor = (status: string) => {
    return status === 'Hired' ? 'text-red-600 bg-red-100' : 'text-green-600 bg-green-100';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equipment Management</h1>
          <p className="text-gray-600">Manage your equipment assets and hire bookings</p>
        </div>
        <div className="space-x-3">
          <Link href="/dashboard/management/pos/cart">
            <Button variant="outline">
              View Cart
            </Button>
          </Link>
          <Link
            href="/dashboard/management/equipment/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Add Equipment
          </Link>
          <Link
            href="/dashboard/management/equipment/hire"
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            New Hire Booking
          </Link>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-blue-100 p-3 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Equipment</p>
              <p className="text-2xl font-bold text-gray-900">{equipment.length}</p>
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
              <p className="text-sm font-medium text-gray-600">Available</p>
              <p className="text-2xl font-bold text-gray-900">
                {equipment.filter(eq => eq.is_available).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-red-100 p-3 rounded-lg">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Currently Hired</p>
              <p className="text-2xl font-bold text-gray-900">{activeHireBookings.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-purple-100 p-3 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Value</p>
              <p className="text-2xl font-bold text-gray-900">
                {format(equipment.reduce((sum, eq) => sum + eq.current_value, 0))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Equipment List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Equipment List</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Equipment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hire Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Current Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {equipment.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No equipment found. <Link href="/dashboard/management/equipment/new" className="text-blue-600 hover:text-blue-800">Add your first equipment</Link>
                  </td>
                </tr>
              ) : (
                equipment.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{item.asset_name}</div>
                        <div className="text-sm text-gray-500">{item.asset_code}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(getEquipmentStatus(item.id))}`}>
                        {getEquipmentStatus(item.id)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(item.hire_rate)}/day
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(item.current_value)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.location}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <Button
                        onClick={() => handleAddToCart(item)}
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={!item.is_available || addingToCart === item.id}
                      >
                        {addingToCart === item.id ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Adding...
                          </span>
                        ) : (
                          item.is_available ? 'Add to Cart' : 'Unavailable'
                        )}
                      </Button>
                      <Link
                        href={`/dashboard/management/equipment/${item.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </Link>
                      <Link
                        href={`/dashboard/management/equipment/${item.id}/edit`}
                        className="text-yellow-600 hover:text-yellow-900"
                      >
                        Edit
                      </Link>
                      {getEquipmentStatus(item.id) === 'Available' && (
                        <button
                          onClick={() => handleDeleteEquipment(item.id, item.asset_name)}
                          disabled={isLoading}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        >
                          {isLoading && deleteConfirm === item.id ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                      {getEquipmentStatus(item.id) === 'Hired' && (
                        <span className="text-gray-400 cursor-not-allowed" title="Cannot delete hired equipment">
                          Delete
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

      {/* Active Hire Bookings */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Active Hire Bookings</h2>
          <Link
            href="/dashboard/management/equipment/hire"
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            View All Bookings
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Booking
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Equipment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hire Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {activeHireBookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No active hire bookings. <Link href="/dashboard/management/equipment/hire" className="text-blue-600 hover:text-blue-800">Create your first booking</Link>
                  </td>
                </tr>
              ) : (
                activeHireBookings.slice(0, 5).map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{booking.booking_number}</div>
                      <div className="text-sm text-gray-500">{booking.id.slice(-8)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {equipment.find(eq => eq.id === booking.equipment_id)?.asset_name || 'Unknown Equipment'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(booking.start_date).toLocaleDateString()} - {new Date(booking.end_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        booking.status === 'active' ? 'bg-blue-100 text-blue-800' :
                        booking.status === 'confirmed' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {booking.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(booking.total_amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <Link
                        href={`/dashboard/management/equipment/hire/${booking.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </Link>
                      <Link
                        href={`/dashboard/management/equipment/hire/${booking.id}/return`}
                        className="text-green-600 hover:text-green-900"
                      >
                        Return
                      </Link>
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
