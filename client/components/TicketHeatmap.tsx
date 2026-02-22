'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface HeatmapData {
    date: string;
    count: number;
}

interface TicketHeatmapProps {
    onDateSelect?: (date: string | null) => void;
    selectedDate?: string | null;
}

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type HeatmapTone = {
    bg: string;
    hoverBg: string;
    border: string;
    text: string;
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
};

const LIGHT_HEATMAP_TONES: HeatmapTone[] = [
    {
        bg: '#ffffff',
        hoverBg: '#f4f7fb',
        border: '#d9e2ee',
        text: '#243246',
        badgeBg: 'rgba(255, 255, 255, 0.9)',
        badgeBorder: '#c6d3e4',
        badgeText: '#2f445e',
    },
    {
        bg: '#f3eeff',
        hoverBg: '#ebe2ff',
        border: '#e1d3ff',
        text: '#38245a',
        badgeBg: 'rgba(250, 246, 255, 0.92)',
        badgeBorder: '#d0b9ff',
        badgeText: '#6530b0',
    },
    {
        bg: '#e5d8ff',
        hoverBg: '#dbc8ff',
        border: '#cdb3ff',
        text: '#321b55',
        badgeBg: 'rgba(247, 240, 255, 0.9)',
        badgeBorder: '#be9dff',
        badgeText: '#5d2ba8',
    },
    {
        bg: '#cdb1ff',
        hoverBg: '#c3a0ff',
        border: '#b08df1',
        text: '#2b114f',
        badgeBg: 'rgba(241, 232, 255, 0.9)',
        badgeBorder: '#a27de8',
        badgeText: '#4d1f93',
    },
    {
        bg: '#ab7df3',
        hoverBg: '#9a68eb',
        border: '#935adf',
        text: '#ffffff',
        badgeBg: 'rgba(8, 10, 22, 0.34)',
        badgeBorder: 'rgba(255, 255, 255, 0.38)',
        badgeText: '#ffffff',
    },
    {
        bg: '#833fd8',
        hoverBg: '#742ec7',
        border: '#6a24bb',
        text: '#ffffff',
        badgeBg: 'rgba(7, 9, 19, 0.38)',
        badgeBorder: 'rgba(255, 255, 255, 0.4)',
        badgeText: '#ffffff',
    },
];

const DARK_HEATMAP_TONES: HeatmapTone[] = [
    {
        bg: '#102447',
        hoverBg: '#16315a',
        border: '#2c4a71',
        text: '#cfe0fb',
        badgeBg: 'rgba(20, 39, 73, 0.9)',
        badgeBorder: '#3a5a85',
        badgeText: '#cfe0fb',
    },
    {
        bg: '#1b2f5a',
        hoverBg: '#253b6c',
        border: '#36517f',
        text: '#d8e5ff',
        badgeBg: 'rgba(39, 56, 98, 0.88)',
        badgeBorder: '#4f69a0',
        badgeText: '#d8e5ff',
    },
    {
        bg: '#2a3168',
        hoverBg: '#353c77',
        border: '#46508f',
        text: '#ece7ff',
        badgeBg: 'rgba(54, 59, 114, 0.88)',
        badgeBorder: '#646eb2',
        badgeText: '#ece7ff',
    },
    {
        bg: '#3d3a7e',
        hoverBg: '#4a458d',
        border: '#6159a9',
        text: '#f3edff',
        badgeBg: 'rgba(66, 61, 134, 0.9)',
        badgeBorder: '#7b74c9',
        badgeText: '#f3edff',
    },
    {
        bg: '#58449a',
        hoverBg: '#654fac',
        border: '#7a63c3',
        text: '#ffffff',
        badgeBg: 'rgba(11, 16, 35, 0.5)',
        badgeBorder: 'rgba(255, 255, 255, 0.42)',
        badgeText: '#ffffff',
    },
    {
        bg: '#724dca',
        hoverBg: '#7e5ad7',
        border: '#9573e6',
        text: '#ffffff',
        badgeBg: 'rgba(9, 12, 28, 0.56)',
        badgeBorder: 'rgba(255, 255, 255, 0.44)',
        badgeText: '#ffffff',
    },
];

const LIGHT_SELECTED_TONE: HeatmapTone = {
    bg: '#6a24bb',
    hoverBg: '#5d1fa7',
    border: '#5a199f',
    text: '#ffffff',
    badgeBg: 'rgba(7, 9, 19, 0.46)',
    badgeBorder: 'rgba(255, 255, 255, 0.44)',
    badgeText: '#ffffff',
};

const DARK_SELECTED_TONE: HeatmapTone = {
    bg: '#8a63ea',
    hoverBg: '#7d58de',
    border: '#aa8dfa',
    text: '#ffffff',
    badgeBg: 'rgba(8, 12, 28, 0.62)',
    badgeBorder: 'rgba(255, 255, 255, 0.45)',
    badgeText: '#ffffff',
};

