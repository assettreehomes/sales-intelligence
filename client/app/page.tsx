'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        // User is logged in - redirect based on role
        if (profile?.role === 'superadmin' || profile?.role === 'admin') {
          router.replace('/admin');
        } else {
          // Default to employee for any logged-in user
          router.replace('/employee');
        }
      } else {
        // Not logged in
        router.replace('/login');
      }
    }
  }, [user, profile, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="animate-spin rounded-full h-10 w-10 border-3 border-purple-600 border-t-transparent"></div>
    </div>
  );
}
