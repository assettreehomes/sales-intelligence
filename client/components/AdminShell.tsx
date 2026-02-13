'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
    AlertCircle,
    BarChart3,
    LogOut,
    Menu,
    Moon,
    PanelLeftClose,
    PanelLeftOpen,
    Radio,
    Sparkles,
    Sun,
    User,
    Users
} from 'lucide-react';

type AdminSection = 'tickets' | 'analytics' | 'excuses' | 'assign';

interface AdminShellProps {
    activeSection: AdminSection;
    children: ReactNode;
}

const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed';

export function AdminShell({ activeSection, children }: AdminShellProps) {
    const router = useRouter();
    const { profile, signOut } = useAuth();
    const { theme, toggleTheme } = useTheme();

    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    });
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    }, [collapsed]);

    const navItems = useMemo(() => ([
        { id: 'tickets' as const, label: 'Tickets', icon: Radio, href: '/admin/tickets' },
        { id: 'analytics' as const, label: 'Analytics', icon: BarChart3, href: '#' },
        { id: 'excuses' as const, label: 'Excuses', icon: AlertCircle, href: '/admin/excuses' },
        { id: 'assign' as const, label: 'Assign', icon: Users, href: '/admin/assign' },
    ]), []);

    return (
        <div className="min-h-screen bg-gray-50">
            {!mobileOpen && (
                <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    className="fixed top-4 left-4 z-40 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm lg:hidden"
                    aria-label="Open sidebar menu"
                >
                    <Menu className="h-5 w-5" />
                </button>
            )}

            {mobileOpen && (
                <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="fixed inset-0 z-40 bg-black/45 lg:hidden"
                    aria-label="Close sidebar menu"
                />
            )}

            <aside
                className={`fixed inset-y-0 left-0 z-50 flex border-r border-gray-200 bg-white transition-all duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                    } ${collapsed ? 'w-20' : 'w-64'}`}
            >
                <div className="flex h-full w-full flex-col">
                    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
                        <Link href="/admin/tickets" className="flex items-center gap-2 overflow-hidden">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white">
                                <Sparkles className="h-4 w-4" />
                            </div>
                            {!collapsed && (
                                <span className="text-base font-semibold text-gray-900">TicketIntel</span>
                            )}
                        </Link>

                        <button
                            type="button"
                            onClick={() => setCollapsed((prev) => !prev)}
                            className="hidden h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 lg:inline-flex"
                            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        </button>
                    </div>

                    <nav className="flex-1 space-y-1 px-3 py-4">
                        {navItems.map((item) => {
                            const active = item.id === activeSection;
                            const baseClass = `group flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${collapsed ? 'justify-center' : 'gap-3'
                                }`;
                            const activeClass = active
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'text-gray-600 hover:bg-gray-100';
                            const iconClass = active ? 'text-white' : 'text-gray-500';

                            return (
                                <Link
                                    key={item.id}
                                    href={item.href}
                                    className={`${baseClass} ${activeClass}`}
                                    onClick={() => setMobileOpen(false)}
                                >
                                    <item.icon className={`h-5 w-5 ${iconClass}`} />
                                    {!collapsed && <span>{item.label}</span>}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="border-t border-gray-200 px-3 py-4">
                        {!collapsed && (
                            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                                <p className="text-[11px] uppercase tracking-wide text-gray-500">Current Plan</p>
                                <div className="mt-1 flex items-center justify-between">
                                    <span className="text-sm font-semibold text-gray-900">Enterprise</span>
                                    <span className="h-2 w-2 rounded-full bg-purple-500" />
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={toggleTheme}
                            className={`mb-3 flex w-full items-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 ${collapsed ? 'justify-center' : 'gap-2.5'
                                }`}
                            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        >
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-purple-700">
                                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                            </span>
                            {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
                        </button>

                        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100">
                                <User className="h-5 w-5 text-purple-600" />
                            </div>
                            {!collapsed && (
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-gray-900">{profile?.fullname || 'Admin'}</p>
                                    <p className="truncate text-xs text-gray-500">{profile?.email || '-'}</p>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={async () => {
                                await signOut();
                                router.push('/login');
                            }}
                            className={`mt-3 flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 ${collapsed ? 'justify-center' : 'gap-2.5'
                                }`}
                        >
                            <LogOut className="h-4 w-4" />
                            {!collapsed && <span>Sign Out</span>}
                        </button>
                    </div>
                </div>
            </aside>

            <div className={`transition-all duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
                <div className="min-h-screen">{children}</div>
            </div>
        </div>
    );
}
