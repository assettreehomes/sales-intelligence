'use client';

import { Loader2, RefreshCcw } from 'lucide-react';
import { usePresalesStore } from '@/stores/presalesStore';
import { SendReportButton } from './SendReportButton';

type ViewMode = 'sales' | 'presales';

interface TicketsHeaderActionsProps {
    view: ViewMode;
}

export function TicketsHeaderActions({ view }: TicketsHeaderActionsProps) {
    const { syncing, syncTeleCMI } = usePresalesStore();

    return (
        <>
            <SendReportButton />
            {view === 'presales' ? (
                <button
                    type="button"
                    onClick={() => syncTeleCMI()}
                    disabled={syncing}
                    className="flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60 dark:bg-violet-500 dark:hover:bg-violet-400"
                >
                    {syncing ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Syncing…
                        </>
                    ) : (
                        <>
                            <RefreshCcw className="h-4 w-4" /> Sync TeleCMI
                        </>
                    )}
                </button>
            ) : null}
        </>
    );
}
