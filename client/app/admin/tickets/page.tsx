'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useTicketsStore } from '@/stores/ticketsStore';
import {
    Radio,
    BarChart3,
    AlertCircle,
    Users,
    Search,
    SlidersHorizontal,
    Bell,
    Clock,
    Calendar,
    Star,
    ChevronLeft,
    ChevronRight,
    MoreVertical,
    User,
    LogOut
} from 'lucide-react';

type NavItem = 'live' | 'analytics' | 'excuses' | 'assign';

function AdminDashboardContent() {
    const router = useRouter();
    const { profile, signOut } = useAuth();

    // Zustand store — replaces all useState
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
    } = useTicketsStore();

    const navItems = [
        { id: 'live' as NavItem, label: 'Tickets', icon: Radio, href: '/admin/tickets' },
        { id: 'analytics' as NavItem, label: 'Analytics', icon: BarChart3, href: '#' },
        { id: 'excuses' as NavItem, label: 'Excuses', icon: AlertCircle, href: '/admin/excuses' },
        { id: 'assign' as NavItem, label: 'Assign', icon: Users, href: '/admin/assign' },
    ];

    const statusOptions = [
        { value: 'all', label: 'All Status' },
        { value: 'pending', label: 'Pending' },
        { value: 'processing', label: 'Processing' },
        { value: 'analyzed', label: 'Analyzed' },
        { value: 'analysis_failed', label: 'Failed' },
    ];

    const dateOptions = [
        { value: '30days', label: 'Last 30 Days' },
        { value: '7days', label: 'Last 7 Days' },
        { value: 'today', label: 'Today' },
        { value: 'all', label: 'All Time' },
    ];

    // Fetch tickets whenever filters or page change
    useEffect(() => {
        fetchTickets();
    }, [filters, currentPage, fetchTickets]);

    // Fetch employees once
    useEffect(() => {
        if (!employeesLoaded) {
            fetchEmployees();
        }
    }, [employeesLoaded, fetchEmployees]);

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
        }) + ' • ' + date.toLocaleTimeString('en-US', {
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
            'site_visit': 'Site Visit',
            'follow_up': 'Follow Up',
            'closing': 'Closing',
            'inquiry': 'Inquiry',
            'other': 'Other'
        };
        return labels[type] || type;
    };

    const totalPages = Math.ceil(totalTickets / ticketsPerPage);

    return (
        <div className="flex min-h-screen bg-gray-50">
            {/* Sidebar */}
            <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
                {/* Logo */}
                <div className="p-6">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                            <span className="text-white text-lg">✦</span>
                        </div>
                        <span className="font-bold text-lg text-gray-900">TicketIntel</span>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3">
                    {navItems.map((item) => (
                        <Link
                            key={item.id}
                            href={item.href}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-all ${item.id === 'live'
                                ? 'bg-purple-600 text-white'
                                : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            <item.icon className="w-5 h-5" />
                            <span className="font-medium">{item.label}</span>
                        </Link>
                    ))}
                </nav>

                {/* Profile Section */}
                <div className="p-4 border-t border-gray-200">
                    <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Current Plan</p>
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-gray-900">Enterprise</span>
                            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                        </div>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{profile?.fullname}</p>
                            <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
                        </div>
                    </div>

                    <button
                        onClick={async () => { await signOut(); router.push('/login'); }}
                        className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 px-8 py-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Ticket Repository</h1>
                            <p className="text-gray-500">Manage and monitor customer intelligence flow</p>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search tickets..."
                                    value={filters.searchQuery}
                                    onChange={(e) => setFilter('searchQuery', e.target.value)}
                                    className="pl-10 pr-4 py-2 w-64 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                />
                            </div>
                            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                <SlidersHorizontal className="w-5 h-5 text-gray-600" />
                            </button>
                            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative">
                                <Bell className="w-5 h-5 text-gray-600" />
                            </button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-4">
                        {/* Live Only Toggle */}
                        <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                            <div
                                onClick={() => setFilter('showLiveOnly', !filters.showLiveOnly)}
                                className={`w-10 h-5 rounded-full transition-colors ${filters.showLiveOnly ? 'bg-purple-600' : 'bg-gray-300'
                                    } relative`}
                            >
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${filters.showLiveOnly ? 'translate-x-5' : 'translate-x-0.5'
                                    }`} />
                            </div>
                            <span className="text-sm font-medium text-gray-700">Show Live Only</span>
                        </label>

                        {/* Status Filter */}
                        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg">
                            <span className="text-xs text-gray-500 uppercase">Status</span>
                            <select
                                value={filters.statusFilter}
                                onChange={(e) => setFilter('statusFilter', e.target.value)}
                                className="text-sm font-medium text-gray-900 bg-transparent border-none focus:outline-none cursor-pointer"
                            >
                                {statusOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Date Filter */}
                        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg">
                            <span className="text-xs text-gray-500 uppercase">Date</span>
                            <select
                                value={filters.dateFilter}
                                onChange={(e) => setFilter('dateFilter', e.target.value)}
                                className="text-sm font-medium text-gray-900 bg-transparent border-none focus:outline-none cursor-pointer"
                            >
                                {dateOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Agent Filter */}
                        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg">
                            <span className="text-xs text-gray-500 uppercase">Agent</span>
                            <select
                                value={filters.agentFilter}
                                onChange={(e) => setFilter('agentFilter', e.target.value)}
                                className="text-sm font-medium text-gray-900 bg-transparent border-none focus:outline-none cursor-pointer"
                            >
                                <option value="all">All Agents</option>
                                {employees.map((emp) => (
                                    <option key={emp.id} value={emp.id}>{emp.fullname}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={clearFilters}
                            className="ml-auto text-purple-600 hover:text-purple-700 text-sm font-medium"
                        >
                            Clear Filters
                        </button>
                    </div>
                </header>

                {/* Ticket Grid */}
                <div className="flex-1 p-8 overflow-auto">
                    {loading ? (
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {tickets.map((ticket) => (
                                <div
                                    key={ticket.id}
                                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-shadow cursor-pointer"
                                    onClick={() => window.location.href = `/admin/tickets/${ticket.id}`}
                                >
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-gray-500 font-medium">
                                                #{ticket.id.slice(0, 4).toUpperCase()}
                                            </span>
                                            {getStatusBadge(ticket.status, ticket.istrainingcall)}
                                        </div>
                                        <button className="p-1 hover:bg-gray-100 rounded">
                                            <MoreVertical className="w-4 h-4 text-gray-400" />
                                        </button>
                                    </div>

                                    {/* Client Info */}
                                    <h3 className="font-semibold text-gray-900 mb-1">
                                        {ticket.clientname || `Client ${ticket.client_id}`}
                                    </h3>
                                    <p className="text-sm text-gray-500 mb-3">
                                        {getVisitTypeLabel(ticket.visittype)} - {ticket.client_id}
                                    </p>

                                    {/* Rating */}
                                    <div className="mb-4">
                                        {renderStars(ticket.rating)}
                                    </div>

                                    <div className="border-t border-gray-100 pt-4">
                                        {/* Duration & Visit */}
                                        <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-4 h-4" />
                                                <span>{formatDuration(ticket.durationseconds)}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-gray-400">📋</span>
                                                <span>Visit #{ticket.visitnumber}</span>
                                            </div>
                                        </div>

                                        {/* Date */}
                                        <div className="flex items-center gap-1 text-sm text-gray-500">
                                            <Calendar className="w-4 h-4" />
                                            <span>{formatDate(ticket.createdat)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pagination */}
                <footer className="bg-white border-t border-gray-200 px-8 py-4 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                        Showing <span className="font-medium">{((currentPage - 1) * ticketsPerPage) + 1}-{Math.min(currentPage * ticketsPerPage, totalTickets)}</span> of <span className="font-medium">{totalTickets}</span> tickets
                    </p>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
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

                        {totalPages > 3 && (
                            <>
                                <span className="text-gray-400">...</span>
                            </>
                        )}

                        <button
                            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-5 h-5 text-gray-600" />
                        </button>

                        {/* Dark mode toggle placeholder */}
                        <button className="ml-4 w-9 h-9 bg-gray-900 rounded-full flex items-center justify-center">
                            <span className="text-white text-lg">🌙</span>
                        </button>
                    </div>
                </footer>
            </main>
        </div>
    );
}

export default function AdminDashboard() {
    return (
        <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
            <AdminDashboardContent />
        </ProtectedRoute>
    );
}
