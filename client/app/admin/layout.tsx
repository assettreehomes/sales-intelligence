import type { ReactNode } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
            {children}
        </ProtectedRoute>
    );
}
