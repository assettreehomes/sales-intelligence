'use client';

import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react';
import { ticketsFilterBoxClass, ticketsFilterLabelClass } from './tickets-ui';

interface TicketsSortButtonsProps {
    sortOrder: 'asc' | 'desc';
    onSortChange: (order: 'asc' | 'desc') => void;
}

export function TicketsSortButtons({ sortOrder, onSortChange }: TicketsSortButtonsProps) {
    return (
        <div className={`${ticketsFilterBoxClass} sm:w-auto`}>
            <span className={ticketsFilterLabelClass}>Sort</span>
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    title="Newest first"
                    aria-label="Newest first"
                    onClick={() => onSortChange('desc')}
                    className={`cursor-pointer rounded-md border p-1.5 transition-colors ${
                        sortOrder === 'desc'
                            ? 'border-purple-300 bg-purple-50 text-purple-700 dark:border-violet-500 dark:bg-violet-500/20 dark:text-violet-300'
                            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                >
                    <ArrowDownAZ className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    title="Oldest first"
                    aria-label="Oldest first"
                    onClick={() => onSortChange('asc')}
                    className={`cursor-pointer rounded-md border p-1.5 transition-colors ${
                        sortOrder === 'asc'
                            ? 'border-purple-300 bg-purple-50 text-purple-700 dark:border-violet-500 dark:bg-violet-500/20 dark:text-violet-300'
                            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                >
                    <ArrowUpAZ className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
