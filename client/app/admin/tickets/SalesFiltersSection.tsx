'use client';

import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, ChevronDown, Users, Check } from 'lucide-react';
import { useTicketsStore } from '@/stores/ticketsStore';
import { Avatar } from '@/components/Avatar';
import { TicketsFilterSelect } from './components/TicketsFilterSelect';
import { TicketsSortButtons } from './components/TicketsSortButtons';
import {
    filterLabelClass,
    filterOptionClass,
    filterPanelClass,
    filterTriggerInlineClass,
    filterValueClass,
} from '@/components/filter-ui';
import {
    ticketsClearFiltersClass,
    ticketsFilterBoxClass,
} from './components/tickets-ui';

const STATUS_OPTIONS = [
    { value: 'all', label: 'All Status' },
    { value: 'draft', label: 'Draft' },
    { value: 'uploading', label: 'Uploading' },
    { value: 'uploaded', label: 'Uploaded' },
    { value: 'pending', label: 'Pending' },
    { value: 'processing', label: 'Processing' },
    { value: 'analyzed', label: 'Analyzed' },
    { value: 'analysis_failed', label: 'Failed' },
];

const DATE_OPTIONS = [
    { value: 'today', label: 'Today' },
    { value: '7days', label: 'Last 7 Days' },
    { value: '30days', label: 'Last 30 Days' },
    { value: '60days', label: 'Last 2 Months' },
    { value: 'custom', label: 'Custom Range' },
    { value: 'all', label: 'All Time' },
];

const RATING_OPTIONS = [
    { value: 'all', label: 'All Ratings' },
    { value: '4plus', label: '4★ & Up' },
    { value: '3plus', label: '3★ & Up' },
    { value: '2plus', label: '2★ & Up' },
    { value: '1plus', label: '1★ & Up' },
    { value: 'below2', label: 'Below 2★' },
    { value: 'unrated', label: 'Unrated' },
];

interface SalesFiltersSectionProps {
    setSearchInput: (value: string) => void;
}

