'use client';

import { ReactNode } from 'react';
import { Breadcrumb, BreadcrumbItem } from './Breadcrumb';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: BreadcrumbItem[];
  actions?: ReactNode;
  tabs?: {
    name: string;
    href: string;
    current: boolean;
  }[];
  children?: ReactNode;
}

export function PageHeader({ 
  title, 
  subtitle, 
  breadcrumb, 
  actions, 
  tabs,
  children 
}: PageHeaderProps) {
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        {breadcrumb && (
          <div className="mb-4">
            <Breadcrumb items={breadcrumb} />
          </div>
        )}
        
        <div className="md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-gray-500">
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="mt-4 flex md:ml-4 md:mt-0">
              <div className="flex items-center space-x-3">
                {actions}
              </div>
            </div>
          )}
        </div>

        {tabs && (
          <div className="mt-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                {tabs.map((tab) => (
                  <a
                    key={tab.name}
                    href={tab.href}
                    className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                      tab.current
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    aria-current={tab.current ? 'page' : undefined}
                  >
                    {tab.name}
                  </a>
                ))}
              </nav>
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}