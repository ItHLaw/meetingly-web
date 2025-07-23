'use client';

import { useEffect } from 'react';
import { useMsal } from '@microsoft/msal-react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const { accounts } = useMsal();
  const router = useRouter();

  useEffect(() => {
    // Redirect based on authentication status
    if (accounts.length > 0) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [accounts, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}