'use client';

import { ReactNode } from 'react';
import { Navigation } from './Navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  fullWidth?: boolean;
}

export function AppLayout({ 
  children, 
  title, 
  subtitle, 
  actions, 
  fullWidth = false 
}: AppLayoutProps) {
  return (
    <ProtectedRoute>
      <ErrorBoundary>
        <div className="min-h-screen bg-gray-50">
          <Navigation />
          
          {/* Main content */}
          <main className="lg:pl-72">
            {/* Page header */}
            {(title || subtitle || actions) && (
              <div className="bg-white border-b border-gray-200">
                <div className={`px-4 py-6 sm:px-6 lg:px-8 ${fullWidth ? '' : 'max-w-7xl mx-auto'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      {title && (
                        <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                          {title}
                        </h1>
                      )}
                      {subtitle && (
                        <p className="mt-1 text-sm text-gray-500">
                          {subtitle}
                        </p>
                      )}
                    </div>
                    {actions && (
                      <div className="flex items-center space-x-3">
                        {actions}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Page content */}
            <div className={`px-4 py-6 sm:px-6 lg:px-8 ${fullWidth ? '' : 'max-w-7xl mx-auto'}`}>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </ErrorBoundary>
    </ProtectedRoute>
  );
}