export function SalesFiltersSection({ setSearchInput }: SalesFiltersSectionProps) {
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
    const agentDropdownRef = useRef<HTMLDivElement>(null);

    const { employees, filters, setFilter, clearFilters, fetchEmployees, employeesLoaded } = useTicketsStore();

    useEffect(() => {
        if (!employeesLoaded) fetchEmployees();
    }, [employeesLoaded, fetchEmployees]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (agentDropdownRef.current && !agentDropdownRef.current.contains(event.target as Node)) {
                setAgentDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDateFilterChange = (value: string) => {
        setFilter('dateFilter', value);
        if (value !== 'custom') {
            setFilter('customDateFrom', '');
            setFilter('customDateTo', '');
        }
    };

    const handleClearFilters = () => {
        setSearchInput('');
        clearFilters();
    };

    const dateInputClass =
        'rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

    return (
        <>
            <button
                type="button"
                onClick={() => setMobileFiltersOpen((prev) => !prev)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-700 md:hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
            </button>

            <div className="hidden flex-wrap items-center gap-3 md:flex">
                <label className={`${ticketsFilterBoxClass} cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 sm:w-auto`}>
                    <div
                        role="switch"
                        aria-checked={filters.showLiveOnly}
                        onClick={() => setFilter('showLiveOnly', !filters.showLiveOnly)}
                        className={`relative h-5 w-10 shrink-0 rounded-full transition-colors ${filters.showLiveOnly ? 'bg-purple-600' : 'bg-gray-300 dark:bg-slate-600'}`}
                    >
                        <div
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${filters.showLiveOnly ? 'translate-x-5' : 'translate-x-0.5'}`}
                        />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-slate-200">Show Live Only</span>
                </label>

                <label className={`${ticketsFilterBoxClass} cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 sm:w-auto`}>
                    <div
                        role="switch"
                        aria-checked={filters.showFlaggedOnly}
                        onClick={() => setFilter('showFlaggedOnly', !filters.showFlaggedOnly)}
                        className={`relative h-5 w-10 shrink-0 rounded-full transition-colors ${filters.showFlaggedOnly ? 'bg-red-500' : 'bg-gray-300 dark:bg-slate-600'}`}
                    >
                        <div
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${filters.showFlaggedOnly ? 'translate-x-5' : 'translate-x-0.5'}`}
                        />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-slate-200">🚩 Flagged Only</span>
                </label>

                <TicketsFilterSelect
                    label="Status"
                    value={filters.statusFilter}
                    onChange={(v) => setFilter('statusFilter', v)}
                    options={STATUS_OPTIONS}
                />
                <TicketsFilterSelect
                    label="Date"
                    value={filters.dateFilter}
                    onChange={handleDateFilterChange}
                    options={DATE_OPTIONS}
                />
                <TicketsSortButtons
                    sortOrder={filters.sortOrder}
                    onSortChange={(order) => setFilter('sortOrder', order)}
                />
                <TicketsFilterSelect
                    label="Rating"
                    value={filters.ratingFilter}
                    onChange={(v) => setFilter('ratingFilter', v)}
                    options={RATING_OPTIONS}
                />

                {filters.dateFilter === 'custom' && (
                    <div className={`${ticketsFilterBoxClass} flex-wrap`}>
                        <span className={filterLabelClass}>From</span>
                        <input
                            type="date"
                            value={filters.customDateFrom}
                            onChange={(e) => setFilter('customDateFrom', e.target.value)}
                            className={dateInputClass}
                        />
                        <span className={filterLabelClass}>To</span>
                        <input
                            type="date"
                            value={filters.customDateTo}
                            onChange={(e) => setFilter('customDateTo', e.target.value)}
                            className={dateInputClass}
                        />
                    </div>
                )}

                <div className="relative" ref={agentDropdownRef}>
                    <button
                        type="button"
                        onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                        className={`${filterTriggerInlineClass} w-full justify-between sm:min-w-[11rem] sm:max-w-[13rem]`}
                    >
                        <div className="flex min-w-0 items-center gap-2 truncate">
                            <span className={filterLabelClass}>Agent</span>
                            {filters.agentFilter === 'all' ? (
                                <span className={filterValueClass}>All Agents</span>
                            ) : (
                                <div className="flex min-w-0 items-center gap-2">
                                    <Avatar
                                        name={employees.find((e) => e.id === filters.agentFilter)?.fullname || ''}
                                        src={employees.find((e) => e.id === filters.agentFilter)?.avatar_url}
                                        size="xs"
                                    />
                                    <span className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">
                                        {employees.find((e) => e.id === filters.agentFilter)?.fullname || 'Unknown'}
                                    </span>
                                </div>
                            )}
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 dark:text-slate-500" />
                    </button>
                    {agentDropdownOpen && (
                        <div className={`${filterPanelClass} right-0 z-[100] mt-1.5 max-h-80 w-72 min-w-full`}>
                            <button
                                type="button"
                                className={`${filterOptionClass(filters.agentFilter === 'all')} flex items-center gap-3`}
                                onClick={() => {
                                    setFilter('agentFilter', 'all');
                                    setAgentDropdownOpen(false);
                                }}
                            >
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-800">
                                    <Users className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                                </div>
                                <span className="flex-1 text-sm font-medium">All Agents</span>
                                {filters.agentFilter === 'all' && <Check className="h-4 w-4" />}
                            </button>
                            <div className="my-1 border-t border-gray-100 dark:border-slate-700" />
                            {employees.map((emp) => (
                                <button
                                    key={emp.id}
                                    type="button"
                                    className={`${filterOptionClass(filters.agentFilter === emp.id)} flex items-center gap-3`}
                                    onClick={() => {
                                        setFilter('agentFilter', emp.id);
                                        setAgentDropdownOpen(false);
                                    }}
                                >
                                    <Avatar name={emp.fullname} src={emp.avatar_url} size="sm" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{emp.fullname}</p>
                                        <p className="truncate text-xs text-gray-400 dark:text-slate-500">{emp.email}</p>
                                    </div>
                                    {filters.agentFilter === emp.id && <Check className="h-4 w-4 shrink-0" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <button type="button" onClick={handleClearFilters} className={`${ticketsClearFiltersClass} sm:ml-auto`}>
                    Clear Filters
                </button>
            </div>

            {mobileFiltersOpen && (
                <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 md:hidden dark:border-slate-700 dark:bg-slate-900">
                    {/* Mobile filters simplified — reuse desktop controls stacked */}
                    <TicketsFilterSelect
                        label="Status"
                        value={filters.statusFilter}
                        onChange={(v) => setFilter('statusFilter', v)}
                        options={STATUS_OPTIONS}
                        className="w-full"
                    />
                    <TicketsFilterSelect
                        label="Date"
                        value={filters.dateFilter}
                        onChange={handleDateFilterChange}
                        options={DATE_OPTIONS}
                        className="w-full"
                    />
                    <TicketsSortButtons
                        sortOrder={filters.sortOrder}
                        onSortChange={(order) => setFilter('sortOrder', order)}
                    />
                    <button type="button" onClick={() => { handleClearFilters(); setMobileFiltersOpen(false); }} className={ticketsClearFiltersClass}>
                        Clear Filters
                    </button>
                </div>
            )}
        </>
    );
}
