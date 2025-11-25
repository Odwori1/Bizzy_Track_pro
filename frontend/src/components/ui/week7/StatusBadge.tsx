'use client';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const getStatusConfig = (status: string) => {
    const configs: { [key: string]: { color: string; bgColor: string; label: string } } = {
      // Expense Statuses
      draft: { color: 'text-gray-800', bgColor: 'bg-gray-100', label: 'Draft' },
      submitted: { color: 'text-blue-800', bgColor: 'bg-blue-100', label: 'Submitted' },
      approved: { color: 'text-green-800', bgColor: 'bg-green-100', label: 'Approved' },
      rejected: { color: 'text-red-800', bgColor: 'bg-red-100', label: 'Rejected' },
      paid: { color: 'text-purple-800', bgColor: 'bg-purple-100', label: 'Paid' },
      
      // Inventory Statuses
      'in-stock': { color: 'text-green-800', bgColor: 'bg-green-100', label: 'In Stock' },
      'low-stock': { color: 'text-yellow-800', bgColor: 'bg-yellow-100', label: 'Low Stock' },
      'out-of-stock': { color: 'text-red-800', bgColor: 'bg-red-100', label: 'Out of Stock' },
      
      // Transaction Types
      income: { color: 'text-green-800', bgColor: 'bg-green-100', label: 'Income' },
      expense: { color: 'text-red-800', bgColor: 'bg-red-100', label: 'Expense' },
      
      // Default
      active: { color: 'text-green-800', bgColor: 'bg-green-100', label: 'Active' },
      inactive: { color: 'text-gray-800', bgColor: 'bg-gray-100', label: 'Inactive' },
      pending: { color: 'text-yellow-800', bgColor: 'bg-yellow-100', label: 'Pending' },
    };

    return configs[status] || { color: 'text-gray-800', bgColor: 'bg-gray-100', label: status };
  };

  const config = getStatusConfig(status);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color} ${config.bgColor} ${className}`}
    >
      {config.label}
    </span>
  );
}
