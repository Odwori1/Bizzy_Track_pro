'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEquipmentStore } from '@/store/week6/equipment-store';

export default function NewHireBookingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const equipmentId = searchParams.get('equipmentId');

  const { equipment, customers, createHireBooking, fetchAvailableEquipment, fetchCustomers } = useEquipmentStore();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchAvailableEquipment();
    fetchCustomers();
  }, [fetchAvailableEquipment, fetchCustomers]);

  const [formData, setFormData] = useState({
    equipment_asset_id: equipmentId || '',
    customer_id: '',
    hire_start_date: new Date().toISOString().split('T')[0],
    hire_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    hire_rate: 0,
    total_amount: 0,
    deposit_paid: 0,
    status: 'reserved',
    pre_hire_condition: 'Equipment in good condition',
  });

  const selectedEquipment = equipment.find(eq => eq.id === formData.equipment_asset_id);

  useEffect(() => {
    if (selectedEquipment) {
      setFormData(prev => ({
        ...prev,
        hire_rate: selectedEquipment.hire_rate,
        deposit_paid: selectedEquipment.deposit_amount
      }));
    }
  }, [selectedEquipment]);

  const calculateTotalAmount = () => {
    if (!selectedEquipment) return 0;

    const start = new Date(formData.hire_start_date);
    const end = new Date(formData.hire_end_date);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    return days * selectedEquipment.hire_rate;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.customer_id) {
      alert('Please select a customer');
      return;
    }

    if (!formData.equipment_asset_id) {
      alert('Please select equipment');
      return;
    }

    setIsLoading(true);

    try {
      const totalAmount = calculateTotalAmount();
      const bookingData = {
        equipment_asset_id: formData.equipment_asset_id,
        customer_id: formData.customer_id,
        hire_start_date: formData.hire_start_date,
        hire_end_date: formData.hire_end_date,
        hire_rate: formData.hire_rate,
        total_amount: totalAmount,
        deposit_paid: formData.deposit_paid,
        status: 'reserved',
        pre_hire_condition: formData.pre_hire_condition
      };

      console.log('Submitting booking data:', bookingData);
      await createHireBooking(bookingData);
      alert('Booking created successfully!');
      router.push('/dashboard/management/equipment');
    } catch (error) {
      console.error('Failed to create hire booking:', error);
      alert('Failed to create booking. Please check the console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const totalAmount = calculateTotalAmount();
  const days = Math.ceil((new Date(formData.hire_end_date).getTime() - new Date(formData.hire_start_date).getTime()) / (1000 * 60 * 60 * 24));

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
          <h1 className="text-2xl font-bold text-gray-900">New Hire Booking</h1>
          <p className="text-gray-600">Create a new equipment hire booking</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Equipment Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Equipment *
                </label>
                <select
                  value={formData.equipment_asset_id}
                  onChange={(e) => handleChange('equipment_asset_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select Equipment</option>
                  {equipment
                    .filter(eq => eq.is_available)
                    .map(eq => (
                      <option key={eq.id} value={eq.id}>
                        {eq.asset_name} - ${eq.hire_rate}/day
                      </option>
                    ))
                  }
                </select>
                {equipment.filter(eq => eq.is_available).length === 0 && (
                  <p className="text-sm text-red-600 mt-1">No available equipment found</p>
                )}
              </div>

              {/* Customer Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Customer *
                </label>
                <select
                  value={formData.customer_id}
                  onChange={(e) => handleChange('customer_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select Customer</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} {customer.email ? `(${customer.email})` : ''}
                    </option>
                  ))}
                </select>
                {customers.length === 0 && (
                  <p className="text-sm text-yellow-600 mt-1">
                    Loading customers...
                  </p>
                )}
              </div>

              {/* Hire Period */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.hire_start_date}
                    onChange={(e) => handleChange('hire_start_date', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formData.hire_end_date}
                    onChange={(e) => handleChange('hire_end_date', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Hire Rate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hire Rate ($/day) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.hire_rate}
                  onChange={(e) => handleChange('hire_rate', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Deposit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Deposit Paid
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.deposit_paid}
                  onChange={(e) => handleChange('deposit_paid', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={selectedEquipment ? `Recommended: $${selectedEquipment.deposit_amount}` : '0'}
                />
              </div>

              {/* Condition Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pre-Hire Condition Notes
                </label>
                <textarea
                  value={formData.pre_hire_condition}
                  onChange={(e) => handleChange('pre_hire_condition', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe the equipment condition before hire..."
                />
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
                  disabled={isLoading || !formData.equipment_asset_id || !formData.customer_id}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? 'Creating...' : 'Create Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Booking Summary */}
        <div className="space-y-6">
          {selectedEquipment && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Booking Summary</h3>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Equipment</span>
                  <span className="text-sm font-medium">{selectedEquipment.asset_name}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Hire Rate</span>
                  <span className="text-sm font-medium">${selectedEquipment.hire_rate}/day</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Hire Period</span>
                  <span className="text-sm font-medium">{days} days</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Deposit Required</span>
                  <span className="text-sm font-medium">${selectedEquipment.deposit_amount}</span>
                </div>

                <div className="border-t pt-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-900">Total Amount</span>
                    <span className="text-lg font-bold text-green-600">${totalAmount}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-800 mb-2">Booking Information</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Bookings are confirmed upon deposit payment</li>
              <li>• Equipment must be returned in same condition</li>
              <li>• Late returns incur additional charges</li>
              <li>• Damage charges apply for any damages</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
