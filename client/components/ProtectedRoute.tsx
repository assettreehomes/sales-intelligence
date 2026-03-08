'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface ProtectedRouteProps {
    children: ReactNode;
    allowedRoles?: ('superadmin' | 'admin' | 'employee' | 'intern')[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
    const { user, profile, loading, profileLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !profileLoading) {
            if (!user) {
                router.replace('/login');
                return;
            }

            if (allowedRoles && !profile) {
                router.replace('/login');
                return;
            }

            if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
                // Redirect to appropriate dashboard based on role
                if (profile.role === 'superadmin' || profile.role === 'admin') {
                    router.replace('/admin/performance');
                } else if (profile.role === 'intern') {
                    router.replace('/intern');
                } else {
                    router.replace('/login');
                }
            }
        }
    }, [user, profile, loading, profileLoading, allowedRoles, router]);

    if (loading || profileLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-10 w-10 border-3 border-purple-600 border-t-transparent"></div>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    if (allowedRoles && (!profile || !allowedRoles.includes(profile.role))) {
        return null;
    }

    return <>{children}</>;
}
