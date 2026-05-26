/** Shared filter / select styling — light & dark */

export const filterTriggerInlineClass =
    'inline-flex min-h-[42px] min-w-[8.5rem] max-w-[14rem] items-center gap-2 rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-elevated)] px-3.5 py-2 text-left shadow-[var(--elevation-1)] transition-[border-color,box-shadow,background-color] hover:border-[var(--semantic-border-strong)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--semantic-primary),transparent_66%)] disabled:cursor-not-allowed disabled:opacity-60';

export const filterTriggerFieldClass =
    'flex w-full min-h-[44px] items-center justify-between gap-2 rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-elevated)] px-3.5 py-2.5 text-left shadow-[var(--elevation-1)] transition-[border-color,box-shadow,background-color] hover:border-[var(--semantic-border-strong)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--semantic-primary),transparent_66%)] disabled:cursor-not-allowed disabled:opacity-60';

export const filterLabelClass =
    'shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--semantic-text-muted)]';

export const filterValueClass =
    'min-w-0 flex-1 truncate text-sm font-semibold text-[var(--semantic-text-primary)]';

export const filterChevronClass =
    'h-4 w-4 shrink-0 text-[var(--semantic-text-muted)] transition-transform duration-200';

export const filterPanelClass =
    'max-h-64 overflow-auto rounded-xl border border-[var(--semantic-border)] bg-[var(--semantic-surface-elevated)] p-1.5 shadow-[var(--elevation-2)]';

export const filterPanelAnchoredClass =
    `absolute top-full z-[200] mt-1.5 ${filterPanelClass}`;

export function filterOptionClass(selected: boolean) {
    return `flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
        selected
            ? 'bg-[var(--semantic-selected-strong)] font-semibold text-[var(--semantic-primary)]'
            : 'text-[var(--semantic-text-secondary)] hover:bg-[var(--surface-hover)]'
    }`;
}

export const filterFieldLabelClass =
    'mb-2 block text-sm font-semibold text-[var(--semantic-text-secondary)]';
