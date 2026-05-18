/** Shared filter / select styling — light & dark */

export const filterTriggerInlineClass =
    'inline-flex min-h-[40px] min-w-[8.5rem] max-w-[13rem] items-center gap-2 rounded-lg border border-gray-300/90 bg-white px-3 py-2 text-left shadow-sm transition-[border-color,box-shadow] hover:border-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/25 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-500 dark:focus:border-violet-500 dark:focus:ring-violet-500/25';

export const filterTriggerFieldClass =
    'flex w-full min-h-[44px] items-center justify-between gap-2 rounded-lg border border-gray-300/90 bg-white px-3.5 py-2.5 text-left shadow-sm transition-[border-color,box-shadow] hover:border-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-500 dark:focus:border-violet-500 dark:focus:ring-violet-500/25';

export const filterLabelClass =
    'shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500';

export const filterValueClass =
    'min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-slate-100';

export const filterChevronClass =
    'h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 dark:text-slate-500';

export const filterPanelClass =
    'max-h-64 overflow-auto rounded-xl border border-gray-200/90 bg-white p-1.5 shadow-2xl shadow-black/10 ring-1 ring-black/5 dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/40 dark:ring-white/10';

export function filterOptionClass(selected: boolean) {
    return `flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
        selected
            ? 'bg-purple-50 font-medium text-purple-700 dark:bg-violet-500/15 dark:text-violet-300'
            : 'text-gray-700 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-800/80'
    }`;
}

export const filterFieldLabelClass =
    'mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300';
