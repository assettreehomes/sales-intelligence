'use client';

import { Building2 } from 'lucide-react';
import { BRANCH_OPTIONS, type BranchFilter, useBranchStore } from '@/stores/branchStore';

/** Sidebar branch picker: filters every admin page to one branch, or shows both. */
export function BranchPicker({ collapsed }: { collapsed: boolean }) {
    const branch = useBranchStore((s) => s.branch);
    const setBranch = useBranchStore((s) => s.setBranch);
    const current = BRANCH_OPTIONS.find((option) => option.value === branch) ?? BRANCH_OPTIONS[0];

    if (collapsed) {
        const next = BRANCH_OPTIONS[(BRANCH_OPTIONS.indexOf(current) + 1) % BRANCH_OPTIONS.length];
        return (
            <div className="px-3 pt-3">
                <button
                    type="button"
                    onClick={() => setBranch(next.value)}
                    className="admin-shell-branch-collapsed flex w-full flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-semibold"
                    title={`Branch: ${current.label} (click for ${next.label})`}
                    aria-label={`Branch: ${current.label}`}
                >
                    <Building2 className="h-4 w-4" />
                    {current.short}
                </button>
            </div>
        );
    }

    return (
        <div className="px-3 pt-3">
            <p className="admin-shell-nav-group-label flex items-center gap-1.5">
                <Building2 className="h-3 w-3" /> Branch
            </p>
            <div className="admin-shell-branch-picker grid grid-cols-3 gap-1 rounded-lg p-1" role="radiogroup" aria-label="Branch">
                {BRANCH_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={branch === option.value}
                        title={option.label}
                        onClick={() => setBranch(option.value as BranchFilter)}
                        className={`admin-shell-branch-option rounded-md px-1 py-1.5 text-xs font-semibold transition-colors ${branch === option.value ? 'is-active' : ''}`}
                    >
                        {option.short}
                    </button>
                ))}
            </div>
        </div>
    );
}

/** Small "Chrompet" / "Pammal" tag for cards and rows. */
export function BranchTag({ branch, className = '' }: { branch?: string | null; className?: string }) {
    if (!branch) return null;
    const option = BRANCH_OPTIONS.find((o) => o.value === branch);
    if (!option || option.value === 'all') return null;
    return (
        <span
            className={`branch-tag branch-tag--${option.value} inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
            title={option.label}
        >
            <Building2 className="h-2.5 w-2.5" />
            {option.short}
        </span>
    );
}
