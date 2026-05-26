'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import {
    filterChevronClass,
    filterFieldLabelClass,
    filterLabelClass,
    filterOptionClass,
    filterPanelClass,
    filterTriggerFieldClass,
    filterTriggerInlineClass,
    filterValueClass,
} from './filter-ui';

export interface FilterDropdownOption {
    value: string;
    label: string;
}

interface FilterDropdownProps {
    value: string;
    onChange: (value: string) => void;
    options: FilterDropdownOption[];
    /** Small caps label shown inside trigger (inline toolbar style) */
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    /** inline = filter toolbar, field = form with label above, bare = trigger only */
    variant?: 'inline' | 'field' | 'bare';
    /** Block label for field variant */
    fieldLabel?: string;
    required?: boolean;
    align?: 'left' | 'right';
    menuMinWidth?: string;
}

type MenuPosition = {
    top: number;
    left: number;
    minWidth: number;
};

export function FilterDropdown({
    value,
    onChange,
    options,
    label,
    placeholder = 'Select...',
    disabled = false,
    className = '',
    variant = 'inline',
    fieldLabel,
    required = false,
    align = 'left',
    menuMinWidth,
}: FilterDropdownProps) {
    const [open, setOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const selected = options.find((o) => o.value === value);
    const displayValue = selected?.label ?? placeholder;

    const updateMenuPosition = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;

        const rect = trigger.getBoundingClientRect();
        const minWidth =
            menuMinWidth === '100%'
                ? rect.width
                : menuMinWidth
                  ? parseFloat(menuMinWidth) || rect.width
                  : rect.width;

        setMenuPosition({
            top: rect.bottom + 6,
            left: align === 'right' ? rect.right - minWidth : rect.left,
            minWidth,
        });
    }, [align, menuMinWidth]);

    useLayoutEffect(() => {
        if (!open) return;
        updateMenuPosition();
    }, [open, options, updateMenuPosition]);

    useEffect(() => {
        if (!open) return;

        function onOutsideClick(e: MouseEvent) {
            const target = e.target as Node;
            if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            setOpen(false);
        }

        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }

        function onReposition() {
            updateMenuPosition();
        }

        // Defer so the opening click does not immediately close the menu
        const outsideTimer = window.setTimeout(() => {
            document.addEventListener('click', onOutsideClick, true);
        }, 0);

        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', onReposition);
        window.addEventListener('scroll', onReposition, true);

        return () => {
            window.clearTimeout(outsideTimer);
            document.removeEventListener('click', onOutsideClick, true);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onReposition);
            window.removeEventListener('scroll', onReposition, true);
        };
    }, [open, updateMenuPosition]);

    const triggerClass =
        variant === 'field' ? filterTriggerFieldClass : filterTriggerInlineClass;

    const trigger = (
        <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => !disabled && setOpen((o) => !o)}
            className={`${triggerClass} ${variant === 'bare' ? 'w-full' : ''} ${className}`.trim()}
        >
            {variant === 'inline' && label ? (
                <span className={filterLabelClass}>{label}</span>
            ) : null}
            <span className={`${filterValueClass} ${!selected ? 'text-[var(--semantic-text-muted)]' : ''}`}>
                {displayValue}
            </span>
            <ChevronDown className={`${filterChevronClass} ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
    );

    const menu =
        open && menuPosition ? (
            <div
                ref={menuRef}
                role="listbox"
                data-filter-dropdown-menu
                className={filterPanelClass}
                style={{
                    position: 'fixed',
                    top: menuPosition.top,
                    left: Math.max(8, menuPosition.left),
                    minWidth: menuPosition.minWidth,
                    zIndex: 9999,
                }}
            >
                {options.map((opt) => {
                    const isSelected = opt.value === value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={filterOptionClass(isSelected)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                onChange(opt.value);
                                setOpen(false);
                            }}
                        >
                            <span className="truncate">{opt.label}</span>
                            {isSelected ? (
                                <Check className="h-4 w-4 shrink-0 text-[var(--semantic-primary)]" />
                            ) : null}
                        </button>
                    );
                })}
            </div>
        ) : null;

    const portaledMenu = menu && typeof document !== 'undefined' ? createPortal(menu, document.body) : null;

    if (variant === 'field') {
        return (
            <div className={className}>
                {fieldLabel ? (
                    <label className={filterFieldLabelClass}>
                        {fieldLabel}
                        {required ? <span className="text-[var(--semantic-danger)]"> *</span> : null}
                    </label>
                ) : null}
                <div ref={rootRef} className="relative">
                    {trigger}
                    {portaledMenu}
                </div>
            </div>
        );
    }

    return (
        <div ref={rootRef} className={`relative ${className}`.trim()}>
            {trigger}
            {portaledMenu}
        </div>
    );
}
