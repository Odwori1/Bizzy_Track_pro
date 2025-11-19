'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

export const Breadcrumb = () => {
  const pathname = usePathname();
  
  const paths = pathname.split('/').filter(Boolean);
  
  const breadcrumbItems = paths.map((path, index) => {
    const href = '/' + paths.slice(0, index + 1).join('/');
    const isLast = index === paths.length - 1;
    const name = path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ');
    
    return {
      name,
      href: isLast ? undefined : href,
    };
  });

  // Add Dashboard as first item
  if (paths[0] !== 'dashboard') {
    breadcrumbItems.unshift({ name: 'Dashboard', href: '/dashboard' });
  }

  return (
    <nav className="flex" aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        {breadcrumbItems.map((item, index) => (
          <li key={item.name} className="flex items-center">
            {index > 0 && (
              <span className="text-gray-400 mx-2">/</span>
            )}
            {item.href ? (
              <Link
                href={item.href}
                className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                {item.name}
              </Link>
            ) : (
              <span className="text-sm font-medium text-gray-900">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};
