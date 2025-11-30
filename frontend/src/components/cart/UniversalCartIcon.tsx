'use client';

import Link from 'next/link';
import { useUniversalCartStore } from '@/store/universal-cart-store';

export const UniversalCartIcon = () => {
  const totalItems = useUniversalCartStore(state => state.getTotalItems());

  return (
    <Link href="/dashboard/management/pos/cart" className="relative">
      <div className="flex items-center space-x-1 p-2 rounded-lg hover:bg-gray-100 transition-colors">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5.5M7 13l2.5 5.5m0 0L17 21" />
        </svg>
        {totalItems > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {totalItems}
          </span>
        )}
      </div>
    </Link>
  );
};
