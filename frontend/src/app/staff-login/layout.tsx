import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Staff Login - Bizzy Track Pro',
  description: 'Staff login portal for Bizzy Track Pro',
};

export default function StaffLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {children}
    </div>
  );
}
