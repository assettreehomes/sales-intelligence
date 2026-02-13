'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

function useIsHydrated() {
    return useSyncExternalStore(
        () => () => { },
        () => true,
        () => false
    );
}

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const isHydrated = useIsHydrated();

    if (!isHydrated) return null;

    const isDark = theme === 'dark';

    return (
        <button
            type="button"
            onClick={toggleTheme}
            className="theme-toggle"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark space mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark space mode'}
        >
            <span className="theme-toggle__icon">
                {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </span>
            <span>{isDark ? 'Light' : 'Space'}</span>
        </button>
    );
}
