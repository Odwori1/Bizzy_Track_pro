import './globals.css';
import { Inter } from 'next/font/google';
import { AuthInitializer } from '@/components/AuthInitializer';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Bizzy Track Pro',
  description: 'Professional business management platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthInitializer />
        <div className="min-h-screen bg-gray-50">
          {children}
        </div>
      </body>
    </html>
  );
}
