'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { useTicketsStore } from '@/stores/ticketsStore';
import { usePresalesStore } from '@/stores/presalesStore';
import { TicketsPageHeader } from './components/TicketsPageHeader';
import SalesView from './SalesView';
import PresalesView from './PresalesView';
import { TicketsHeaderActions } from './TicketsHeaderActions';
import { SalesFiltersSection } from './SalesFiltersSection';
import { PresalesFiltersSection } from './PresalesFiltersSection';

function TicketsPageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [view, setView] = useState<'sales' | 'presales'>('sales');
    const salesStoreQuery = useTicketsStore((s) => s.filters.searchQuery);
    const presalesStoreQuery = usePresalesStore((s) => s.filters.searchQuery);
    const [salesSearch, setSalesSearch] = useState(salesStoreQuery);
    const [presalesSearch, setPresalesSearch] = useState(presalesStoreQuery);

    useEffect(() => {
        if (searchParams.get('view') === 'presales') {
            setView('presales');
        }
    }, [searchParams]);

    useEffect(() => {
        if (view === 'sales') {
            setSalesSearch(salesStoreQuery);
        } else {
            setPresalesSearch(presalesStoreQuery);
        }
    }, [view, salesStoreQuery, presalesStoreQuery]);

    const handleViewChange = useCallback((next: 'sales' | 'presales') => {
        setView(next);
        const params = new URLSearchParams(searchParams.toString());
        if (next === 'presales') {
            params.set('view', 'presales');
        } else {
            params.delete('view');
        }
        const query = params.toString();
        router.replace(query ? `/admin/tickets?${query}` : '/admin/tickets', { scroll: false });
    }, [router, searchParams]);

    const isSales = view === 'sales';

    return (
        <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
            <AdminShell activeSection="tickets">
                <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
                    <TicketsPageHeader
                        view={view}
                        onViewChange={handleViewChange}
                        searchValue={isSales ? salesSearch : presalesSearch}
                        onSearchChange={isSales ? setSalesSearch : setPresalesSearch}
                        actions={<TicketsHeaderActions view={view} />}
                        filterSlot={
                            isSales ? (
                                <SalesFiltersSection setSearchInput={setSalesSearch} />
                            ) : (
                                <PresalesFiltersSection setSearchInput={setPresalesSearch} />
                            )
                        }
                    />
                    {isSales ? (
                        <SalesView searchInput={salesSearch} setSearchInput={setSalesSearch} />
                    ) : (
                        <PresalesView searchInput={presalesSearch} setSearchInput={setPresalesSearch} />
                    )}
                </div>
            </AdminShell>
        </ProtectedRoute>
    );
}

export default function TicketsPage() {
    return (
        <Suspense fallback={null}>
            <TicketsPageContent />
        </Suspense>
    );
}