function getIntensityLevel(count: number, max: number): number {
    if (count <= 0 || max <= 0) return 0;
    const ratio = count / max;
    if (ratio >= 0.85) return 5;
    if (ratio >= 0.65) return 4;
    if (ratio >= 0.45) return 3;
    if (ratio >= 0.25) return 2;
    return 1;
}

function getHeatmapTone(level: number, isSelected: boolean, isDarkTheme: boolean): HeatmapTone {
    if (isSelected) return isDarkTheme ? DARK_SELECTED_TONE : LIGHT_SELECTED_TONE;

    const tones = isDarkTheme ? DARK_HEATMAP_TONES : LIGHT_HEATMAP_TONES;
    const normalizedLevel = Math.max(0, Math.min(5, level));
    return tones[normalizedLevel];
}

export function TicketHeatmap({ onDateSelect, selectedDate }: TicketHeatmapProps) {
    const { session } = useAuth();
    const { theme } = useTheme();
    const [data, setData] = useState<HeatmapData[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    useEffect(() => {
        const accessToken = session?.access_token;
        if (!accessToken) return;

        async function fetchHeatmap() {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tickets/calendar-heatmap`, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                });
                if (!res.ok) throw new Error('Failed to fetch heatmap');
                const json = await res.json();
                setData(Array.isArray(json) ? json : []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }

        void fetchHeatmap();
    }, [session]);

    const dataMap = useMemo(() => {
        const map = new Map<string, number>();
        data.forEach((d) => map.set(d.date, d.count));
        return map;
    }, [data]);

    const daysInMonth = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days: (string | null)[] = [];

        for (let i = 0; i < firstDay.getDay(); i += 1) days.push(null);

        for (let i = 1; i <= lastDay.getDate(); i += 1) {
            const d = new Date(year, month, i);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            days.push(`${y}-${m}-${day}`);
        }

        while (days.length % 7 !== 0) days.push(null);
        return days;
    }, [currentMonth]);

    const monthDates = useMemo(() => daysInMonth.filter((d): d is string => d !== null), [daysInMonth]);

    const monthStats = useMemo(() => {
        const counts = monthDates.map((date) => dataMap.get(date) || 0);
        const total = counts.reduce((sum, value) => sum + value, 0);
        const max = counts.length ? Math.max(...counts) : 0;
        const activeDays = counts.filter((value) => value > 0).length;
        const avgPerDay = counts.length ? total / counts.length : 0;
        return { total, max, activeDays, avgPerDay };
    }, [monthDates, dataMap]);

    const handlePrevMonth = () => {
        setCurrentMonth((prev) => {
            const d = new Date(prev);
            d.setMonth(prev.getMonth() - 1);
            return d;
        });
    };

    const handleNextMonth = () => {
        const today = new Date();
        const next = new Date(currentMonth);
        next.setMonth(currentMonth.getMonth() + 1);
        if (
            next.getFullYear() > today.getFullYear() ||
            (next.getFullYear() === today.getFullYear() && next.getMonth() > today.getMonth())
        ) {
            return;
        }
        setCurrentMonth(next);
    };

    const isNextDisabled = useMemo(() => {
        const today = new Date();
        return (
            currentMonth.getMonth() === today.getMonth() &&
            currentMonth.getFullYear() === today.getFullYear()
        );
    }, [currentMonth]);

    const monthLabel = currentMonth.toLocaleString('default', {
        month: 'long',
        year: 'numeric',
    });

    const isDarkTheme = theme === 'dark';
    const legendTones = (isDarkTheme ? DARK_HEATMAP_TONES : LIGHT_HEATMAP_TONES).slice(1);

    if (loading) {
        return (
            <section
                className="mb-6 flex min-h-72 items-center justify-center rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                aria-label="Loading daily ticket heatmap"
            >
                <div className="inline-flex items-center gap-2 text-sm font-medium text-gray-500">
                    <Loader2 className="h-7 w-7 animate-spin" />
                    <span>Loading ticket intensity...</span>
                </div>
            </section>
        );
    }

    return (
        <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="Daily ticket intensity heatmap">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900">Daily Ticket Intensity Heatmap</h3>
                    <p className="mt-1 text-sm text-gray-500">
                        Daily ticket volume for the selected month. Select a day to filter repository results.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">Total Tickets</p>
                        <p className="text-base font-bold text-purple-900">{monthStats.total}</p>
                    </div>
                    <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">Active Days</p>
                        <p className="text-base font-bold text-purple-900">{monthStats.activeDays}</p>
                    </div>
                    <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">Avg / Day</p>
                        <p className="text-base font-bold text-purple-900">{monthStats.avgPerDay.toFixed(1)}</p>
                    </div>
                </div>
            </div>

            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="inline-flex w-fit items-center rounded-lg border border-gray-200 bg-gray-50 p-1" role="group" aria-label="Heatmap month navigation">
                    <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="rounded-md p-2 text-gray-500 transition-colors hover:bg-white hover:text-gray-900"
                        aria-label="Previous month"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="min-w-36 px-2 text-center text-lg font-semibold text-gray-900">{monthLabel}</span>
                    <button
                        type="button"
                        onClick={handleNextMonth}
                        disabled={isNextDisabled}
                        className={`rounded-md p-2 transition-colors ${
                            isNextDisabled
                                ? 'cursor-not-allowed text-gray-300'
                                : 'text-gray-500 hover:bg-white hover:text-gray-900'
                        }`}
                        aria-label="Next month"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                <div className="inline-flex flex-wrap items-center gap-2 text-sm text-gray-500" aria-label="Heatmap intensity scale">
                    <span>Low</span>
                    {legendTones.map((tone, index) => (
                        <span
                            key={`legend-${index + 1}`}
                            className="h-3 w-3 rounded border"
                            style={{ backgroundColor: tone.bg, borderColor: tone.border }}
                        />
                    ))}
                    <span>High</span>
                    <span className="font-medium text-gray-600">0 to {monthStats.max} tickets</span>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-2">
                <div className="mb-1 grid grid-cols-7 gap-1">
                    {WEEK_DAYS.map((day) => (
                        <div
                            key={day}
                            className="rounded-md px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                    {daysInMonth.map((dateStr, index) => {
                        if (!dateStr) {
                            return <div key={`empty-${index}`} className="invisible min-h-[88px]" aria-hidden="true" />;
                        }

                        const count = dataMap.get(dateStr) || 0;
                        const level = getIntensityLevel(count, monthStats.max);
                        const dayNumber = Number.parseInt(dateStr.split('-')[2], 10);
                        const isSelected = selectedDate === dateStr;
                        const dateForCompare = new Date(`${dateStr}T12:00:00`);
                        const isToday = new Date().toDateString() === dateForCompare.toDateString();
                        const avg = monthStats.avgPerDay;
                        const deltaPct = avg > 0 ? ((count - avg) / avg) * 100 : 0;
                        const deltaText = avg > 0
                            ? `${Math.abs(deltaPct).toFixed(0)}% ${deltaPct >= 0 ? 'above' : 'below'} month avg`
                            : 'No month average yet';
                        const tooltip = `${dateForCompare.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} - ${count} ${count === 1 ? 'ticket' : 'tickets'} - ${deltaText}`;
                        const tone = getHeatmapTone(level, isSelected, isDarkTheme);
                        const isStrong = level >= 4 || isSelected;
                        const dayNumberStyle: React.CSSProperties = isToday
                            ? {
                                backgroundColor: isDarkTheme ? '#f8fafc' : '#0f172a',
                                color: isDarkTheme ? '#0f172a' : '#ffffff',
                            }
                            : {
                                color: tone.text,
                            };
                        const cellStyle = {
                            '--heatmap-bg': tone.bg,
                            '--heatmap-bg-hover': tone.hoverBg,
                            '--heatmap-border': tone.border,
                            '--heatmap-text': tone.text,
                        } as React.CSSProperties;
                        const badgeStyle: React.CSSProperties = isStrong
                            ? {
                                borderColor: 'rgba(255, 255, 255, 0.4)',
                                backgroundColor: isDarkTheme ? 'rgba(9, 12, 28, 0.55)' : 'rgba(17, 24, 39, 0.32)',
                                color: '#ffffff',
                            }
                            : {
                                borderColor: tone.badgeBorder,
                                backgroundColor: tone.badgeBg,
                                color: tone.badgeText,
                            };

                        return (
                            <button
                                key={dateStr}
                                type="button"
                                onClick={() => onDateSelect?.(isSelected ? null : dateStr)}
                                title={tooltip}
                                style={cellStyle}
                                className="group relative min-h-[88px] rounded-lg border p-2 text-left transition-colors duration-200 [background-color:var(--heatmap-bg)] hover:[background-color:var(--heatmap-bg-hover)] [border-color:var(--heatmap-border)] [color:var(--heatmap-text)]"
                                aria-label={tooltip}
                            >
                                <div className="flex items-start justify-start">
                                    <span
                                        className="inline-flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-semibold"
                                        style={dayNumberStyle}
                                    >
                                        {dayNumber}
                                    </span>
                                </div>

                                {count > 0 && (
                                    <span
                                        style={badgeStyle}
                                        className="absolute bottom-2 right-2 inline-flex min-w-6 items-center justify-center rounded-full border px-1.5 py-0.5 text-xs font-bold"
                                    >
                                        {count}
                                    </span>
                                )}

                                <div
                                    className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                                    role="tooltip"
                                >
                                    {tooltip}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-[5px] border-t-[5px] border-x-transparent border-t-gray-900" />
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
