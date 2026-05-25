'use client';

import { Search } from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';
import { TicketsViewToggle } from './TicketsViewToggle';
import {
    ticketsHeaderClass,
    ticketsSearchInputClass,
    ticketsSubtitleClass,
    ticketsTitleClass,
} from './tickets-ui';

type ViewMode = 'sales' | 'presales';

interface TicketsPageHeaderProps {
    view: ViewMode;
    onViewChange: (view: ViewMode) => void;
    searchValue: string;
    onSearchChange: (value: string) => void;
    actions?: React.ReactNode;
    filterSlot?: React.ReactNode;
}

const TITLES: Record<ViewMode, string> = {
    sales: 'Sales Ticket Repository',
    presales: 'Pre-Sales Ticket Repository',
};

const SUBTITLES: Record<ViewMode, string> = {
    sales: 'Manage and monitor customer intelligence flow',
    presales: 'TeleCMI recordings · AI-analyzed',
};

const SEARCH_PLACEHOLDERS: Record<ViewMode, string> = {
    sales: 'Search by Client ID or Client Name',
    presales: 'Search by phone, lead ID, agent, or team…',
};

export function TicketsPageHeader({
    view,
    onViewChange,
    searchValue,
    onSearchChange,
    actions,
    filterSlot,
}: TicketsPageHeaderProps) {
    return (
        <header className={ticketsHeaderClass}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 shrink-0">
                    <h1 className={ticketsTitleClass}>{TITLES[view]}</h1>
                    <p className={ticketsSubtitleClass}>{SUBTITLES[view]}</p>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end xl:max-w-3xl">
                    <div className="relative min-w-0 flex-1 sm:max-w-md">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                        <input
                            type="search"
                            value={searchValue}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder={SEARCH_PLACEHOLDERS[view]}
                            className={ticketsSearchInputClass}
                            aria-label={SEARCH_PLACEHOLDERS[view]}
                        />
                    </div>

                    <div className="flex h-10 shrink-0 flex-wrap items-center justify-end gap-2">
                        {actions}
                        <TicketsViewToggle view={view} onChange={onViewChange} compact />
                        <NotificationBell />
                    </div>
                </div>
            </div>

            {filterSlot ? (
                <div className="mt-4 border-t border-gray-100 pt-4 dark:border-slate-800">
                    {filterSlot}
                </div>
            ) : null}
        </header>
    );
}
