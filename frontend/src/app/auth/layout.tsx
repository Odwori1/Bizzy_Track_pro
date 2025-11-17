import { AuthLayout } from '@/components/layout/AuthLayout';

export default function AuthRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthLayout title="Welcome to Bizzy Track Pro">
      {children}
    </AuthLayout>
  );
}
