'use client';

import Link from 'next/link';
import { EquipmentAsset } from '@/types/assets';

interface EquipmentCardProps {
  equipment: EquipmentAsset;
  showActions?: boolean;
}

export const EquipmentCard: React.FC<EquipmentCardProps> = ({ 
  equipment, 
  showActions = true 
}) => {
  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'excellent': return 'bg-green-100 text-green-800';
      case 'good': return 'bg-blue-100 text-blue-800';
      case 'fair': return 'bg-yellow-100 text-yellow-800';
      case 'poor': return 'bg-orange-100 text-orange-800';
      case 'broken': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (isAvailable: boolean) => {
    return isAvailable 
      ? 'bg-green-100 text-green-800' 
      : 'bg-red-100 text-red-800';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      {/* Equipment Image/Photo */}
      <div className="h-48 bg-gray-100 rounded-t-lg flex items-center justify-center">
        {equipment.photos && equipment.photos.length > 0 ? (
          <img 
            src={equipment.photos[0]} 
            alt={equipment.asset_name}
            className="h-full w-full object-cover rounded-t-lg"
          />
        ) : (
          <div className="text-gray-400 text-center">
            <div className="text-4xl mb-2">🔌</div>
            <div className="text-sm">No Image</div>
          </div>
        )}
      </div>

      {/* Equipment Details */}
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold text-gray-900 text-lg">{equipment.asset_name}</h3>
          <div className="flex space-x-2">
            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(equipment.is_available)}`}>
              {equipment.is_available ? 'Available' : 'Hired Out'}
            </span>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Category:</span>
            <span className="text-gray-900 font-medium capitalize">{equipment.category}</span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Serial No:</span>
            <span className="text-gray-900 font-mono">{equipment.serial_number}</span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Condition:</span>
            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getConditionColor(equipment.condition_status)}`}>
              {equipment.condition_status}
            </span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Hire Rate:</span>
            <span className="text-gray-900 font-bold">${equipment.hire_rate}/day</span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Deposit:</span>
            <span className="text-gray-900">${equipment.deposit_amount}</span>
          </div>
        </div>

        {equipment.description && (
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">
            {equipment.description}
          </p>
        )}

        {/* Actions */}
        {showActions && (
          <div className="flex space-x-2 pt-3 border-t border-gray-100">
            <Link
              href={`/dashboard/management/equipment/${equipment.id}`}
              className="flex-1 bg-blue-50 text-blue-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-blue-100 transition-colors"
            >
              View Details
            </Link>
            
            {equipment.is_available && (
              <Link
                href={`/dashboard/management/equipment/hire?equipmentId=${equipment.id}`}
                className="flex-1 bg-green-50 text-green-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-green-100 transition-colors"
              >
                Hire Now
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
