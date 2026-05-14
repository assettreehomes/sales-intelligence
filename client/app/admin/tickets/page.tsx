'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { useTicketsStore } from '@/stores/ticketsStore';
import { getToken, API_URL } from '@/stores/authStore';
import {
    AlertCircle,
    Search,
    SlidersHorizontal,
    Clock,
    Calendar,
    Star,
    ChevronLeft,
    ChevronRight,
    Trash2,
    Loader2,
    ArrowDownAZ,
    ArrowUpAZ,
    ChevronDown,
    Users,
    Check,
    MessageCircle
} from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { useRef } from 'react';
import { TicketHeatmap } from '@/components/TicketHeatmap';

function AdminDashboardContent() {
    const router = useRouter();
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

    const {
        tickets,
        employees,
        totalTickets,
        loading,
        filters,
        currentPage,
        ticketsPerPage,
        employeesLoaded,
        fetchTickets,
        fetchEmployees,
        setFilter,
        clearFilters,
        setPage,
        deleteTicket,
    } = useTicketsStore();
    const [searchInput, setSearchInput] = useState(filters.searchQuery);

    const [deletingTicketIds, setDeletingTicketIds] = useState<Set<string>>(new Set());
    const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
    const agentDropdownRef = useRef<HTMLDivElement>(null);
    const [sendingReport, setSendingReport] = useState(false);

    const handleSendReport = async () => {
        if (sendingReport) return;
        setSendingReport(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/reports/whatsapp/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                alert('✅ WhatsApp report sent successfully!');
            } else {
                alert(`❌ Failed to send report: ${data.error || 'Unknown error'}`);
            }
        } catch {
            alert('❌ Network error — could not send report.');
        } finally {
            setSendingReport(false);
        }
    };

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (agentDropdownRef.current && !agentDropdownRef.current.contains(event.target as Node)) {
                setAgentDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const statusOptions = [
        { value: 'all', label: 'All Status' },
        { value: 'draft', label: 'Draft' },
        { value: 'uploading', label: 'Uploading' },
        { value: 'uploaded', label: 'Uploaded' },
        { value: 'pending', label: 'Pending' },
        { value: 'processing', label: 'Processing' },
        { value: 'analyzed', label: 'Analyzed' },
        { value: 'analysis_failed', label: 'Failed' },
    ];

    const dateOptions = [
        { value: 'today', label: 'Today' },
        { value: '7days', label: 'Last 7 Days' },
        { value: '30days', label: 'Last 30 Days' },
        { value: '60days', label: 'Last 2 Months' },
        { value: 'custom', label: 'Custom Range' },
        { value: 'all', label: 'All Time' },
    ];

    const ratingOptions = [
        { value: 'all', label: 'All Ratings' },
        { value: '4plus', label: '4★ & Up' },
        { value: '3plus', label: '3★ & Up' },
        { value: '2plus', label: '2★ & Up' },
        { value: '1plus', label: '1★ & Up' },
        { value: 'below2', label: 'Below 2★' },
        { value: 'unrated', label: 'Unrated' },
    ];

    useEffect(() => {
        fetchTickets();
    }, [filters, currentPage, fetchTickets]);

    useEffect(() => {
        if (!employeesLoaded) {
            fetchEmployees();
        }
    }, [employeesLoaded, fetchEmployees]);

    useEffect(() => {
        const normalized = searchInput.trim();
        if (normalized === filters.searchQuery) return;

        const timer = setTimeout(() => {
            setFilter('searchQuery', normalized);
        }, 250);

        return () => clearTimeout(timer);
    }, [searchInput, filters.searchQuery, setFilter]);

    const handleDateFilterChange = (value: string) => {
        setFilter('dateFilter', value);
        if (value !== 'custom') {
            setFilter('customDateFrom', '');
            setFilter('customDateTo', '');
        }
    };

    const handleHeatmapDateSelect = (date: string | null) => {
        if (!date) {
            setFilter('dateFilter', '30days'); // Default back to 30 days or all?
            handleDateFilterChange('30days');
            return;
        }
        setFilter('dateFilter', 'custom');
        setFilter('customDateFrom', date);
        setFilter('customDateTo', date);
    };

    const handleClearFilters = () => {
        setSearchInput('');
        clearFilters();
    };

    const getStatusBadge = (status: string, isTraining: boolean) => {
        const badges = [];

        if (status === 'processing' || status === 'pending') {
            badges.push(
                <span key="live" className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                    LIVE
                </span>
            );
        }

        if (status === 'processing') {
            badges.push(
                <span key="processing" className="px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                    PROCESSING
                </span>
            );
        }

        if (status === 'analyzed') {
            badges.push(
                <span key="resolved" className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                    RESOLVED
                </span>
            );
        }

        if (isTraining) {
            badges.push(
                <span key="training" className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                    TRAINING
                </span>
            );
        }

        return badges;
    };

    const formatDuration = (seconds: number | null) => {
        if (!seconds) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }) + ' - ' + date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const renderStars = (rating: number | null) => {
        const score = rating ? Math.round(rating / 2) : 0;
        return (
            <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                        key={star}
                        className={`w-4 h-4 ${star <= score
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-gray-300'
                            }`}
                    />
                ))}
                {rating && (
                    <span className="ml-1 text-sm text-amber-600 font-medium">
                        {(rating / 2).toFixed(1)}
                    </span>
                )}
            </div>
        );
    };

    const getVisitTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            site_visit: 'Site Visit',
            follow_up: 'Follow Up',
            closing: 'Closing',
            inquiry: 'Inquiry',
            other: 'Other'
        };
        return labels[type] || type;
    };

    const totalPages = Math.ceil(totalTickets / ticketsPerPage);
    const rangeStart = totalTickets === 0 ? 0 : ((currentPage - 1) * ticketsPerPage) + 1;
    const rangeEnd = totalTickets === 0 ? 0 : Math.min(currentPage * ticketsPerPage, totalTickets);

    return (
        <AdminShell activeSection="tickets">
            <div className="flex min-h-screen flex-col">
                <header className="bg-white border-b border-gray-200 px-5 py-5 md:px-7 sticky top-0 z-20">
                    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h1 className="text-xl md:text-2xl font-semibold text-gray-900">Ticket Repository</h1>
                            <p className="text-sm text-gray-500">Manage and monitor customer intelligence flow</p>
                        </div>

                        <div className="flex w-full items-center gap-3 lg:w-auto lg:justify-end">
                            <div className="relative hidden md:block">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by Client ID or Client Name"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    className="w-full min-w-[14rem] rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 lg:w-72"
                                />
                            </div>
                            <button
                                id="send-whatsapp-report-btn"
                                onClick={handleSendReport}
                                disabled={sendingReport}
                                title="Send daily performance report to WhatsApp"
                                className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {sendingReport
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <MessageCircle className="w-4 h-4" />}
                                <span className="hidden sm:inline">{sendingReport ? 'Sending…' : 'Send Report'}</span>
                            </button>
                            <button
                                onClick={() => setMobileFiltersOpen((prev) => !prev)}
                                className="rounded-lg p-2 transition-colors hover:bg-gray-100 md:hidden"
                                aria-label="Toggle filters"
                            >
                                <SlidersHorizontal className="w-5 h-5 text-gray-600" />
                            </button>
                            <NotificationBell />
                        </div>
                    </div>

                    <div className="relative mb-3 md:hidden">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by Client ID or Client Name"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                        />
                    </div>

                    <div className="hidden flex-wrap items-center gap-3 md:flex">
                        <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 hover:bg-gray-50 sm:w-auto">
                            <div
                                onClick={() => setFilter('showLiveOnly', !filters.showLiveOnly)}
                                className={`w-10 h-5 rounded-full transition-colors ${filters.showLiveOnly ? 'bg-purple-600' : 'bg-gray-300'} relative`}
                            >
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${filters.showLiveOnly ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </div>
                            <span className="text-sm font-medium text-gray-700">Show Live Only</span>
                        </label>

                        <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 hover:bg-gray-50 sm:w-auto">
                            <div
                                onClick={() => setFilter('showFlaggedOnly', !filters.showFlaggedOnly)}
                                className={`w-10 h-5 rounded-full transition-colors ${filters.showFlaggedOnly ? 'bg-red-500' : 'bg-gray-300'} relative`}
                            >
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${filters.showFlaggedOnly ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </div>
                            <span className="text-sm font-medium text-gray-700">🚩 Flagged Only</span>
                        </label>

                        <div className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 sm:w-auto">
                            <span className="text-xs text-gray-500 uppercase">Status</span>
                            <select
                                value={filters.statusFilter}
                                onChange={(e) => setFilter('statusFilter', e.target.value)}
                                className="w-full cursor-pointer rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none sm:w-auto"
                            >
                                {statusOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 sm:w-auto">
                            <span className="text-xs text-gray-500 uppercase">Date</span>
                            <select
                                value={filters.dateFilter}
                                onChange={(e) => handleDateFilterChange(e.target.value)}
                                className="w-full cursor-pointer rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none sm:w-auto"
                            >
                                {dateOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 sm:w-auto">
                            <span className="text-xs text-gray-500 uppercase">Sort</span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    title="Newest first"
                                    aria-label="Newest first"
                                    onClick={() => setFilter('sortOrder', 'desc')}
                                    className={`cursor-pointer rounded-md border p-1.5 transition-colors ${filters.sortOrder === 'desc'
                                        ? 'border-purple-300 bg-purple-50 text-purple-700'
                                        : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                                        }`}
                                >
                                    <ArrowDownAZ className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    title="Oldest first"
                                    aria-label="Oldest first"
                                    onClick={() => setFilter('sortOrder', 'asc')}
                                    className={`cursor-pointer rounded-md border p-1.5 transition-colors ${filters.sortOrder === 'asc'
                                        ? 'border-purple-300 bg-purple-50 text-purple-700'
                                        : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                                        }`}
                                >
                                    <ArrowUpAZ className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 sm:w-auto">
                            <span className="text-xs text-gray-500 uppercase">Rating</span>
                            <select
                                value={filters.ratingFilter}
                                onChange={(e) => setFilter('ratingFilter', e.target.value)}
                                className="w-full cursor-pointer rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none sm:w-auto"
                            >
                                {ratingOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {filters.dateFilter === 'custom' && (
                            <div className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
                                <span className="text-xs text-gray-500 uppercase">From</span>
                                <input
                                    type="date"
                                    value={filters.customDateFrom}
                                    onChange={(e) => setFilter('customDateFrom', e.target.value)}
                                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none"
                                />
                                <span className="text-xs text-gray-500 uppercase">To</span>
                                <input
                                    type="date"
                                    value={filters.customDateTo}
                                    onChange={(e) => setFilter('customDateTo', e.target.value)}
                                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none"
                                />
                            </div>
                        )}

                        <div className="relative" ref={agentDropdownRef}>
                            <button
                                onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                                className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 sm:w-48 text-left hover:border-purple-400 transition-colors"
                            >
                                <div className="flex items-center gap-2 truncate">
                                    <span className="text-xs text-gray-500 uppercase">Agent</span>
                                    {filters.agentFilter === 'all' ? (
                                        <span className="text-sm font-medium text-gray-900 truncate">All Agents</span>
                                    ) : (
                                        <div className="flex items-center gap-2 truncate">
                                            {employees.find(e => e.id === filters.agentFilter)?.avatar_url && (
                                                <Avatar
                                                    name={employees.find(e => e.id === filters.agentFilter)?.fullname || ''}
                                                    src={employees.find(e => e.id === filters.agentFilter)?.avatar_url}
                                                    size="xs"
                                                />
                                            )}
                                            <span className="text-sm font-medium text-gray-900 truncate">
                                                {employees.find(e => e.id === filters.agentFilter)?.fullname || 'Unknown'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                            </button>

                            {agentDropdownOpen && (
                                <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-xl border border-gray-100 bg-white shadow-xl p-1 max-h-80 overflow-y-auto">
                                    <div
                                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${filters.agentFilter === 'all' ? 'bg-purple-50 text-purple-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                        onClick={() => {
                                            setFilter('agentFilter', 'all');
                                            setAgentDropdownOpen(false);
                                        }}
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                            <Users className="w-4 h-4 text-gray-500" />
                                        </div>
                                        <span className="flex-1 text-sm font-medium">All Agents</span>
                                        {filters.agentFilter === 'all' && <Check className="w-4 h-4" />}
                                    </div>

                                    <div className="my-1 border-t border-gray-100" />

                                    {employees.map((emp) => (
                                        <div
                                            key={emp.id}
                                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${filters.agentFilter === emp.id ? 'bg-purple-50 text-purple-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                            onClick={() => {
                                                setFilter('agentFilter', emp.id);
                                                setAgentDropdownOpen(false);
                                            }}
                                        >
                                            <Avatar name={emp.fullname} src={emp.avatar_url} size="sm" />
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="text-sm font-medium truncate">{emp.fullname}</span>
                                                <span className="text-xs text-gray-400 truncate">{emp.email}</span>
                                            </div>
                                            {filters.agentFilter === emp.id && <Check className="w-4 h-4 ml-auto" />}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleClearFilters}
                            className="cursor-pointer text-sm font-medium text-purple-600 hover:text-purple-700 sm:ml-auto"
                        >
                            Clear Filters
                        </button>
                    </div>

                    {mobileFiltersOpen && (
                        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 md:hidden">
                            <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 hover:bg-gray-50">
                                <div
                                    onClick={() => setFilter('showLiveOnly', !filters.showLiveOnly)}
                                    className={`relative h-5 w-10 rounded-full transition-colors ${filters.showLiveOnly ? 'bg-purple-600' : 'bg-gray-300'}`}
                                >
                                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${filters.showLiveOnly ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </div>
                                <span className="text-sm font-medium text-gray-700">Show Live Only</span>
                            </label>

                            <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 hover:bg-gray-50">
                                <div
                                    onClick={() => setFilter('showFlaggedOnly', !filters.showFlaggedOnly)}
                                    className={`relative h-5 w-10 rounded-full transition-colors ${filters.showFlaggedOnly ? 'bg-red-500' : 'bg-gray-300'}`}
                                >
                                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${filters.showFlaggedOnly ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </div>
                                <span className="text-sm font-medium text-gray-700">🚩 Flagged Only</span>
                            </label>

                            <div className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
                                <span className="text-xs text-gray-500 uppercase">Status</span>
                                <select
                                    value={filters.statusFilter}
                                    onChange={(e) => setFilter('statusFilter', e.target.value)}
                                    className="w-full cursor-pointer rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none"
                                >
                                    {statusOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
                                <span className="text-xs text-gray-500 uppercase">Date</span>
                                <select
                                    value={filters.dateFilter}
                                    onChange={(e) => handleDateFilterChange(e.target.value)}
                                    className="w-full cursor-pointer rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none"
                                >
                                    {dateOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
                                <span className="text-xs text-gray-500 uppercase">Sort</span>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        title="Newest first"
                                        aria-label="Newest first"
                                        onClick={() => setFilter('sortOrder', 'desc')}
                                        className={`cursor-pointer rounded-md border p-1.5 transition-colors ${filters.sortOrder === 'desc'
                                            ? 'border-purple-300 bg-purple-50 text-purple-700'
                                            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                                            }`}
                                    >
                                        <ArrowDownAZ className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        title="Oldest first"
                                        aria-label="Oldest first"
                                        onClick={() => setFilter('sortOrder', 'asc')}
                                        className={`cursor-pointer rounded-md border p-1.5 transition-colors ${filters.sortOrder === 'asc'
                                            ? 'border-purple-300 bg-purple-50 text-purple-700'
                                            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                                            }`}
                                    >
                                        <ArrowUpAZ className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
                                <span className="text-xs text-gray-500 uppercase">Rating</span>
                                <select
                                    value={filters.ratingFilter}
                                    onChange={(e) => setFilter('ratingFilter', e.target.value)}
                                    className="w-full cursor-pointer rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none"
                                >
                                    {ratingOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            {filters.dateFilter === 'custom' && (
                                <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-300 bg-white px-3 py-3">
                                    <label className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500 uppercase">From</span>
                                        <input
                                            type="date"
                                            value={filters.customDateFrom}
                                            onChange={(e) => setFilter('customDateFrom', e.target.value)}
                                            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none"
                                        />
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500 uppercase">To</span>
                                        <input
                                            type="date"
                                            value={filters.customDateTo}
                                            onChange={(e) => setFilter('customDateTo', e.target.value)}
                                            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none"
                                        />
                                    </label>
                                </div>
                            )}

                            <div className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
                                <span className="text-xs text-gray-500 uppercase">Agent</span>
                                <select
                                    value={filters.agentFilter}
                                    onChange={(e) => setFilter('agentFilter', e.target.value)}
                                    className="w-full cursor-pointer rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none"
                                >
                                    <option value="all">All Agents</option>
                                    {employees.map((emp) => (
                                        <option key={emp.id} value={emp.id}>{emp.fullname}</option>
                                    ))}
                                </select>
                            </div>

                            <button
                                onClick={() => {
                                    handleClearFilters();
                                    setMobileFiltersOpen(false);
                                }}
                                className="cursor-pointer text-sm font-medium text-purple-600 hover:text-purple-700"
                            >
                                Clear Filters
                            </button>
                        </div>
                    )}
                </header>

                <div className="flex-1 p-5 md:p-7 overflow-auto">
                    <TicketHeatmap
                        onDateSelect={handleHeatmapDateSelect}
                        selectedDate={filters.dateFilter === 'custom' && filters.customDateFrom === filters.customDateTo ? filters.customDateFrom : null}
                    />

                    {loading && tickets.length === 0 ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                        </div>
                    ) : tickets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <AlertCircle className="w-12 h-12 mb-4" />
                            <p className="text-lg font-medium">No tickets found</p>
                            <p className="text-sm">Try adjusting your filters</p>
                        </div>
                    ) : (
                        <div>
                            {loading && (
                                <p className="mb-3 text-sm font-medium text-purple-600">Updating results...</p>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                {tickets.map((ticket) => (
                                    <div
                                        key={ticket.id}
                                        className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-shadow cursor-pointer"
                                        onClick={() => router.push(`/admin/tickets/${ticket.id}`)}
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-gray-500 font-medium">
                                                    {ticket.client_id || 'N/A'}
                                                </span>
                                                {getStatusBadge(ticket.status, ticket.istrainingcall)}
                                                {ticket.is_flagged && (
                                                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                                                        🚩 FLAGGED
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (deletingTicketIds.has(ticket.id)) return;
                                                    if (!confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) return;

                                                    setDeletingTicketIds((prev) => {
                                                        const next = new Set(prev);
                                                        next.add(ticket.id);
                                                        return next;
                                                    });

                                                    try {
                                                        await deleteTicket(ticket.id);
                                                    } finally {
                                                        setDeletingTicketIds((prev) => {
                                                            const next = new Set(prev);
                                                            next.delete(ticket.id);
                                                            return next;
                                                        });
                                                    }
                                                }}
                                                disabled={deletingTicketIds.has(ticket.id)}
                                                className="p-1.5 hover:bg-purple-50 rounded-lg group transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                                                title="Delete Ticket"
                                            >
                                                {deletingTicketIds.has(ticket.id) ? (
                                                    <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4 text-purple-500 group-hover:text-purple-700 transition-colors" />
                                                )}
                                            </button>
                                        </div>

                                        {/* Client Info */}
                                        <h3 className="font-semibold text-gray-900 mb-1 text-base">
                                            {ticket.clientname || `Client ${ticket.client_id}`}
                                        </h3>
                                        <p className="text-sm text-gray-500 mb-3">
                                            {getVisitTypeLabel(ticket.visittype)}
                                        </p>

                                        {/* Rating */}
                                        <div className="mb-4">
                                            {renderStars(ticket.rating)}
                                        </div>

                                        <div className="border-t border-gray-100 pt-4">
                                            <div className="flex items-center justify-between mb-3">
                                                {/* Agent Info */}
                                                <div className="flex items-center gap-2">
                                                    <Avatar
                                                        name={ticket.creator_details?.fullname || 'Unknown'}
                                                        src={ticket.creator_details?.avatar_url}
                                                        size="xs"
                                                    />
                                                    <span className="text-xs font-medium text-gray-600 truncate max-w-[100px]">
                                                        {ticket.creator_details?.fullname?.split(' ')[0] || 'Agent'}
                                                    </span>
                                                </div>

                                                {/* Date */}
                                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    <span>{formatDate(ticket.createdat)}</span>
                                                </div>
                                            </div>

                                            {/* Duration & Visit */}
                                            <div className="flex items-center justify-between text-xs text-gray-400 bg-gray-50 rounded-lg px-2 py-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    <span>{formatDuration(ticket.durationseconds)}</span>
                                                </div>
                                                <div className="w-px h-3 bg-gray-200" />
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-gray-400 font-semibold">V</span>
                                                    <span>#{ticket.visitnumber}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <footer className="bg-white border-t border-gray-200 px-5 py-4 md:px-7 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm text-gray-500">
                        Showing <span className="font-medium">{rangeStart}-{rangeEnd}</span> of <span className="font-medium">{totalTickets}</span> tickets
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1 || totalPages === 0}
                            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-5 h-5 text-gray-600" />
                        </button>

                        {[...Array(Math.min(3, totalPages))].map((_, i) => {
                            const pageNum = i + 1;
                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => setPage(pageNum)}
                                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${currentPage === pageNum
                                        ? 'bg-purple-600 text-white'
                                        : 'hover:bg-gray-100 text-gray-600'
                                        }`}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}

                        {totalPages > 3 && <span className="text-gray-400">...</span>}

                        <button
                            onClick={() => setPage(Math.min(Math.max(totalPages, 1), currentPage + 1))}
                            disabled={totalPages === 0 || currentPage >= totalPages}
                            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-5 h-5 text-gray-600" />
                        </button>
                    </div>
                </footer>
            </div>
        </AdminShell>
    );
}

export default function AdminDashboard() {
    return (
        <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
            <AdminDashboardContent />
        </ProtectedRoute>
    );
}
