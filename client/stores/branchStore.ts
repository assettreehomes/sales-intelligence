import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Branch picker shared by every admin page: Asset Tree Homes Chrompet / Asset Tree Homes Pammal.
 * 'all' (the default) shows both branches. Remembered per browser.
 */
export type Branch = 'chrompet' | 'pammal';
export type BranchFilter = Branch | 'all';

export const BRANCH_OPTIONS: { value: BranchFilter; label: string; short: string }[] = [
    { value: 'all', label: 'All branches', short: 'All' },
    { value: 'chrompet', label: 'Asset Tree Homes Chrompet', short: 'Chrompet' },
    { value: 'pammal', label: 'Asset Tree Homes Pammal', short: 'Pammal' },
];

export function branchName(branch?: string | null): string {
    return BRANCH_OPTIONS.find((option) => option.value === branch)?.label ?? 'Asset Tree Homes Chrompet';
}

export function branchShortName(branch?: string | null): string {
    return BRANCH_OPTIONS.find((option) => option.value === branch)?.short ?? 'Chrompet';
}

interface BranchState {
    branch: BranchFilter;
    setBranch: (branch: BranchFilter) => void;
}

export const useBranchStore = create<BranchState>()(
    persist(
        (set) => ({
            branch: 'all',
            setBranch: (branch) => set({ branch }),
        }),
        {
            name: 'branch-filter',
            storage: createJSONStorage(() => localStorage),
        }
    )
);

/** Adds ?branch= to an API path when one branch is picked. */
export function withBranch(path: string, branch: BranchFilter = useBranchStore.getState().branch): string {
    if (branch === 'all') return path;
    return `${path}${path.includes('?') ? '&' : '?'}branch=${branch}`;
}
