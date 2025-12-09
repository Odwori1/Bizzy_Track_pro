'use client';

import { ReactNode } from 'react';
import { StaffHeader } from '@/components/staff/StaffHeader';

interface StaffLayoutProps {
  children: ReactNode;
}

export default function StaffLayout({ children }: StaffLayoutProps) {
  return (
    <div className="space-y-6">
      <StaffHeader />
      <div className="bg-white rounded-lg shadow">
        {children}
      </div>
    </div>
  );
}
