'use client';

import { FilterDropdown, type FilterDropdownOption } from '@/components/FilterDropdown';

export type { FilterDropdownOption as FilterOption };

interface TicketsFilterSelectProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: FilterDropdownOption[];
    className?: string;
    disabled?: boolean;
}

export function TicketsFilterSelect({
    label,
    value,
    onChange,
    options,
    className = '',
    disabled = false,
}: TicketsFilterSelectProps) {
    return (
        <FilterDropdown
            variant="inline"
            label={label}
            value={value}
            onChange={onChange}
            options={options}
            disabled={disabled}
            className={className}
            menuMinWidth="100%"
        />
    );
}
