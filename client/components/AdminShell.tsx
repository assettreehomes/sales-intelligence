'use client';

import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
    AlertCircle,
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

type AdminSection = 'tickets' | 'excuses' | 'assign';

interface AdminShellProps {
    activeSection: AdminSection;
    children: ReactNode;
}

const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed';
const MOBILE_MENU_BUTTON_POS_KEY = 'admin-mobile-menu-button-position';
const MOBILE_MENU_BUTTON_SIZE = 40;
const MOBILE_MENU_BUTTON_MARGIN = 8;

type FloatingButtonPosition = {
    left: number;
    top: number;
};

function clampFloatingPosition(position: FloatingButtonPosition): FloatingButtonPosition {
    if (typeof window === 'undefined') return position;

    const maxLeft = Math.max(MOBILE_MENU_BUTTON_MARGIN, window.innerWidth - MOBILE_MENU_BUTTON_SIZE - MOBILE_MENU_BUTTON_MARGIN);
    const maxTop = Math.max(MOBILE_MENU_BUTTON_MARGIN, window.innerHeight - MOBILE_MENU_BUTTON_SIZE - MOBILE_MENU_BUTTON_MARGIN);

    return {
        left: Math.min(Math.max(position.left, MOBILE_MENU_BUTTON_MARGIN), maxLeft),
        top: Math.min(Math.max(position.top, MOBILE_MENU_BUTTON_MARGIN), maxTop)
    };
}

export function AdminShell({ activeSection, children }: AdminShellProps) {
    const router = useRouter();
    const { profile, signOut } = useAuth();
    const { theme, toggleTheme } = useTheme();

    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    });
    const [mobileOpen, setMobileOpen] = useState(false);
    const [mobileMenuButtonPos, setMobileMenuButtonPos] = useState<FloatingButtonPosition>(() => {
        if (typeof window === 'undefined') return { left: 16, top: 16 };

        const raw = window.localStorage.getItem(MOBILE_MENU_BUTTON_POS_KEY);
        if (!raw) return { left: 16, top: 16 };

        try {
            const parsed = JSON.parse(raw) as Partial<FloatingButtonPosition>;
            if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
                return clampFloatingPosition({ left: parsed.left, top: parsed.top });
            }
        } catch {
            // ignore invalid persisted value
        }

        return { left: 16, top: 16 };
    });
    const dragStateRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        originLeft: number;
        originTop: number;
        moved: boolean;
    } | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    }, [collapsed]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(MOBILE_MENU_BUTTON_POS_KEY, JSON.stringify(mobileMenuButtonPos));
    }, [mobileMenuButtonPos]);

    useEffect(() => {
        const handleResize = () => {
            setMobileMenuButtonPos((prev) => clampFloatingPosition(prev));
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleMobileMenuPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
        dragStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originLeft: mobileMenuButtonPos.left,
            originTop: mobileMenuButtonPos.top,
            moved: false
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handleMobileMenuPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const deltaX = event.clientX - drag.startX;
        const deltaY = event.clientY - drag.startY;
        const movedEnough = Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3;

        if (movedEnough) {
            drag.moved = true;
            const nextPos = clampFloatingPosition({
                left: drag.originLeft + deltaX,
                top: drag.originTop + deltaY
            });
            setMobileMenuButtonPos(nextPos);
        }
    };

    const handleMobileMenuPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        if (!drag.moved) {
            setMobileOpen(true);
        }

        dragStateRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const navItems = useMemo(() => ([
        { id: 'tickets' as const, label: 'Tickets', icon: Radio, href: '/admin/tickets' },
        { id: 'excuses' as const, label: 'Excuses', icon: AlertCircle, href: '/admin/excuses' },
        { id: 'assign' as const, label: 'Assign', icon: Users, href: '/admin/assign' },
    ]), []);

    return (
        <div className="min-h-screen bg-gray-50">
            {!mobileOpen && (
                <button
                    type="button"
                    onPointerDown={handleMobileMenuPointerDown}
                    onPointerMove={handleMobileMenuPointerMove}
                    onPointerUp={handleMobileMenuPointerUp}
                    onPointerCancel={() => { dragStateRef.current = null; }}
                    className="fixed z-40 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm lg:hidden"
                    aria-label="Open sidebar menu"
                    style={{ left: mobileMenuButtonPos.left, top: mobileMenuButtonPos.top }}
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
                    <div className={`relative flex items-center border-b border-gray-200 px-4 py-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
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
                            className={`hidden h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 lg:inline-flex ${collapsed ? 'absolute right-2' : ''}`}
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
