'use client';

import { useState } from 'react';
import { useAuth } from './auth/AuthProvider';
import { Button } from './ui/button';
import { useRouter } from 'next/navigation';
import { notify } from '@/services/notificationService';

interface UserProfileProps {
  showFullProfile?: boolean;
  className?: string;
}

export const UserProfile: React.FC<UserProfileProps> = ({ 
  showFullProfile = true, 
  className = '' 
}) => {
  const { user, logout, isAuthenticated } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!isAuthenticated || !user) {
    return null;
  }

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
      notify.success('Successfully signed out');
      router.push('/login');
    } catch (error) {
      notify.apiError(error, {
        action: 'logout',
        component: 'UserProfile'
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!showFullProfile) {
    // Compact user display (e.g., for header)
    return (
      <div className={`flex items-center space-x-3 ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium text-gray-700 hidden md:inline">
            {user.name}
          </span>
        </div>
        <Button
          onClick={handleLogout}
          disabled={isLoggingOut}
          variant="outline"
          size="sm"
          className="text-gray-600 hover:text-gray-800"
        >
          {isLoggingOut ? 'Signing out...' : 'Sign out'}
        </Button>
      </div>
    );
  }

  // Full profile display
  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold mx-auto mb-4">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <h2 className="text-xl font-semibold text-gray-900">{user.name}</h2>
        <p className="text-gray-600">{user.email}</p>
      </div>

      <div className="space-y-3 mb-6">
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-gray-600">User ID:</span>
          <span className="text-gray-900 font-mono text-sm">{user.id}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-gray-600">Tenant ID:</span>
          <span className="text-gray-900 font-mono text-sm">{user.tenant_id}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-gray-600">Member since:</span>
          <span className="text-gray-900">
            {new Date(user.created_at).toLocaleDateString()}
          </span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-gray-600">Status:</span>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            user.is_active 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {user.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      <Button
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="w-full bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoggingOut ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Signing out...
          </div>
        ) : (
          'Sign out'
        )}
      </Button>
    </div>
  );
};

export default UserProfile;