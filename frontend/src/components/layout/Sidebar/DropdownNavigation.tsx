'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface DropdownItem {
  name: string;
  href: string;
  icon: string;
  permission: string;
}

interface DropdownNavigationProps {
  title: string;
  icon: string;
  mainHref: string;
  items: DropdownItem[];
  color: string;
}

export const DropdownNavigation: React.FC<DropdownNavigationProps> = ({
  title,
  icon,
  mainHref,
  items,
  color
}) => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Check if any item or main href is active
  const isActive = pathname === mainHref ||
                  pathname.startsWith(mainHref + '/') ||
                  items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'));

  // Color mapping - COMPLETE to match all colors from index.tsx
  const getColorClass = (type: 'active' | 'inactive' | 'dropdown' | 'itemActive' | 'itemInactive') => {
    const baseClasses: Record<string, Record<string, string>> = {
      gray: {
        active: 'bg-gray-100 text-gray-900 border-gray-300',
        inactive: 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
        dropdown: 'border-gray-200',
        itemActive: 'bg-gray-100 text-gray-900',
        itemInactive: 'text-gray-700 hover:bg-gray-50'
      },
      green: {
        active: 'bg-green-50 text-green-700 border-green-200',
        inactive: 'text-gray-700 hover:bg-green-50 hover:text-green-700',
        dropdown: 'border-green-200',
        itemActive: 'bg-green-100 text-green-700',
        itemInactive: 'text-gray-700 hover:bg-green-50'
      },
      blue: {
        active: 'bg-blue-50 text-blue-700 border-blue-200',
        inactive: 'text-gray-700 hover:bg-blue-50 hover:text-blue-700',
        dropdown: 'border-blue-200',
        itemActive: 'bg-blue-100 text-blue-700',
        itemInactive: 'text-gray-700 hover:bg-blue-50'
      },
      purple: {
        active: 'bg-purple-50 text-purple-700 border-purple-200',
        inactive: 'text-gray-700 hover:bg-purple-50 hover:text-purple-700',
        dropdown: 'border-purple-200',
        itemActive: 'bg-purple-100 text-purple-700',
        itemInactive: 'text-gray-700 hover:bg-purple-50'
      },
      orange: {
        active: 'bg-orange-50 text-orange-700 border-orange-200',
        inactive: 'text-gray-700 hover:bg-orange-50 hover:text-orange-700',
        dropdown: 'border-orange-200',
        itemActive: 'bg-orange-100 text-orange-700',
        itemInactive: 'text-gray-700 hover:bg-orange-50'
      },
      indigo: {
        active: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        inactive: 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700',
        dropdown: 'border-indigo-200',
        itemActive: 'bg-indigo-100 text-indigo-700',
        itemInactive: 'text-gray-700 hover:bg-indigo-50'
      },
      teal: {
        active: 'bg-teal-50 text-teal-700 border-teal-200',
        inactive: 'text-gray-700 hover:bg-teal-50 hover:text-teal-700',
        dropdown: 'border-teal-200',
        itemActive: 'bg-teal-100 text-teal-700',
        itemInactive: 'text-gray-700 hover:bg-teal-50'
      },
      emerald: {
        active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        inactive: 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-700',
        dropdown: 'border-emerald-200',
        itemActive: 'bg-emerald-100 text-emerald-700',
        itemInactive: 'text-gray-700 hover:bg-emerald-50'
      },
      amber: {
        active: 'bg-amber-50 text-amber-700 border-amber-200',
        inactive: 'text-gray-700 hover:bg-amber-50 hover:text-amber-700',
        dropdown: 'border-amber-200',
        itemActive: 'bg-amber-100 text-amber-700',
        itemInactive: 'text-gray-700 hover:bg-amber-50'
      },
      red: {
        active: 'bg-red-50 text-red-700 border-red-200',
        inactive: 'text-gray-700 hover:bg-red-50 hover:text-red-700',
        dropdown: 'border-red-200',
        itemActive: 'bg-red-100 text-red-700',
        itemInactive: 'text-gray-700 hover:bg-red-50'
      }
    };

    const colorMap = baseClasses[color] || baseClasses.gray;
    return colorMap[type] || '';
  };

  // Get active dot color
  const getActiveDotColor = () => {
    switch (color) {
      case 'gray': return 'bg-gray-600';
      case 'green': return 'bg-green-600';
      case 'blue': return 'bg-blue-600';
      case 'purple': return 'bg-purple-600';
      case 'orange': return 'bg-orange-600';
      case 'indigo': return 'bg-indigo-600';
      case 'teal': return 'bg-teal-600';
      case 'emerald': return 'bg-emerald-600';
      case 'amber': return 'bg-amber-600';
      case 'red': return 'bg-red-600';
      default: return 'bg-gray-600';
    }
  };

  return (
    <div>
      {/* Dropdown Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 mb-1
          ${isActive ? getColorClass('active') : getColorClass('inactive')}
          ${isActive ? 'border shadow-sm' : 'hover:shadow-sm'}
        `}
      >
        <div className="flex items-center">
          <span className="mr-3 text-lg">{icon}</span>
          <span className="flex-1 text-left">{title}</span>
        </div>
        <div className="flex items-center">
          {isActive && (
            <div className={`w-2 h-2 rounded-full mr-2 ${getActiveDotColor()}`}></div>
          )}
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Dropdown Content */}
      {isOpen && (
        <div className={`ml-3 pl-4 border-l-2 ${getColorClass('dropdown')}`}>
          <ul className="space-y-1 py-1">
            {items.map((item) => {
              const isItemActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={`
                      flex items-center px-3 py-1.5 text-sm rounded-lg transition-colors
                      ${isItemActive ? getColorClass('itemActive') : getColorClass('itemInactive')}
                    `}
                  >
                    <span className="mr-2">{item.icon}</span>
                    <span>{item.name}</span>
                    {isItemActive && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-current"></div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
