'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  permission: string;
}

interface NavigationSectionProps {
  title: string;
  items: NavItem[];
}

export const NavigationSection: React.FC<NavigationSectionProps> = ({ title, items }) => {
  const pathname = usePathname();

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        {title}
      </h3>
      <ul className="space-y-1">
        {items.map((item) => {
          const isActive = pathname === item.href;
          
          return (
            <li key={item.name}>
              <Link
                href={item.href}
                className={`
                  flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
                  ${isActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }
                `}
              >
                <span className="mr-3 text-lg">{item.icon}</span>
                {item.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
