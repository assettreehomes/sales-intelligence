'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

interface HeatmapData {
    date: string;
    count: number;
}

interface TicketHeatmapProps {
    onDateSelect?: (date: string | null) => void;
    selectedDate?: string | null;
}

export function TicketHeatmap({ onDateSelect, selectedDate }: TicketHeatmapProps) {
    const { session } = useAuth();
    const [data, setData] = useState<HeatmapData[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    useEffect(() => {
        if (!session?.access_token) return;

        async function fetchHeatmap() {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tickets/calendar-heatmap`, {
                    headers: {
                        Authorization: `Bearer ${session?.access_token}`,
                    },
                });
                if (!res.ok) throw new Error('Failed to fetch heatmap');
                const json = await res.json();
                setData(json);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }

        fetchHeatmap();
    }, [session]);

    const dataMap = useMemo(() => {
        const map = new Map<string, number>();
        data.forEach(d => map.set(d.date, d.count));
        return map;
    }, [data]);

    /** Returns inline background style for the cell fill based on ticket count */
    const getCellStyle = (count: number): React.CSSProperties => {
        if (count === 0) return {};
        if (count <= 2) return { backgroundColor: 'rgb(237, 233, 254)' };  // purple-100
        if (count <= 5) return { backgroundColor: 'rgb(196, 181, 253)' };  // purple-300
        if (count <= 10) return { backgroundColor: 'rgb(147, 51, 234)' };  // purple-600
        return { backgroundColor: 'rgb(109, 40, 217)' };                   // purple-700
    };

    /** Returns text colour for the day number so it remains readable against dark backgrounds */
    const getDayNumColor = (count: number): string => {
        if (count > 5) return 'text-white';
        return 'text-gray-700';
    };

    const daysInMonth = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days: (string | null)[] = [];

        for (let i = 0; i < firstDay.getDay(); i++) days.push(null);

        for (let i = 1; i <= lastDay.getDate(); i++) {
            const d = new Date(year, month, i);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            days.push(`${y}-${m}-${day}`);
        }

        return days;
    }, [currentMonth]);

    const handlePrevMonth = () => {
        setCurrentMonth(prev => {
            const d = new Date(prev);
            d.setMonth(prev.getMonth() - 1);
            return d;
        });
    };

    const handleNextMonth = () => {
        const today = new Date();
        const next = new Date(currentMonth);
        next.setMonth(currentMonth.getMonth() + 1);
        if (next.getFullYear() > today.getFullYear() ||
            (next.getFullYear() === today.getFullYear() && next.getMonth() > today.getMonth())) return;
        setCurrentMonth(next);
    };

    const isNextDisabled = useMemo(() => {
        const today = new Date();
        return currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear();
    }, [currentMonth]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <Loader2 className="w-8 h-8 text-gray-300 animate-spin" />
            </div>
        );
    }

    const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-base font-semibold text-gray-900">Activity Calendar</h3>

                <div className="flex items-center gap-4">
                    {/* Month navigator */}
                    <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1 border border-gray-200">
                        <button
                            onClick={handlePrevMonth}
                            className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 hover:text-gray-900 transition-all"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="w-32 text-center text-sm font-medium text-gray-700 select-none">
                            {monthName}
                        </span>
                        <button
                            onClick={handleNextMonth}
                            disabled={isNextDisabled}
                            className={`p-1.5 rounded-md transition-all ${isNextDisabled
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'hover:bg-white hover:shadow-sm text-gray-500 hover:text-gray-900'}`}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-2 text-xs text-gray-500 border-l border-gray-200 pl-4">
                        <span>Low</span>
                        <div className="flex gap-1">
                            <div className="w-3 h-3 rounded-sm bg-purple-100" />
                            <div className="w-3 h-3 rounded-sm bg-purple-300" />
                            <div className="w-3 h-3 rounded-sm bg-purple-600" />
                        </div>
                        <span>High</span>
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
                {/* Week day headers */}
                {weekDays.map(day => (
                    <div key={day} className="bg-gray-50 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {day}
                    </div>
                ))}

                {/* Day cells */}
                {daysInMonth.map((dateStr, idx) => {
                    if (!dateStr) {
                        return <div key={`empty-${idx}`} className="bg-white h-24" />;
                    }

                    const dayNum = parseInt(dateStr.split('-')[2], 10);
                    const count = dataMap.get(dateStr) || 0;
                    const isSelected = selectedDate === dateStr;
                    const isToday = new Date().toDateString() === new Date(dateStr + 'T12:00:00').toDateString();
                    const tooltipText = count === 0
                        ? 'No tickets'
                        : `${count} ${count === 1 ? 'ticket' : 'tickets'}`;

                    return (
                        <div
                            key={dateStr}
                            onClick={() => onDateSelect?.(isSelected ? null : dateStr)}
                            style={isSelected ? undefined : getCellStyle(count)}
                            className={`
                                h-24 p-2 flex flex-col justify-start cursor-pointer transition-all relative group overflow-visible
                                ${isSelected
                                    ? 'bg-purple-800'
                                    : count === 0 ? 'bg-white hover:bg-gray-50' : ''}
                            `}
                        >
                            {/* Day number badge */}
                            <span className={`
                                text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0
                                ${isToday
                                    ? 'bg-black text-white'
                                    : isSelected
                                        ? 'text-white font-bold'
                                        : getDayNumColor(count)}
                            `}>
                                {dayNum}
                            </span>

                            {/* Floating tooltip */}
                            <div className="
                                absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[100]
                                bg-gray-900 text-white text-xs rounded-md px-2.5 py-1.5 whitespace-nowrap
                                opacity-0 group-hover:opacity-100 transition-opacity duration-150
                                pointer-events-none shadow-xl
                            ">
                                <span className="font-medium">{dateStr}</span>
                                <span className="mx-1 text-gray-400">·</span>
                                {tooltipText}
                                {/* Arrow */}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900" />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
