'use client';

import { SegmentedToggle } from '@/components/SegmentedToggle';

type ViewMode = 'sales' | 'presales';

interface TicketsViewToggleProps {
    view: ViewMode;
    onChange: (view: ViewMode) => void;
    /** Compact size for top toolbar beside notification bell */
    compact?: boolean;
}

export function TicketsViewToggle({ view, onChange, compact = false }: TicketsViewToggleProps) {
    return (
        <SegmentedToggle
            value={view}
            onChange={onChange}
            size={compact ? 'toolbar' : 'md'}
            ariaLabel="Ticket repository view"
            options={[
                { value: 'sales', label: 'Sales' },
                { value: 'presales', label: 'Pre-Sales' },
            ]}
        />
    );
}
