'use client';

import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Toaster } from 'react-hot-toast';
import { NotificationSystem } from '@/components/notifications/NotificationSystem';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { OfflineStatus } from '@/components/OfflineStatus';
import { setupGlobalErrorHandling } from '@/lib/errorHandling';

// Initialize global error handling
if (typeof window !== 'undefined') {
  setupGlobalErrorHandling();
}

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ErrorBoundary>
          <AuthProvider>
            <div id="root">{children}</div>
            <Toaster position="top-right" />
            <NotificationSystem />
            <OfflineStatus />
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}