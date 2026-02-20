'use client';

import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
    AlertCircle,
    BarChart3,
    ClipboardList,
    GraduationCap,
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

type AdminSection = 'tickets' | 'excuses' | 'assign' | 'training' | 'activity' | 'performance' | 'live';

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
    const suppressMenuClickRef = useRef(false);

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
        suppressMenuClickRef.current = false;
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
            suppressMenuClickRef.current = true;
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

        suppressMenuClickRef.current = drag.moved;
        dragStateRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const handleMobileMenuClick = () => {
        if (suppressMenuClickRef.current) {
            suppressMenuClickRef.current = false;
            return;
        }
        setMobileOpen(true);
    };

    const homeHref = (profile?.role === 'intern' || profile?.role === 'employee') ? '/intern' : '/admin/tickets';

    const navItems = useMemo(() => {
        if (profile?.role === 'intern' || profile?.role === 'employee') {
            return [
                { id: 'training' as const, label: 'Training', icon: GraduationCap, href: '/intern' }
            ];
        }

        return [
            { id: 'tickets' as const, label: 'Tickets', icon: Radio, href: '/admin/tickets' },
            { id: 'performance' as const, label: 'Performance', icon: BarChart3, href: '/admin/performance' },
            { id: 'excuses' as const, label: 'Excuses', icon: AlertCircle, href: '/admin/excuses' },
            { id: 'assign' as const, label: 'Assign', icon: Users, href: '/admin/assign' },
            { id: 'activity' as const, label: 'Activity Log', icon: ClipboardList, href: '/admin/activity' },
            { id: 'live' as const, label: 'Live Status', icon: Radio, href: '/admin/live' }
        ];
    }, [profile?.role]);

    return (
        <div className={`admin-shell min-h-screen ${activeSection === 'performance' ? 'admin-shell--performance' : ''}`}>
            {!mobileOpen && (
                <button
                    type="button"
                    onClick={handleMobileMenuClick}
                    onPointerDown={handleMobileMenuPointerDown}
                    onPointerMove={handleMobileMenuPointerMove}
                    onPointerUp={handleMobileMenuPointerUp}
                    onPointerCancel={() => {
                        dragStateRef.current = null;
                        suppressMenuClickRef.current = true;
                    }}
                    className="admin-shell-mobile-trigger fixed z-40 inline-flex h-10 w-10 select-none touch-none items-center justify-center rounded-lg print:hidden lg:hidden"
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
                    className="admin-shell-overlay fixed inset-0 z-40 bg-black/45 print:hidden lg:hidden"
                    aria-label="Close sidebar menu"
                />
            )}

            <aside
                className={`admin-shell-sidebar fixed inset-y-0 left-0 z-50 flex transition-all duration-300 print:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                    } ${collapsed ? 'w-20' : 'w-64'}`}
            >
                <div className="flex h-full w-full flex-col">
                    <div className={`admin-shell-brand relative flex items-center px-4 py-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
                        <Link href={homeHref} className="flex items-center gap-2 overflow-hidden">
                            <div className="admin-shell-brand-badge flex h-8 w-8 items-center justify-center rounded-lg">
                                <Sparkles className="h-4 w-4" />
                            </div>
                            {!collapsed && (
                                <span className="admin-shell-brand-text text-base font-semibold">TicketIntel</span>
                            )}
                        </Link>

                        <button
                            type="button"
                            onClick={() => setCollapsed((prev) => !prev)}
                            className={`admin-shell-collapse-btn hidden h-8 w-8 items-center justify-center rounded-lg transition-colors lg:inline-flex ${collapsed ? 'absolute right-2' : ''}`}
                            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        </button>
                    </div>

                    <nav className="flex-1 space-y-1 px-3 py-4">
                        {navItems.map((item) => {
                            const active = item.id === activeSection;
                            const baseClass = `admin-shell-nav-link group flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${collapsed ? 'justify-center' : 'gap-3'
                                }`;
                            const activeClass = active
                                ? 'is-active'
                                : 'is-inactive';
                            const iconClass = active ? 'is-active' : 'is-inactive';

                            return (
                                <Link
                                    key={item.id}
                                    href={item.href}
                                    className={`${baseClass} ${activeClass}`}
                                    onClick={() => setMobileOpen(false)}
                                >
                                    <item.icon className={`admin-shell-nav-icon h-5 w-5 ${iconClass}`} />
                                    {!collapsed && <span>{item.label}</span>}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="admin-shell-footer px-3 py-4">
                        {!collapsed && (
                            <div className="admin-shell-plan-card mb-3 rounded-lg px-3 py-2.5">
                                <p className="admin-shell-plan-label text-[11px] uppercase tracking-wide">Current Plan</p>
                                <div className="mt-1 flex items-center justify-between">
                                    <span className="admin-shell-plan-value text-sm font-semibold">Enterprise</span>
                                    <span className="admin-shell-plan-dot h-2 w-2 rounded-full" />
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={toggleTheme}
                            className={`admin-shell-theme-toggle mb-3 flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${collapsed ? 'justify-center' : 'gap-2.5'
                                }`}
                            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        >
                            <span className="admin-shell-theme-icon inline-flex h-6 w-6 items-center justify-center rounded-full">
                                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                            </span>
                            {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
                        </button>

                        <div className={`admin-shell-user-info flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
                            <div className="admin-shell-user-avatar flex h-9 w-9 items-center justify-center rounded-full">
                                <User className="h-5 w-5" />
                            </div>
                            {!collapsed && (
                                <div className="min-w-0">
                                    <p className="admin-shell-user-name truncate text-sm font-medium">{profile?.fullname || 'Admin'}</p>
                                    <p className="admin-shell-user-email truncate text-xs">{profile?.email || '-'}</p>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={async () => {
                                await signOut();
                                router.push('/login');
                            }}
                            className={`admin-shell-signout mt-3 flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${collapsed ? 'justify-center' : 'gap-2.5'
                                }`}
                        >
                            <LogOut className="h-4 w-4" />
                            {!collapsed && <span>Sign Out</span>}
                        </button>
                    </div>
                </div>
            </aside>

            <div className={`admin-shell-content transition-all duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
                <div className="min-h-screen">{children}</div>
            </div>
        </div>
    );
}
