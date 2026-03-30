'use client';

import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

import {
    type LucideIcon,
    AlertCircle,
    BarChart3,
    Building2,
    Camera,
    ClipboardList,
    GraduationCap,
    LogOut,
    Menu,
    Moon,
    PanelLeftClose,
    PanelLeftOpen,
    Radio,
    Shield,
    Sun,
    User,
    UserPlus,
    Users
} from 'lucide-react';

type AdminSection =
    | 'tickets'
    | 'excuses'
    | 'assign'
    | 'employees'
    | 'training'
    | 'activity'
    | 'performance'
    | 'live'
    | 'imou'
    | 'sellDo'
    | 'antivirus';

interface AdminShellProps {
    activeSection: AdminSection;
    children: ReactNode;
}

type AdminNavItem = {
    id: AdminSection;
    label: string;
    icon: LucideIcon;
    href?: string;
    onClick?: () => void;
};

const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed';
const MOBILE_MENU_BUTTON_POS_KEY = 'admin-mobile-menu-button-position';
const MOBILE_MENU_BUTTON_SIZE = 40;
const MOBILE_MENU_BUTTON_MARGIN = 8;
const IMOU_READY_KEY = 'admin-imou-ready';
const IMOU_PROTOCOL = 'imoulauncher://';
const SELL_DO_URL = 'about:blank';
const ANTIVIRUS_APP_URL = 'about:blank';
const PS_REG_COMMAND =
    `reg add "HKCU\\Software\\Classes\\imoulauncher" /ve /d "URL:IMOU Launcher" /f` +
    ` ; reg add "HKCU\\Software\\Classes\\imoulauncher" /v "URL Protocol" /d "" /f` +
    ` ; reg add "HKCU\\Software\\Classes\\imoulauncher\\shell\\open\\command" /ve /d '"C:\\Program Files\\Imou_en\\bin\\Imou_en.exe"' /f`;

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
    const [imouSetupOpen, setImouSetupOpen] = useState(false);
    const [imouCmdCopied, setImouCmdCopied] = useState(false);
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

    const homeHref = (profile?.role === 'intern' || profile?.role === 'employee') ? '/intern' : '/admin/performance';

    const openExternalInNewTab = useCallback((url: string) => {
        if (typeof window === 'undefined') return;
        window.open(url, '_blank', 'noopener,noreferrer');
    }, []);

    const openSellDo = useCallback(() => {
        openExternalInNewTab(SELL_DO_URL);
    }, [openExternalInNewTab]);

    const openAntivirusApp = useCallback(() => {
        openExternalInNewTab(ANTIVIRUS_APP_URL);
    }, [openExternalInNewTab]);

    const openImou = useCallback(() => {
        if (typeof window === 'undefined') return;

        const isReady = window.localStorage.getItem(IMOU_READY_KEY) === '1';
        if (!isReady) {
            setImouSetupOpen(true);
            return;
        }

        window.location.href = IMOU_PROTOCOL;
    }, []);

    const copyImouSetupCmd = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(PS_REG_COMMAND);
            setImouCmdCopied(true);
            window.setTimeout(() => setImouCmdCopied(false), 2500);
        } catch {
            // fallback: select the text in a textarea
        }
    }, []);

    const confirmImouReady = useCallback(() => {
        window.localStorage.setItem(IMOU_READY_KEY, '1');
        setImouSetupOpen(false);
    }, []);

    const navItems = useMemo<AdminNavItem[]>(() => {
        if (profile?.role === 'intern' || profile?.role === 'employee') {
            return [
                { id: 'training' as const, label: 'Training', icon: GraduationCap, href: '/intern' }
            ];
        }

        return [
            { id: 'performance' as const, label: 'Performance', icon: BarChart3, href: '/admin/performance' },
            { id: 'tickets' as const, label: 'Tickets', icon: Radio, href: '/admin/tickets' },
            { id: 'sellDo' as const, label: 'Sell.Do CRM', icon: Building2, onClick: openSellDo },
            { id: 'antivirus' as const, label: 'Antivirus App', icon: Shield, onClick: openAntivirusApp },
            { id: 'excuses' as const, label: 'Excuses', icon: AlertCircle, href: '/admin/excuses' },
            { id: 'assign' as const, label: 'Assign', icon: Users, href: '/admin/assign' },
            { id: 'employees' as const, label: 'Employees', icon: UserPlus, href: '/admin/employees' },
            { id: 'activity' as const, label: 'Activity Log', icon: ClipboardList, href: '/admin/activity' },
            { id: 'live' as const, label: 'Live Status', icon: Radio, href: '/admin/live' },
            { id: 'imou' as const, label: 'CCTV Video', icon: Camera, onClick: openImou }
        ];
    }, [profile?.role, openAntivirusApp, openImou, openSellDo]);

    return (
        <div className={`admin-shell min-h-screen ${activeSection === 'performance' ? 'admin-shell--performance' : ''}`}>

            {/* CCTV Video Setup Modal */}
            {imouSetupOpen && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={(e) => { if (e.target === e.currentTarget) setImouSetupOpen(false); }}
                >
                    <div className="admin-shell-imou-modal mx-4 w-full max-w-lg rounded-2xl p-6 shadow-2xl">
                        <div className="mb-3 flex items-center gap-3">
                            <Camera className="h-5 w-5 shrink-0 text-blue-500" />
                            <h2 className="text-base font-semibold">One-time CCTV Video Setup</h2>
                        </div>
                        <p className="admin-shell-imou-modal-desc mb-4 text-sm">
                            Run this command once in any terminal to register the CCTV Video launcher:
                        </p>

                        {/* Command box */}
                        <div className="admin-shell-imou-cmd-box mb-4 flex items-start gap-2 rounded-xl p-3">
                            <code className="admin-shell-imou-cmd-text flex-1 break-all text-xs leading-relaxed">
                                {PS_REG_COMMAND}
                            </code>
                            <button
                                type="button"
                                onClick={copyImouSetupCmd}
                                className="admin-shell-imou-copy-btn shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                            >
                                {imouCmdCopied ? '✓ Copied!' : 'Copy'}
                            </button>
                        </div>

                        <ol className="admin-shell-imou-modal-steps mb-5 space-y-2 text-sm">
                            <li className="flex items-start gap-3">
                                <span className="admin-shell-imou-modal-step-num">1</span>
                                <span>Press <strong>Win + X</strong> → <strong>Terminal</strong> (or PowerShell) → paste the command above → press <strong>Enter</strong>.</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="admin-shell-imou-modal-step-num">2</span>
                                <span>Click <strong>&ldquo;Done — close&rdquo;</strong> below, then click <strong>CCTV Video</strong> in the sidebar.</span>
                            </li>
                        </ol>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={confirmImouReady}
                                className="admin-shell-imou-modal-confirm flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                            >
                                Done — close
                            </button>
                            <button
                                type="button"
                                onClick={() => setImouSetupOpen(false)}
                                className="admin-shell-imou-modal-cancel rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
                    } ${collapsed ? 'w-20' : 'w-[240px]'}`}
            >
                <div className="flex h-full w-full flex-col">
                    <div className={`admin-shell-brand relative flex items-center px-4 py-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
                        <Link href={homeHref} className="flex items-center gap-2 overflow-hidden">
                            <Image
                                src="/ATH%20logo/ATH-small-logo.png"
                                alt="ATH"
                                width={32}
                                height={32}
                                priority
                                className="h-8 w-8 shrink-0 rounded-lg object-contain"
                            />
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
                                item.onClick ? (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`${baseClass} ${activeClass}`}
                                        onClick={() => {
                                            item.onClick?.();
                                            setMobileOpen(false);
                                        }}
                                        onContextMenu={undefined}
                                    >
                                        <item.icon className={`admin-shell-nav-icon h-5 w-5 ${iconClass}`} />
                                        {!collapsed && <span>{item.label}</span>}
                                    </button>
                                ) : (
                                    <Link
                                        key={item.id}
                                        href={item.href ?? homeHref}
                                        className={`${baseClass} ${activeClass}`}
                                        onClick={() => setMobileOpen(false)}
                                    >
                                        <item.icon className={`admin-shell-nav-icon h-5 w-5 ${iconClass}`} />
                                        {!collapsed && <span>{item.label}</span>}
                                    </Link>
                                )
                            );
                        })}
                    </nav>

                    <div className="admin-shell-footer px-3 py-4">
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

            <div className={`admin-shell-content transition-all duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-[240px]'}`}>
                <div className="min-h-screen">{children}</div>
            </div>
        </div>
    );
}

