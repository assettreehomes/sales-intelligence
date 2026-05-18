'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Users, Check } from 'lucide-react';
import { usePresalesStore } from '@/stores/presalesStore';
import { TicketsFilterSelect } from './components/TicketsFilterSelect';
import { TicketsSortButtons } from './components/TicketsSortButtons';
import {
    filterLabelClass,
    filterOptionClass,
    filterPanelAnchoredClass,
    filterTriggerInlineClass,
    filterValueClass,
} from '@/components/filter-ui';
import { ticketsClearFiltersClass } from './components/tickets-ui';

const STATUS_OPTIONS = [
    { value: 'all', label: 'All Status' },
    { value: 'uploading', label: 'Uploading' },
    { value: 'pending', label: 'Pending' },
    { value: 'processing', label: 'Analyzing' },
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
];

const OUTCOME_OPTIONS = [
    { value: 'all', label: 'All Outcomes' },
    { value: 'interested', label: 'Interested' },
    { value: 'not_interested', label: 'Not Interested' },
    { value: 'follow_up_required', label: 'Follow Up' },
];

const AUTH_OPTIONS = [
    { value: 'all', label: 'Real + Fake' },
    { value: 'real', label: 'Real Calls' },
    { value: 'fake', label: 'Fake Calls' },
];

const CALL_OPTIONS = [
    { value: 'all', label: 'All Call Status' },
    { value: 'completed', label: 'Completed' },
    { value: 'missed', label: 'Missed' },
    { value: 'failed', label: 'Failed' },
];

const DIR_OPTIONS = [
    { value: 'all', label: 'Inbound + Outbound' },
    { value: 'inbound', label: 'Inbound' },
    { value: 'outbound', label: 'Outbound' },
];

function getPersonName(person?: { full_name?: string; fullname?: string } | null) {
    return person?.full_name || person?.fullname || 'Unknown';
}

interface PresalesFiltersSectionProps {
    setSearchInput: (value: string) => void;
}

export function PresalesFiltersSection({ setSearchInput }: PresalesFiltersSectionProps) {
    const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
    const agentDropdownRef = useRef<HTMLDivElement>(null);

    const {
        employees,
        teams,
        filters,
        setFilter,
        clearFilters,
        fetchEmployees,
        employeesLoaded,
    } = usePresalesStore();

    const selectedAgent = employees.find((e) => e.id === filters.agentFilter);
    const teamLeaders = employees.filter((e) => e.role === 'team_leader');

    useEffect(() => {
        if (!employeesLoaded) fetchEmployees();
    }, [employeesLoaded, fetchEmployees]);

    useEffect(() => {
        function handle(e: MouseEvent) {
            if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
                setAgentDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    const handleClearFilters = () => {
        setSearchInput('');
        clearFilters();
    };

    const dateInputClass =
        'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

    return (
        <>
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative" ref={agentDropdownRef}>
                    <button
                        type="button"
                        onClick={() => setAgentDropdownOpen((o) => !o)}
                        className={`${filterTriggerInlineClass} w-full justify-between sm:min-w-[11rem] sm:max-w-[13rem]`}
                    >
                        <div className="flex min-w-0 items-center gap-2 truncate">
                            <span className={filterLabelClass}>Agent</span>
                            <span className={filterValueClass}>
                                {selectedAgent ? getPersonName(selectedAgent) : 'All Agents'}
                            </span>
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 dark:text-slate-500" />
                    </button>
                    {agentDropdownOpen && (
                        <div className={`${filterPanelAnchoredClass} right-0 max-h-52 w-64 min-w-full`}>
                            {[{ id: 'all', full_name: 'All Agents' }, ...employees.filter((e) => e.role !== 'team_leader')].map((emp) => (
                                <button
                                    key={emp.id}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        setFilter('agentFilter', emp.id);
                                        setAgentDropdownOpen(false);
                                    }}
                                    className={filterOptionClass(filters.agentFilter === emp.id)}
                                >
                                    <span>{getPersonName(emp)}</span>
                                    {filters.agentFilter === emp.id && <Check className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <TicketsFilterSelect label="Status" value={filters.statusFilter} onChange={(v) => setFilter('statusFilter', v)} options={STATUS_OPTIONS} />
                <TicketsFilterSelect label="Date" value={filters.dateFilter} onChange={(v) => setFilter('dateFilter', v)} options={DATE_OPTIONS} />
                <TicketsFilterSelect label="Rating" value={filters.ratingFilter} onChange={(v) => setFilter('ratingFilter', v)} options={RATING_OPTIONS} />

                <TicketsFilterSelect
                    label="Team"
                    value={filters.teamFilter}
                    onChange={(v) => setFilter('teamFilter', v)}
                    options={[{ value: 'all', label: 'All Teams' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
                />
                <TicketsFilterSelect
                    label="Leader"
                    value={filters.teamLeaderFilter}
                    onChange={(v) => setFilter('teamLeaderFilter', v)}
                    options={[{ value: 'all', label: 'All Leaders' }, ...teamLeaders.map((l) => ({ value: l.id, label: getPersonName(l) }))]}
                />
                <TicketsFilterSelect label="Outcome" value={filters.outcomeFilter} onChange={(v) => setFilter('outcomeFilter', v)} options={OUTCOME_OPTIONS} />
                <TicketsFilterSelect label="Auth" value={filters.authenticityFilter} onChange={(v) => setFilter('authenticityFilter', v)} options={AUTH_OPTIONS} />
                <TicketsFilterSelect label="Call" value={filters.callStatusFilter} onChange={(v) => setFilter('callStatusFilter', v)} options={CALL_OPTIONS} />
                <TicketsFilterSelect label="Dir" value={filters.directionFilter} onChange={(v) => setFilter('directionFilter', v)} options={DIR_OPTIONS} />

                <TicketsSortButtons sortOrder={filters.sortOrder} onSortChange={(order) => setFilter('sortOrder', order)} />

                <button type="button" onClick={handleClearFilters} className={`${ticketsClearFiltersClass} sm:ml-auto`}>
                    Clear Filters
                </button>
            </div>

            {filters.dateFilter === 'custom' && (
                <div className="flex flex-wrap gap-3">
                    <input type="date" value={filters.customDateFrom} onChange={(e) => setFilter('customDateFrom', e.target.value)} className={dateInputClass} />
                    <input type="date" value={filters.customDateTo} onChange={(e) => setFilter('customDateTo', e.target.value)} className={dateInputClass} />
                </div>
            )}
        </>
    );
}
