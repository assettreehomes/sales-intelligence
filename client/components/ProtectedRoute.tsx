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
    const { user, profile, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.replace('/login');
                return;
            }

            if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
                // Redirect to appropriate dashboard based on role
                if (profile.role === 'superadmin' || profile.role === 'admin') {
                    router.replace('/admin');
                } else {
                    router.replace('/employee');
                }
            }
        }
    }, [user, profile, loading, allowedRoles, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-10 w-10 border-3 border-purple-600 border-t-transparent"></div>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
        return null;
    }

    return <>{children}</>;
}
