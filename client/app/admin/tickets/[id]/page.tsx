'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminShell } from '@/components/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { FilterDropdown } from '@/components/FilterDropdown';
import { useTicketDetailStore } from '@/stores/ticketDetailStore';
import { API_URL, getToken } from '@/stores/authStore';
import { notifyError, notifyInfo, notifySuccess } from '@/lib/toast';
import {
    ArrowLeft,
    Play,
    Pause,
    RotateCcw,
    VolumeX,
    Volume1,
    Volume2,
    Gauge,
    Download,
    ThumbsUp,
    Smile,
    Zap,
    Users,
    Star,
    Clock,
    CheckCircle,
    XCircle,
    AlertTriangle,
    ChevronRight,
    AlertCircle,
    RefreshCcw,
    TrendingUp,
    TrendingDown,
    Minus,
    Sparkles,
    Loader2,
    Trash2,
    Flag,
    Copy,
    Share2,
    X,
    Link2,
    Camera,
    FileText,
    Save,
    Edit3,
    Eye
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/contexts/AuthContext';
import { TicketDetailWorkspace } from './TicketDetailWorkspace';
import { TicketStickyPlayer } from './TicketStickyPlayer';
import { TicketCoachingCards } from './TicketCoachingCards';
import { ConversationComparisonChart } from '@/components/ui/charts';

type ParsedScoreChange = {
    key: string;
    label: string;
    current: number;
    previous: number;
    change: number;
};

type ComparisonInsights = {
    deltaScore: number | null;
    overallNarrative: string | null;
    keyDifferences: string[];
    improvements: string[];
    regressions: string[];
    unchanged: string[];
    scoreChanges: ParsedScoreChange[];
};

const AUDIO_VOLUME_STORAGE_KEY = 'ticketintel-audio-volume';
const AUDIO_MUTE_STORAGE_KEY = 'ticketintel-audio-muted';
const AUDIO_LAST_VOLUME_STORAGE_KEY = 'ticketintel-audio-last-volume';
const AUDIO_SPEED_STORAGE_KEY = 'ticketintel-audio-speed';
const AUDIO_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type AudioPreferences = {
    volume: number;
    isMuted: boolean;
    lastVolume: number;
    speed: number;
};

const getStoredAudioPreferences = (): AudioPreferences => {
    if (typeof window === 'undefined') {
        return {
            volume: 1,
            isMuted: false,
            lastVolume: 1,
            speed: 1
        };
    }

    const storedVolume = Number(window.localStorage.getItem(AUDIO_VOLUME_STORAGE_KEY));
    const normalizedVolume = Number.isFinite(storedVolume) ? clamp(storedVolume, 0, 1) : 1;

    const storedLastVolume = Number(window.localStorage.getItem(AUDIO_LAST_VOLUME_STORAGE_KEY));
    const normalizedLastVolume = Number.isFinite(storedLastVolume)
        ? clamp(storedLastVolume, 0, 1)
        : Math.max(normalizedVolume, 0.5);

    const storedMuted = window.localStorage.getItem(AUDIO_MUTE_STORAGE_KEY) === '1';
    const storedSpeed = Number(window.localStorage.getItem(AUDIO_SPEED_STORAGE_KEY));
    const normalizedSpeed = (AUDIO_SPEED_OPTIONS as readonly number[]).includes(storedSpeed)
        ? storedSpeed
        : 1;

    return {
        volume: normalizedVolume,
        isMuted: storedMuted || normalizedVolume <= 0,
        lastVolume: normalizedLastVolume > 0 ? normalizedLastVolume : 1,
        speed: normalizedSpeed
    };
};

const isEditableShortcutTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    if (target.tagName === 'TEXTAREA') return true;
    if (target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        return input.type !== 'range' && input.type !== 'button' && input.type !== 'checkbox' && input.type !== 'radio';
    }
    return false;
};

/* ───────────────────────────────────────────────────
   TicketNotesSection — GitHub-style Write / Preview
   ─────────────────────────────────────────────────── */
type EmployeeNoteTemplate = {
    id: string;
    name: string;
    description: string;
    markdown: string;
};

const EMPLOYEE_NOTE_TEMPLATES: EmployeeNoteTemplate[] = [
    {
        id: 'handoff',
        name: 'Shift Handoff',
        description: 'Structured handoff with ownership and pending actions.',
        markdown: `## Shift Handoff
- Employee: @EmployeeName
- Date: {{DATE}}
- Shift: @Shift

### Completed
- [ ] 

### Pending
- [ ] `,
    },
    {
        id: 'coaching',
        name: 'Coaching Note',
        description: 'Manager feedback with action plan and due dates.',
        markdown: `## Coaching Follow-up
- Employee: @EmployeeName
- Reviewer: @ReviewerName
- Date: {{DATE}}

### Strengths
- 

### Action Plan
- [ ] (Owner: @EmployeeName, Due: @DueDate)`,
    },
    {
        id: 'escalation',
        name: 'Escalation Summary',
        description: 'Escalation-ready summary for quick handoff.',
        markdown: `## Escalation Summary
- Raised By: @EmployeeName
- Date: {{DATE}}
- Severity: @Severity

### Issue
- 

### Required Support
- `,
    },
];

const NOTE_QUICK_SNIPPETS = [
    { label: 'Checklist', value: `- [ ] Action item\n- [ ] Owner: @Owner\n- [ ] Due: @DueDate\n` },
    { label: 'Follow-up', value: `### Follow-up\n- Owner: @Owner\n- Date: @FollowUpDate\n- Notes:\n` },
    { label: 'Customer Quote', value: `> "Customer statement"\n` },
    { label: 'Time Stamp', value: `> Updated: {{DATE}} {{TIME}}\n` },
];

const NOTE_DRAFT_STORAGE_PREFIX = 'ticketintel-note-draft';

const hydrateTemplateTokens = (value: string) => {
    const now = new Date();
    const dateLabel = now.toLocaleDateString();
    const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return value
        .replace(/\{\{DATE\}\}/g, dateLabel)
        .replace(/\{\{TIME\}\}/g, timeLabel);
};

function maskPhone(num: string | null | undefined): string {
    if (!num) return 'Unknown';
    const str = String(num).replace(/\D/g, '');
    if (str.length === 12 && str.startsWith('91')) return `+91 ${str.slice(2, 7)} XXXXX`;
    if (str.length === 10) return `${str.slice(0, 5)} XXXXX`;
    return str.slice(0, -5) + 'XXXXX';
}

function TicketNotesSection({ ticketId, initialNotes }: { ticketId: string; initialNotes: string }) {
    const [notes, setNotes] = useState(initialNotes);
    const [draft, setDraft] = useState(initialNotes);
    const [isEditing, setIsEditing] = useState(false);
    const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
    const [saving, setSaving] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState(EMPLOYEE_NOTE_TEMPLATES[0]?.id ?? '');
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const draftStorageKey = useMemo(() => `${NOTE_DRAFT_STORAGE_PREFIX}:${ticketId}`, [ticketId]);
    const selectedTemplate = useMemo(
        () => EMPLOYEE_NOTE_TEMPLATES.find((template) => template.id === selectedTemplateId) ?? EMPLOYEE_NOTE_TEMPLATES[0],
        [selectedTemplateId]
    );
    const hasUnsavedChanges = draft !== notes;
    const noteStats = useMemo(() => {
        const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
        const lines = draft ? draft.split(/\r?\n/).length : 0;
        return {
            words,
            lines,
            characters: draft.length
        };
    }, [draft]);

    // Sync only when initialNotes actually changes (e.g. page re-fetch)
    useEffect(() => {
        setNotes(initialNotes);
        if (!isEditing) {
            setDraft(initialNotes);
        }
    }, [initialNotes, isEditing]);

    useEffect(() => {
        if (typeof window === 'undefined' || !isEditing) return;
        window.localStorage.setItem(draftStorageKey, draft);
    }, [draft, isEditing, draftStorageKey]);

    const handleSave = async () => {
        if (!hasUnsavedChanges) {
            setIsEditing(false);
            setActiveTab('write');
            return;
        }

        setSaving(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/tickets/${ticketId}/notes`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: draft })
            });
            if (!res.ok) throw new Error('Failed to save');
            setNotes(draft);
            setIsEditing(false);
            setActiveTab('write');

            // Update the store's ticket so the cache is fresh
            const store = useTicketDetailStore.getState();
            if (store.ticket) {
                useTicketDetailStore.setState({ ticket: { ...store.ticket, notes: draft } });
            }

            if (typeof window !== 'undefined') {
                window.localStorage.removeItem(draftStorageKey);
            }
            setLastSavedAt(new Date());
            notifySuccess('Notes saved');
        } catch {
            notifyError('Failed to save notes');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setDraft(notes);
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(draftStorageKey);
        }
        setIsEditing(false);
        setActiveTab('write');
    };

    const startEditing = () => {
        let nextDraft = notes;
        if (typeof window !== 'undefined') {
            const cachedDraft = window.localStorage.getItem(draftStorageKey);
            if (cachedDraft !== null && cachedDraft !== notes) {
                nextDraft = cachedDraft;
                notifyInfo('Recovered unsaved local note draft for this ticket.');
            }
        }
        setDraft(nextDraft);
        setIsEditing(true);
        setActiveTab('write');
    };

    const insertMarkdown = (before: string, after = '', fallback = 'text') => {
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = draft.slice(start, end);
        const replacement = `${before}${selected || fallback}${after}`;
        const next = draft.slice(0, start) + replacement + draft.slice(end);
        setDraft(next);
        setTimeout(() => {
            ta.focus();
            ta.selectionStart = start + before.length;
            ta.selectionEnd = start + before.length + (selected || fallback).length;
        }, 0);
    };

    const insertSnippet = (snippet: string) => {
        const ta = textareaRef.current;
        const resolvedSnippet = hydrateTemplateTokens(snippet);

        if (!ta) {
            setDraft((prev) => `${prev}${prev.endsWith('\n') || !prev ? '' : '\n'}${resolvedSnippet}`);
            return;
        }

        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const next = draft.slice(0, start) + resolvedSnippet + draft.slice(end);
        setDraft(next);
        setTimeout(() => {
            ta.focus();
            const cursor = start + resolvedSnippet.length;
            ta.selectionStart = cursor;
            ta.selectionEnd = cursor;
        }, 0);
    };

    const applyTemplate = (mode: 'replace' | 'append') => {
        if (!selectedTemplate) return;
        const content = hydrateTemplateTokens(selectedTemplate.markdown).trim();
        if (!content) return;

        setDraft((prev) => {
            if (mode === 'replace' || !prev.trim()) return `${content}\n`;
            return `${prev.replace(/\s*$/, '')}\n\n${content}\n`;
        });
        setActiveTab('write');
        setTimeout(() => {
            textareaRef.current?.focus();
        }, 0);
    };

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-white via-white to-slate-50 shadow-sm dark:border-slate-700 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
            {/* Header */}
            <div className="border-b border-slate-200/80 px-6 py-4 dark:border-slate-700/80">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                        <span className="rounded-lg bg-violet-100 p-2 dark:bg-violet-500/20">
                            <FileText className="h-4 w-4 text-violet-700 dark:text-violet-300" />
                        </span>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Employee Notes</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-300">Predefined markdown templates for team notes and handoffs.</p>
                        </div>
                    </div>
                    {!isEditing ? (
                        <button
                            type="button"
                            onClick={startEditing}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving || !hasUnsavedChanges}
                                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer dark:bg-violet-500 dark:hover:bg-violet-400"
                            >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        {noteStats.words} words
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        {noteStats.characters} chars
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        {noteStats.lines} lines
                    </span>
                    {isEditing && hasUnsavedChanges && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
                            Unsaved changes
                        </span>
                    )}
                    {lastSavedAt && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200">
                            <Clock className="h-3 w-3" />
                            Saved {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                </div>
            </div>

            {isEditing ? (
                <>
                    {/* Tabs */}
                    <div className="flex items-center gap-0 border-b border-slate-200 bg-slate-50/70 px-4 dark:border-slate-700 dark:bg-slate-900/70">
                        <button
                            type="button"
                            onClick={() => setActiveTab('write')}
                            className={`relative px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === 'write'
                                ? 'text-slate-900 dark:text-slate-100'
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100'
                                }`}
                        >
                            <Edit3 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                            Write
                            {activeTab === 'write' && (
                                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-violet-600" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('preview')}
                            className={`relative px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === 'preview'
                                ? 'text-slate-900 dark:text-slate-100'
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100'
                                }`}
                        >
                            <Eye className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                            Preview
                            {activeTab === 'preview' && (
                                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-violet-600" />
                            )}
                        </button>
                    </div>

                    {/* Toolbar + template controls (Write mode only) */}
                    {activeTab === 'write' && (
                        <div className="space-y-3 border-b border-slate-200 bg-slate-50/50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70">
                            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                                <FilterDropdown
                                    variant="bare"
                                    className="w-full"
                                    value={selectedTemplate?.id ?? ''}
                                    onChange={setSelectedTemplateId}
                                    options={EMPLOYEE_NOTE_TEMPLATES.map((template) => ({
                                        value: template.id,
                                        label: template.name,
                                    }))}
                                />
                                <button
                                    type="button"
                                    onClick={() => applyTemplate('replace')}
                                    className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
                                >
                                    Use Template
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applyTemplate('append')}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                    Append
                                </button>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-300">{selectedTemplate?.description}</p>

                            <div className="flex flex-wrap items-center gap-1">
                                {[
                                    { label: 'Bold', icon: 'B', before: '**', after: '**', style: 'font-bold', fallback: 'bold text' },
                                    { label: 'Italic', icon: 'I', before: '_', after: '_', style: 'italic', fallback: 'italic text' },
                                    { label: 'Code', icon: '<>', before: '`', after: '`', style: 'font-mono text-xs', fallback: 'code' },
                                    { label: 'Link', icon: '[]', before: '[', after: '](https://)', style: 'font-mono text-xs', fallback: 'link text' },
                                    { label: 'Heading', icon: 'H', before: '### ', after: '', style: 'font-bold', fallback: 'heading' },
                                    { label: 'Bullet', icon: '•', before: '- ', after: '', style: '', fallback: 'item' },
                                    { label: 'Checklist', icon: '☐', before: '- [ ] ', after: '', style: '', fallback: 'task' },
                                ].map((btn) => (
                                    <button
                                        key={btn.label}
                                        type="button"
                                        title={btn.label}
                                        onClick={() => insertMarkdown(btn.before, btn.after, btn.fallback)}
                                        className={`h-7 min-w-[30px] rounded-md border border-transparent px-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${btn.style}`}
                                    >
                                        {btn.icon}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => insertSnippet(`\n---\n`)}
                                    className="h-7 rounded-md border border-transparent px-2 text-xs text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                                    title="Insert divider"
                                >
                                    Divider
                                </button>
                                <button
                                    type="button"
                                    onClick={() => insertSnippet(`> Updated: {{DATE}} {{TIME}}\n`)}
                                    className="h-7 rounded-md border border-transparent px-2 text-xs text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                                    title="Insert timestamp"
                                >
                                    Time
                                </button>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            await navigator.clipboard.writeText(draft);
                                            notifySuccess('Markdown copied');
                                        } catch {
                                            notifyError('Failed to copy markdown');
                                        }
                                    }}
                                    className="inline-flex h-7 items-center gap-1 rounded-md border border-transparent px-2 text-xs text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                                    title="Copy markdown"
                                >
                                    <Copy className="h-3 w-3" />
                                    Copy
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {NOTE_QUICK_SNIPPETS.map((snippet) => (
                                    <button
                                        key={snippet.label}
                                        type="button"
                                        onClick={() => insertSnippet(snippet.value)}
                                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                                    >
                                        {snippet.label}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setDraft(notes)}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                                >
                                    <RefreshCcw className="h-3 w-3" />
                                    Reset
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Write / Preview body */}
                    <div className="p-4">
                        {activeTab === 'write' ? (
                            <textarea
                                ref={textareaRef}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder="Write your employee notes here... Markdown is supported."
                                className="w-full min-h-[240px] resize-y rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-100 focus:outline-none font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-violet-400 dark:focus:ring-violet-500/20"
                            />
                        ) : (
                            <div className="min-h-[240px] rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
                                {draft.trim() ? (
                                    <div className="prose prose-sm max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-violet-700 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-violet-700 prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:bg-slate-900 prose-pre:text-slate-100 dark:prose-invert dark:prose-headings:text-slate-100 dark:prose-p:text-slate-200 dark:prose-a:text-violet-300 dark:prose-code:bg-slate-800 dark:prose-code:text-violet-200 dark:prose-pre:bg-slate-900 dark:prose-pre:text-slate-100">
                                        <ReactMarkdown>{draft}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <p className="text-sm italic text-slate-400 dark:text-slate-500">Nothing to preview</p>
                                )}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                /* View mode */
                <div className="p-6">
                    {notes?.trim() ? (
                        <div className="prose prose-sm max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-violet-700 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-violet-700 prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:bg-slate-900 prose-pre:text-slate-100 dark:prose-invert dark:prose-headings:text-slate-100 dark:prose-p:text-slate-200 dark:prose-a:text-violet-300 dark:prose-code:bg-slate-800 dark:prose-code:text-violet-200 dark:prose-pre:bg-slate-900 dark:prose-pre:text-slate-100">
                            <ReactMarkdown>{notes}</ReactMarkdown>
                        </div>
                    ) : (
                        <p className="text-sm italic text-slate-400 dark:text-slate-500">No notes yet. Click Edit to add notes.</p>
                    )}
                </div>
            )}
        </div>
    );
}

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const searchParams = useSearchParams();
    const isPresalesUrl = searchParams.get('from') === 'presales';
    const { profile } = useAuth();
    const isSuperAdmin = profile?.role === 'superadmin';
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Zustand store
    const {
        ticket,
        analysis,
        previousAnalysis,
        comparison,
        actionItemsDb,
        excuses,
        audioUrl,
        loading,
        reanalyzeStatus,
        isReanalyzeModalOpen,
        isPlaying,
        currentTime,
        duration,

        fetchTicket,
        fetchAudioUrl,
        reanalyze,
        setReanalyzeModalOpen,
        setIsPlaying,
        setCurrentTime,
        setDuration
    } = useTicketDetailStore();

    // Derive from ticket data so presales sections render regardless of navigation path
    const isPresales = isPresalesUrl || ticket?.source === 'telecmi' || ticket?.visittype === 'telecmi_call';
    const backHref = isPresales ? '/admin/tickets?view=presales' : '/admin/tickets';
    const backLabel = 'Tickets';

    // Refs for auto-scrolling key moments
    const initialAudioPreferences = useMemo<AudioPreferences>(() => getStoredAudioPreferences(), []);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const momentsContainerRef = useRef<HTMLDivElement>(null);
    const momentRefs = useRef<(HTMLDivElement | null)[]>([]);
    const lastVolumeRef = useRef(initialAudioPreferences.lastVolume);
    const seekPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reportMenuRef = useRef<HTMLDivElement | null>(null);
    const reportContainerRef = useRef<HTMLElement | null>(null);
    const waveformShellRef = useRef<HTMLDivElement>(null);
    const [isHeroVisible, setIsHeroVisible] = useState(true);
    const previousReanalyzeStatusRef = useRef(reanalyzeStatus);
    const [audioError, setAudioError] = useState<string | null>(null);
    const [bufferedPercent, setBufferedPercent] = useState(0);
    const [, setIsScrubbing] = useState(false);
    const [scrubTime, setScrubTime] = useState<number | null>(null);
    const [volume, setVolume] = useState(initialAudioPreferences.volume);
    const [isMuted, setIsMuted] = useState(initialAudioPreferences.isMuted);
    const [playbackSpeed, setPlaybackSpeed] = useState(initialAudioPreferences.speed);
    const [isReportMenuOpen, setIsReportMenuOpen] = useState(false);
    const [reportActionLoading, setReportActionLoading] = useState<'download' | 'copy' | 'share' | null>(null);
    const [isDeletingTicket, setIsDeletingTicket] = useState(false);

    const WAVEFORM_BAR_COUNT = 110;
    const waveformHeights = useMemo(() => {
        // Seeded from ticket id for consistent shape per ticket
        const seed = (id ?? 'x').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);

        return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, i) => {
            const t = i / (WAVEFORM_BAR_COUNT - 1); // 0 -> 1

            // Speech-like amplitude envelope: quiet at edges, loud in middle third
            const envelope =
                Math.pow(Math.sin(t * Math.PI), 0.55) * 0.6 +
                Math.pow(Math.sin(t * Math.PI * 2.1 + 0.4), 2) * 0.22 +
                0.18;

            // Two layered noise frequencies for natural texture
            const noise1 = (Math.sin(i * 1.7 + seed * 0.031) * 0.5 + 0.5);
            const noise2 = (Math.sin(i * 3.9 + seed * 0.017 + 1.2) * 0.5 + 0.5);
            const noise3 = (Math.sin(i * 0.8 + seed * 0.051 + 2.5) * 0.5 + 0.5);

            const combined = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
            const height = clamp(combined * envelope, 0.04, 1);

            return height;
        });
    }, [id]);

    // Flag state
    const [flagModalStep, setFlagModalStep] = useState<'closed' | 'confirm' | 'share'>('closed');
    const [flagReason, setFlagReason] = useState('');
    const [flagRecipientName, setFlagRecipientName] = useState('');
    const [flagRecipientEmail, setFlagRecipientEmail] = useState('');
    const [flagLoading, setFlagLoading] = useState(false);
    const [flagShareUrl, setFlagShareUrl] = useState('');
    const [flagShareExpiry, setFlagShareExpiry] = useState('');
    const [flagDetails, setFlagDetails] = useState<{
        is_flagged: boolean;
        flag: {
            id: string;
            reason: string;
            recipient_name: string | null;
            recipient_email: string | null;
            share_url: string | null;
            created_at: string;
            flagged_by_name: string | null;
            flagged_by_email: string | null;
        } | null;
    } | null>(null);
    const [unflagging, setUnflagging] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);

    // Parse timestamps from multiple formats (MM:SS, HH:MM:SS, seconds, or milliseconds)
    const parseTime = (value?: string | number | null): number => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value > 10000 ? value / 1000 : value;
        }

        if (typeof value !== 'string') return 0;
        const raw = value.trim();
        if (!raw) return 0;

        if (/^\d+(\.\d+)?$/.test(raw)) {
            const numeric = Number(raw);
            return Number.isFinite(numeric) ? (numeric > 10000 ? numeric / 1000 : numeric) : 0;
        }

        const parts = raw.split(':').map((part) => Number(part.trim()));
        if (parts.some((part) => !Number.isFinite(part))) return 0;

        if (parts.length === 3) {
            const [hours, minutes, seconds] = parts;
            return hours * 3600 + minutes * 60 + seconds;
        }
        if (parts.length === 2) {
            const [minutes, seconds] = parts;
            return minutes * 60 + seconds;
        }
        return parts[0] ?? 0;
    };

    const sortedMoments = analysis?.keymoments
        ? [...analysis.keymoments].sort((a, b) => {
            // Prefer start_time_ms (exact ms), fall back to string time parsing
            const aMs = typeof a.start_time_ms === 'number' ? a.start_time_ms : parseTime(a.time || a.timestamp || '00:00') * 1000;
            const bMs = typeof b.start_time_ms === 'number' ? b.start_time_ms : parseTime(b.time || b.timestamp || '00:00') * 1000;
            return aMs - bMs;
        })
        : [];

    // Find the current active moment (the one that started most recently)
    const activeMomentIndex = sortedMoments.findIndex((m, i) => {
        const startTime = parseTime(m.time || m.timestamp || '00:00');
        const nextTime = i < sortedMoments.length - 1
            ? parseTime(sortedMoments[i + 1].time || sortedMoments[i + 1].timestamp || '00:00')
            : Infinity;
        return currentTime >= startTime && currentTime < nextTime;
    });

    // Auto-scroll to active moment
    useEffect(() => {
        if (activeMomentIndex !== -1 && momentRefs.current[activeMomentIndex]) {
            momentRefs.current[activeMomentIndex]?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }
    }, [activeMomentIndex]);


    useEffect(() => {
        let active = true;

        const loadTicket = async () => {
            await fetchTicket(id);
            if (!active) return;
            await fetchAudioUrl(id, true);
        };

        void loadTicket();
        return () => { active = false; };
    }, [id, fetchTicket, fetchAudioUrl]);

    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return;
        let cleanup: (() => void) | null = null;
        let raf = 0;
        const attach = () => {
            const target = waveformShellRef.current?.closest<HTMLElement>('.ci-audio-hero') || waveformShellRef.current;
            if (!target) {
                raf = window.requestAnimationFrame(attach);
                return;
            }
            const observer = new IntersectionObserver(
                ([entry]) => {
                    setIsHeroVisible(entry.isIntersecting && entry.intersectionRatio > 0.1);
                },
                { threshold: [0, 0.1, 0.5, 1] }
            );
            observer.observe(target);
            cleanup = () => observer.disconnect();
        };
        attach();
        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            if (cleanup) cleanup();
        };
    }, [ticket?.id, audioUrl]);

    // Fetch flag status on page load
    useEffect(() => {
        let active = true;
        const fetchFlagStatus = async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const res = await fetch(`${API_URL}/tickets/${id}/flag`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok && active) {
                    const data = await res.json();
                    setFlagDetails(data);
                }
            } catch (err) {
                console.error('Failed to fetch flag status:', err);
            }
        };
        void fetchFlagStatus();
        return () => { active = false; };
    }, [id]);

    const handleFlagTicket = useCallback(async () => {
        if (!flagReason.trim()) {
            notifyError('Please provide a reason for flagging this ticket.');
            return;
        }
        setFlagLoading(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication required');
            const res = await fetch(`${API_URL}/tickets/${id}/flag`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    reason: flagReason.trim(),
                    recipient_name: flagRecipientName.trim() || undefined,
                    recipient_email: flagRecipientEmail.trim() || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to flag ticket');

            setFlagShareUrl(data.share_url);
            setFlagShareExpiry(data.expires_at);
            setFlagDetails({
                is_flagged: true,
                flag: {
                    id: data.flag_id,
                    reason: flagReason.trim(),
                    recipient_name: flagRecipientName.trim() || null,
                    recipient_email: flagRecipientEmail.trim() || null,
                    share_url: data.share_url,
                    created_at: data.created_at,
                    flagged_by_name: null,
                    flagged_by_email: null,
                },
            });
            setFlagModalStep('share');
            notifySuccess('Ticket flagged successfully!');
        } catch (err) {
            notifyError(err instanceof Error ? err.message : 'Failed to flag ticket');
        } finally {
            setFlagLoading(false);
        }
    }, [id, flagReason, flagRecipientName, flagRecipientEmail]);

    const handleUnflagTicket = useCallback(async () => {
        setUnflagging(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication required');
            const res = await fetch(`${API_URL}/tickets/${id}/flag`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to unflag');
            }
            setFlagDetails({ is_flagged: false, flag: null });
            notifySuccess('Ticket unflagged.');
        } catch (err) {
            notifyError(err instanceof Error ? err.message : 'Failed to unflag');
        } finally {
            setUnflagging(false);
        }
    }, [id]);

    const handleCopyShareLink = useCallback(async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            setLinkCopied(true);
            notifySuccess('Share link copied!');
            setTimeout(() => setLinkCopied(false), 2500);
        } catch {
            notifyError('Failed to copy link');
        }
    }, []);

    const handleNativeShare = useCallback(async (url: string, reason: string) => {
        const shareText = `🚩 Flagged Ticket Report\n\nReason: ${reason}\n\nView Report: ${url}`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Flagged Ticket #${id.slice(0, 4).toUpperCase()}`,
                    text: shareText,
                    url,
                });
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') return;
                notifyError('Share failed');
            }
        } else {
            await handleCopyShareLink(url);
        }
    }, [id, handleCopyShareLink]);

    const closeFlagModal = useCallback(() => {
        setFlagModalStep('closed');
        setFlagReason('');
        setFlagRecipientName('');
        setFlagRecipientEmail('');
        setFlagShareUrl('');
        setLinkCopied(false);
        setLinkCopied(false);
    }, []);

    const handleAvatarClick = useCallback(() => {
        if (isSuperAdmin && fileInputRef.current) {
            fileInputRef.current.click();
        }
    }, [isSuperAdmin]);

    const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !ticket?.createdby) return;

        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/users/${ticket.createdby}/avatar`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            });

            if (!res.ok) throw new Error('Failed to upload avatar');

            notifySuccess('Avatar uploaded successfully');
            // Refresh ticket to show new avatar
            fetchTicket(id);
        } catch (err) {
            notifyError('Failed to upload avatar');
            console.error(err);
        }
    }, [ticket?.createdby, id, fetchTicket]);

    const formatTime = (time: number) => {
        if (!Number.isFinite(time) || time < 0) return '00:00';
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const formatSpeed = (speed: number) => `${Number.isInteger(speed) ? speed.toFixed(0) : speed}\u00D7`;

    const ensureSignedAudioUrl = useCallback(async (forceRefresh = false) => {
        const resolvedUrl = await fetchAudioUrl(id, forceRefresh || !audioUrl);
        if (!resolvedUrl) {
            setAudioError('Backend could not generate a signed audio URL for this ticket.');
            return null;
        }
        setAudioError(null);
        return resolvedUrl;
    }, [fetchAudioUrl, id, audioUrl]);

    const getSeekLimit = useCallback((audio: HTMLAudioElement | null) => {
        if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
            return audio.duration;
        }
        return Math.max(duration, 0);
    }, [duration]);

    const setPlaybackPosition = useCallback((nextTime: number) => {
        const audio = audioRef.current;
        const max = getSeekLimit(audio);
        const bounded = clamp(nextTime, 0, max > 0 ? max : Math.max(nextTime, 0));
        if (audio) {
            audio.currentTime = bounded;
        }
        setCurrentTime(bounded);
        return bounded;
    }, [getSeekLimit, setCurrentTime]);

    const updateBufferedProgress = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || audio.buffered.length === 0) {
            setBufferedPercent(0);
            return;
        }

        try {
            const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
            const max = getSeekLimit(audio);
            if (max <= 0) {
                setBufferedPercent(0);
                return;
            }
            setBufferedPercent(clamp((bufferedEnd / max) * 100, 0, 100));
        } catch {
            setBufferedPercent(0);
        }
    }, [getSeekLimit]);

    const applyVolume = useCallback((nextVolume: number) => {
        const clampedVolume = clamp(nextVolume, 0, 1);
        setVolume(clampedVolume);
        if (clampedVolume <= 0) {
            setIsMuted(true);
            return;
        }
        lastVolumeRef.current = clampedVolume;
        setIsMuted(false);
    }, []);

    const changeVolumeBy = useCallback((delta: number) => {
        const baseVolume = isMuted ? Math.max(lastVolumeRef.current, 0.25) : volume;
        applyVolume(baseVolume + delta);
    }, [isMuted, volume, applyVolume]);

    const toggleMute = useCallback(() => {
        if (isMuted || volume <= 0) {
            const restoredVolume = clamp(lastVolumeRef.current || 1, 0.05, 1);
            setVolume(restoredVolume);
            setIsMuted(false);
            return;
        }

        if (volume > 0) {
            lastVolumeRef.current = volume;
        }
        setIsMuted(true);
    }, [isMuted, volume]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(AUDIO_VOLUME_STORAGE_KEY, volume.toString());
        if (volume > 0) {
            lastVolumeRef.current = volume;
            window.localStorage.setItem(AUDIO_LAST_VOLUME_STORAGE_KEY, volume.toString());
        }
    }, [volume]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(AUDIO_MUTE_STORAGE_KEY, isMuted ? '1' : '0');
    }, [isMuted]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(AUDIO_SPEED_STORAGE_KEY, playbackSpeed.toString());
    }, [playbackSpeed]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = clamp(volume, 0, 1);
        audio.muted = isMuted;
        audio.playbackRate = playbackSpeed;
    }, [volume, isMuted, playbackSpeed]);

    const togglePlayback = useCallback(async () => {
        const signedUrl = await ensureSignedAudioUrl(false);
        if (!signedUrl) return;

        const audio = audioRef.current;
        if (!audio) {
            setAudioError('Audio player is still initializing. Please try again.');
            return;
        }

        if (!audio.currentSrc || audio.currentSrc !== signedUrl) {
            audio.src = signedUrl;
            audio.load();
        }

        if (audio.paused) {
            try {
                await audio.play();
                setAudioError(null);
                setIsPlaying(true);
            } catch (err) {
                console.error('Audio play failed:', err);
                const refreshedUrl = await ensureSignedAudioUrl(true);
                if (refreshedUrl) {
                    try {
                        audio.src = refreshedUrl;
                        audio.load();
                        await audio.play();
                        setAudioError(null);
                        setIsPlaying(true);
                        return;
                    } catch (retryError) {
                        console.error('Audio retry failed:', retryError);
                    }
                }
                setAudioError('Unable to play this recording.');
                setIsPlaying(false);
            }
            return;
        }

        audio.pause();
        setIsPlaying(false);
    }, [ensureSignedAudioUrl, setIsPlaying]);

    const setSeekPreview = useCallback((nextTime: number, keepMs = 240) => {
        if (seekPreviewTimerRef.current) {
            clearTimeout(seekPreviewTimerRef.current);
        }
        setScrubTime(nextTime);
        seekPreviewTimerRef.current = setTimeout(() => {
            setScrubTime(null);
            seekPreviewTimerRef.current = null;
        }, keepMs);
    }, []);

    useEffect(() => {
        return () => {
            if (seekPreviewTimerRef.current) {
                clearTimeout(seekPreviewTimerRef.current);
            }
        };
    }, []);

    const restartPlayback = useCallback(async () => {
        const signedUrl = await ensureSignedAudioUrl(false);
        if (!signedUrl) return;

        const audio = audioRef.current;
        if (!audio) return;

        if (!audio.currentSrc || audio.currentSrc !== signedUrl) {
            audio.src = signedUrl;
            audio.load();
        }

        const resetPoint = setPlaybackPosition(0);
        setIsScrubbing(false);
        setSeekPreview(resetPoint);
    }, [ensureSignedAudioUrl, setPlaybackPosition, setSeekPreview]);

    const seekBy = useCallback(async (deltaSeconds: number) => {
        const signedUrl = await ensureSignedAudioUrl(false);
        if (!signedUrl) return;

        const audio = audioRef.current;
        if (!audio) return;

        if (!audio.currentSrc || audio.currentSrc !== signedUrl) {
            audio.src = signedUrl;
            audio.load();
        }

        const max = Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : Math.max(duration, 0);
        const unclamped = audio.currentTime + deltaSeconds;
        const next = Math.max(0, max > 0 ? Math.min(unclamped, max) : unclamped);

        setPlaybackPosition(next);
        setIsScrubbing(false);
        setSeekPreview(next);
    }, [duration, ensureSignedAudioUrl, setPlaybackPosition, setSeekPreview]);

    const handleSeekInput = useCallback((nextTime: number) => {
        const bounded = setPlaybackPosition(nextTime);
        setIsScrubbing(true);
        setScrubTime(bounded);
    }, [setPlaybackPosition]);

    const commitScrub = useCallback(() => {
        setIsScrubbing(false);
        if (seekPreviewTimerRef.current) {
            clearTimeout(seekPreviewTimerRef.current);
        }
        seekPreviewTimerRef.current = setTimeout(() => {
            setScrubTime(null);
            seekPreviewTimerRef.current = null;
        }, 160);
    }, []);

    const cyclePlaybackSpeed = useCallback(() => {
        const currentIndex = AUDIO_SPEED_OPTIONS.findIndex((speed) => speed === playbackSpeed);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % AUDIO_SPEED_OPTIONS.length : 0;
        setPlaybackSpeed(AUDIO_SPEED_OPTIONS[nextIndex]);
    }, [playbackSpeed]);

    const seekToMoment = async (momentTime: string | number | null | undefined) => {
        const seconds = Math.max(0, parseTime(momentTime));
        const signedUrl = await ensureSignedAudioUrl(false);
        if (!signedUrl) return;

        const audio = audioRef.current;

        const target = setPlaybackPosition(seconds);
        setIsScrubbing(false);
        setSeekPreview(target);

        if (!audio) return;

        if (!audio.currentSrc || audio.currentSrc !== signedUrl) {
            audio.src = signedUrl;
            audio.load();
        }

        audio.currentTime = seconds;
        try {
            await audio.play();
            setAudioError(null);
            setIsPlaying(true);
        } catch (err) {
            console.error('Moment playback failed:', err);
            setAudioError('Unable to jump to selected key moment.');
            setIsPlaying(false);
        }
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
            if (isEditableShortcutTarget(event.target)) return;

            if (event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                void togglePlayback();
                return;
            }

            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                void seekBy(-5);
                return;
            }

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                void seekBy(event.shiftKey ? 10 : 5);
                return;
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                changeVolumeBy(0.05);
                return;
            }

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                changeVolumeBy(-0.05);
                return;
            }

            if (event.key.toLowerCase() === 'm') {
                event.preventDefault();
                toggleMute();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [togglePlayback, seekBy, changeVolumeBy, toggleMute]);

    const getCurrentTicketUrl = useCallback(() => {
        if (typeof window === 'undefined') return '';
        return window.location.href;
    }, []);

    const copyUrlToClipboard = useCallback(async (value: string) => {
        if (!navigator.clipboard) {
            throw new Error('Clipboard is not available on this browser');
        }
        await navigator.clipboard.writeText(value);
    }, []);

    const handleDownloadReport = useCallback(async () => {
        setReportActionLoading('download');
        try {
            setIsReportMenuOpen(false);
            const token = await getToken();
            if (!token) {
                throw new Error('Authentication required');
            }

            const response = await fetch(`${API_URL}/tickets/${id}/report?download=1`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(
                    typeof payload?.error === 'string'
                        ? payload.error
                        : 'Could not generate PDF'
                );
            }

            const blob = await response.blob();
            if (blob.size === 0) {
                throw new Error('Generated PDF is empty');
            }

            const disposition = response.headers.get('content-disposition') || '';
            const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
            const downloadName = filenameMatch?.[1] || `ticket-report-${id.slice(0, 8)}.pdf`;

            const blobUrl = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = blobUrl;
            anchor.download = downloadName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.URL.revokeObjectURL(blobUrl);
            notifySuccess('PDF downloaded successfully.');
        } catch (error) {
            notifyError(error instanceof Error ? error.message : 'Could not generate PDF');
        } finally {
            setReportActionLoading(null);
        }
    }, [id]);

    const handleDeleteTicket = useCallback(async () => {
        if (isDeletingTicket) return;
        const confirmed = window.confirm('Delete this ticket permanently? This removes DB records and GCP audio files.');
        if (!confirmed) return;

        setIsDeletingTicket(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication required');

            const requestDelete = async (endpoint: string, method: 'DELETE' | 'POST') => {
                return fetch(endpoint, {
                    method,
                    headers: {
                        Authorization: `Bearer ${token}`,
                        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
                    },
                    ...(method === 'POST' ? { body: '{}' } : {})
                });
            };

            let response = await requestDelete(`${API_URL}/tickets/${id}`, 'DELETE');
            let payload = await response.json().catch(() => ({}));
            let backendError = typeof payload?.error === 'string' ? payload.error : '';

            if (!response.ok && response.status === 404 && backendError === 'Not found') {
                response = await requestDelete(`${API_URL}/tickets/${id}/delete`, 'POST');
                payload = await response.json().catch(() => ({}));
                backendError = typeof payload?.error === 'string' ? payload.error : '';
            }

            if (!response.ok) {
                if (response.status === 404 && backendError === 'Ticket not found') {
                    notifyInfo('Ticket was already deleted.');
                    router.replace('/admin/tickets');
                    return;
                }

                if (response.status === 404 && backendError === 'Not found') {
                    throw new Error('Delete endpoint is unavailable on this backend deployment. Please deploy the latest backend revision.');
                }

                throw new Error(backendError || 'Failed to delete ticket');
            }

            notifySuccess('Ticket deleted successfully.');
            router.replace('/admin/tickets');
        } catch (error) {
            notifyError(error instanceof Error ? error.message : 'Failed to delete ticket');
        } finally {
            setIsReportMenuOpen(false);
            setIsDeletingTicket(false);
        }
    }, [id, router, isDeletingTicket]);

    const handleCopyReportLink = useCallback(async () => {
        setReportActionLoading('copy');
        try {
            const currentUrl = getCurrentTicketUrl();
            await copyUrlToClipboard(currentUrl);
            notifySuccess('Ticket link copied to clipboard.');
            setIsReportMenuOpen(false);
        } catch (error) {
            notifyError(error instanceof Error ? error.message : 'Could not copy report link');
        } finally {
            setReportActionLoading(null);
        }
    }, [copyUrlToClipboard, getCurrentTicketUrl]);

    const handleShareReport = useCallback(async () => {
        setReportActionLoading('share');
        try {
            const currentUrl = getCurrentTicketUrl();

            try {
                await copyUrlToClipboard(currentUrl);
            } catch {
                // Ignore clipboard errors and continue with native share fallback.
            }

            if (navigator.share) {
                await navigator.share({
                    title: `Ticket #${id.slice(0, 4).toUpperCase()}`,
                    text: 'TicketIntel ticket link',
                    url: currentUrl
                });
                notifySuccess('Ticket link shared. Link is also copied to clipboard.');
            } else {
                notifyInfo('Share is not supported here. Ticket link copied to clipboard.');
            }

            setIsReportMenuOpen(false);
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                setReportActionLoading(null);
                return;
            }
            notifyError(error instanceof Error ? error.message : 'Could not share report');
        } finally {
            setReportActionLoading(null);
        }
    }, [copyUrlToClipboard, getCurrentTicketUrl, id]);

    useEffect(() => {
        if (!isReportMenuOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!reportMenuRef.current) return;
            if (!reportMenuRef.current.contains(event.target as Node)) {
                setIsReportMenuOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsReportMenuOpen(false);
            }
        };

        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isReportMenuOpen]);

    useEffect(() => {
        const previousStatus = previousReanalyzeStatusRef.current;
        if (reanalyzeStatus === previousStatus) return;

        previousReanalyzeStatusRef.current = reanalyzeStatus;

        if (reanalyzeStatus === 'analyzing') {
            notifyInfo('Re-analysis started for this ticket.');
        } else if (reanalyzeStatus === 'analyzed') {
            notifySuccess('Re-analysis completed successfully.');
        } else if (reanalyzeStatus === 'failed') {
            notifyError('Re-analysis failed. Please try again.');
        }
    }, [reanalyzeStatus]);

    const displayedCurrentTime = scrubTime !== null ? scrubTime : currentTime;
    const progressPercent = duration > 0 ? (displayedCurrentTime / duration) * 100 : 0;
    const effectiveVolume = isMuted ? 0 : volume;
    const volumePercent = clamp(effectiveVolume * 100, 0, 100);
    const VolumeIcon = effectiveVolume <= 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

    const getSentimentColor = (sentiment: string) => {
        switch (sentiment) {
            case 'positive': return 'bg-green-100 text-green-700 border-green-200';
            case 'negative': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const getExcuseStatusClass = (status: string) => {
        if (status === 'pending') return 'bg-amber-100 text-amber-700 border-amber-200';
        if (status === 'accepted') return 'bg-green-100 text-green-700 border-green-200';
        if (status === 'rejected') return 'bg-red-100 text-red-700 border-red-200';
        return 'bg-gray-100 text-gray-700 border-gray-200';
    };

    const formatExcuseReason = (reason: string) => {
        const labels: Record<string, string> = {
            client_unavailable: 'Client unavailable',
            technical_issues: 'Technical issues',
            travel_delay: 'Travel delay',
            meeting_rescheduled: 'Meeting rescheduled',
            emergency: 'Emergency',
            other: 'Other'
        };
        return labels[reason] || reason.replaceAll('_', ' ');
    };

    const renderStars = (rating: number) => {
        const score = Math.round(rating / 2);
        return (
            <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                        key={star}
                        className={`w-5 h-5 ${star <= score ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
                    />
                ))}
            </div>
        );
    };

    const aiActionItems = useMemo(() => {
        if (!analysis) return [] as string[];

        const candidateRaw =
            (analysis as unknown as Record<string, unknown>).actionitems ??
            (analysis as unknown as Record<string, unknown>).action_items ??
            (analysis as unknown as Record<string, unknown>).actionItems ??
            [];

        let list: unknown[] = [];

        if (Array.isArray(candidateRaw)) {
            list = candidateRaw;
        } else if (typeof candidateRaw === 'string') {
            try {
                const parsed = JSON.parse(candidateRaw);
                if (Array.isArray(parsed)) list = parsed;
            } catch {
                list = [candidateRaw];
            }
        }

        const normalized = list
            .map((item) => {
                if (typeof item === 'string') return item.trim();
                if (item && typeof item === 'object') {
                    const row = item as Record<string, unknown>;
                    const primary =
                        (typeof row.item === 'string' && row.item) ||
                        (typeof row.action === 'string' && row.action) ||
                        (typeof row.title === 'string' && row.title) ||
                        null;

                    const desc = typeof row.description === 'string' ? row.description : null;
                    if (primary && desc) return `${primary} - ${desc}`;
                    if (primary) return primary;
                }
                return null;
            })
            .filter((item): item is string => Boolean(item && item.length));

        return [...new Set(normalized)];
    }, [analysis]);

    const trackedActionItems = useMemo(() => actionItemsDb.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        completed: item.completed,
        due_date: item.due_date
    })), [actionItemsDb]);

    const hasAnyActionItems = aiActionItems.length > 0 || trackedActionItems.length > 0;

    const comparisonChartData = useMemo(
        () =>
            comparison?.labels?.map((label, i) => ({
                label,
                Current: comparison.current[i] ?? 0,
                Previous: comparison.previous[i] ?? 0
            })) ?? [],
        [comparison]
    );

    const formatScoreLabel = (key: string) =>
        key
            .replaceAll('_', ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());

    const comparisonInsights = useMemo<ComparisonInsights | null>(() => {
        if (!analysis?.comparisonwithprevious) return null;

        const raw = analysis.comparisonwithprevious as unknown as Record<string, unknown>;

        const toArray = (value: unknown): string[] =>
            Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

        const scoreChangesRaw = raw.score_changes as Record<string, unknown> | undefined;
        const scoreChanges: ParsedScoreChange[] = scoreChangesRaw
            ? Object.entries(scoreChangesRaw).flatMap(([key, value]) => {
                if (!value || typeof value !== 'object') return [];
                const row = value as Record<string, unknown>;
                const current = typeof row.current === 'number' ? row.current : 0;
                const previous = typeof row.previous === 'number' ? row.previous : 0;
                const change = typeof row.change === 'number' ? row.change : current - previous;
                return [{
                    key,
                    label: formatScoreLabel(key),
                    current,
                    previous,
                    change
                }];
            })
            : [];

        return {
            deltaScore: typeof raw.delta_score === 'number' ? raw.delta_score : null,
            overallNarrative: typeof raw.overall_narrative === 'string' ? raw.overall_narrative : null,
            keyDifferences: toArray(raw.key_differences),
            improvements: toArray(raw.improvements),
            regressions: toArray(raw.regressions),
            unchanged: toArray(raw.unchanged),
            scoreChanges
        };
    }, [analysis]);

    const metricCards = useMemo(() => {
        const politeness = analysis?.scores?.politeness ?? analysis?.politeness_score ?? 0;
        const confidence = analysis?.scores?.confidence ?? analysis?.confidence_score ?? 0;
        const speakers = analysis?.scores?.speakers ?? analysis?.speakers_detected ?? 2;
        const interestRaw = String(analysis?.scores?.interest ?? analysis?.customer_interest_level ?? 'N/A').toLowerCase();
        const interestScore = interestRaw === 'high' ? 90 : interestRaw === 'medium' ? 65 : interestRaw === 'low' ? 35 : 0;
        const ratingOutOf100 = Math.round(((analysis?.rating || 0) / 10) * 100);

        return { politeness, confidence, speakers, interestRaw, interestScore, ratingOutOf100 };
    }, [analysis]);


    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    if (!ticket) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <p className="text-gray-500">Ticket not found</p>
            </div>
        );
    }

    const agentName = ticket.creator_details?.fullname?.trim() || 'Unknown Agent';
    const agentInitials = agentName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'NA';

    return (
        <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
            <AdminShell activeSection="tickets">
                <main ref={reportContainerRef} className="ticket-print-main ticket-detail-page min-h-screen bg-slate-50 dark:bg-slate-950">
                    {/* Header */}
                    <header className="ticket-detail-header border-b border-slate-200/80 bg-white/90 px-5 py-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90 md:px-7">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
                                <Link
                                    href={backHref}
                                    className="rounded-full p-2 transition-colors hover:bg-gray-100"
                                >
                                    <ArrowLeft className="w-5 h-5 text-gray-500" />
                                </Link>
                                <nav className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 sm:text-sm">
                                    <Link href={backHref} className="hover:text-purple-600">{backLabel}</Link>
                                    <ChevronRight className="w-4 h-4" />
                                    <span className="max-w-[9rem] truncate sm:max-w-none">
                                        {isPresales ? (
                                            (() => {
                                                if (ticket.clientname && !/^\d+$/.test(ticket.clientname) && ticket.clientname !== ticket.client_id) return ticket.clientname;
                                                if (ticket.telecmi_lead_id) return `Lead #${ticket.telecmi_lead_id}`;
                                                return maskPhone(ticket.client_id);
                                            })()
                                        ) : (
                                            ticket.clientname || ticket.client_id
                                        )}
                                    </span>
                                    <ChevronRight className="hidden w-4 h-4 sm:block" />
                                    <span className="font-medium text-gray-900">#{ticket.id.slice(0, 4).toUpperCase()}</span>
                                </nav>
                            </div>

                            <div className="ticket-no-print flex w-full flex-wrap items-center gap-2 sm:gap-3 lg:w-auto lg:justify-end">
                                {/* Re-analyze Button */}
                                {reanalyzeStatus === 'idle' && (
                                    <button
                                        onClick={() => setReanalyzeModalOpen(true)}
                                        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-purple-600"
                                    >
                                        <RefreshCcw className="w-4 h-4" />
                                        <span>Re-analyze</span>
                                    </button>
                                )}
                                {reanalyzeStatus === 'analyzing' && (
                                    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                                        <RefreshCcw className="w-4 h-4 animate-spin" />
                                        <span>Analyzing...</span>
                                    </div>
                                )}
                                {reanalyzeStatus === 'analyzed' && (
                                    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                                        <CheckCircle className="w-4 h-4" />
                                        <span>Done! Updated.</span>
                                    </div>
                                )}
                                {reanalyzeStatus === 'failed' && (
                                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                        <XCircle className="w-4 h-4" />
                                        <span>Failed</span>
                                    </div>
                                )}

                                {/* Flag / Unflag Button */}
                                {flagDetails?.is_flagged ? (
                                    <button
                                        type="button"
                                        onClick={() => { void handleUnflagTicket(); }}
                                        disabled={unflagging}
                                        className="ticket-no-print flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {unflagging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4 fill-red-600" />}
                                        <span>{unflagging ? 'Unflagging...' : '🚩 Flagged'}</span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setFlagModalStep('confirm')}
                                        className="ticket-no-print flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100 cursor-pointer"
                                    >
                                        <Flag className="h-4 w-4" />
                                        <span>Flag</span>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => { void handleDeleteTicket(); }}
                                    disabled={isDeletingTicket}
                                    className="ticket-no-print flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isDeletingTicket ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    <span>{isDeletingTicket ? 'Deleting...' : 'Delete'}</span>
                                </button>

                                <NotificationBell />

                                <div ref={reportMenuRef} className="ticket-no-print relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsReportMenuOpen((prev) => !prev)}
                                        disabled={reportActionLoading !== null}
                                        className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                        {reportActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                        <span>Export Report</span>
                                    </button>

                                    {isReportMenuOpen && (
                                        <div className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                                            <button
                                                type="button"
                                                onClick={() => { void handleDownloadReport(); }}
                                                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                                            >
                                                Download As PDF
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { void handleCopyReportLink(); }}
                                                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                                            >
                                                Copy Ticket Link
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { void handleShareReport(); }}
                                                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                                            >
                                                Share Ticket Link
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Flag Details Banner */}
                    {flagDetails?.is_flagged && flagDetails.flag && (
                        <div className="mx-5 mt-5 md:mx-7 max-w-[90rem] mx-auto">
                            <div className="rounded-xl border-2 border-red-200 bg-gradient-to-r from-red-50 via-orange-50 to-red-50 p-4 shadow-sm">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
                                        <Flag className="h-4 w-4 text-red-600 fill-red-600" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-sm font-bold text-red-800">🚩 This ticket has been flagged</h3>
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-200 text-red-800 uppercase tracking-wide">Flagged</span>
                                        </div>
                                        <p className="text-sm text-red-700 font-medium mb-2">
                                            <span className="text-red-500 font-semibold">Reason:</span> {flagDetails.flag.reason}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-red-600">
                                            {flagDetails.flag.flagged_by_name && (
                                                <span>Flagged by <strong>{flagDetails.flag.flagged_by_name}</strong></span>
                                            )}
                                            {flagDetails.flag.created_at && (
                                                <span>{new Date(flagDetails.flag.created_at).toLocaleString()}</span>
                                            )}
                                            {flagDetails.flag.recipient_name && (
                                                <span>Shared with <strong>{flagDetails.flag.recipient_name}</strong></span>
                                            )}
                                        </div>
                                        {flagDetails.flag.share_url && (
                                            <div className="mt-3 flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => { void handleCopyShareLink(flagDetails.flag!.share_url!); }}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 cursor-pointer"
                                                >
                                                    <Copy className="h-3 w-3" />
                                                    Copy Report Link
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { void handleNativeShare(flagDetails.flag!.share_url!, flagDetails.flag!.reason); }}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 cursor-pointer"
                                                >
                                                    <Share2 className="h-3 w-3" />
                                                    Share
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <TicketStickyPlayer
                        visible={!isHeroVisible && Boolean(audioUrl)}
                        isPlaying={isPlaying}
                        progressPercent={progressPercent}
                        displayedCurrentTime={displayedCurrentTime}
                        duration={duration}
                        formatTime={formatTime}
                        togglePlayback={togglePlayback}
                        label={analysis?.call_outcome ? `Now reviewing · ${analysis.call_outcome.replaceAll('_', ' ')}` : 'Now reviewing'}
                    />

                    <div className="ticket-detail-body">
                        <TicketDetailWorkspace
                            ticket={ticket}
                            analysis={analysis}
                            isPresales={isPresales}
                            agentName={agentName}
                            agentInitials={agentInitials}
                            metricCards={metricCards}
                            sortedMoments={sortedMoments}
                            seekToMoment={seekToMoment}
                            getSentimentColor={getSentimentColor}
                            renderStars={renderStars}
                            isSuperAdmin={isSuperAdmin}
                            onAvatarClick={handleAvatarClick}
                            callDuration={duration}
                            audio={{
                                isPlaying,
                                togglePlayback,
                                restartPlayback,
                                seekBy,
                                formatTime,
                                displayedCurrentTime,
                                duration,
                                progressPercent,
                                bufferedPercent,
                                waveformHeights,
                                waveformBarCount: WAVEFORM_BAR_COUNT,
                                waveformShellRef,
                                handleSeekInput,
                                commitScrub,
                                setIsScrubbing,
                                toggleMute,
                                isMuted,
                                VolumeIcon,
                                volumePercent,
                                effectiveVolume,
                                applyVolume,
                                cyclePlaybackSpeed,
                                formatSpeed,
                                playbackSpeed,
                                audioError,
                                audioUrl,
                                audioRef,
                                updateBufferedProgress,
                                setCurrentTime,
                                setDuration,
                                setIsPlaying,
                                setScrubTime,
                                setAudioError,
                                playbackSpeedValue: playbackSpeed,
                                volume,
                                clamp,
                            }}
                        >
                                <div className="ci-panel">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                        <div className="flex items-center gap-3">
                                            <h3 className="ci-panel__title">Current Conversation</h3>
                                            {comparisonInsights?.deltaScore !== null && comparisonInsights?.deltaScore !== undefined && (
                                                <span className={`ci-trend-chip ci-trend-chip--${comparisonInsights.deltaScore > 0 ? 'up' : comparisonInsights.deltaScore < 0 ? 'down' : 'flat'}`}>
                                                    {comparisonInsights.deltaScore > 0 ? <TrendingUp className="h-3 w-3" /> : comparisonInsights.deltaScore < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                                    {comparisonInsights.deltaScore > 0 ? `+${comparisonInsights.deltaScore}` : comparisonInsights.deltaScore} vs previous
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {comparisonChartData.length > 0 ? (
                                        <div className="ticket-advanced-chart border border-gray-200/70 p-3 md:p-4">
                                            <ConversationComparisonChart data={comparisonChartData} height={236} />
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-500 italic">No comparable previous analysis available.</p>
                                    )}

                                    {comparisonInsights && (
                                        <div className="mt-5 space-y-3">
                                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                                                <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white p-4">
                                                    <p className="text-[11px] uppercase tracking-wider text-purple-700 mb-2">Overall Narrative</p>
                                                    <p className="text-sm text-gray-700 leading-relaxed">
                                                        {comparisonInsights.overallNarrative || 'No narrative generated for this comparison yet.'}
                                                    </p>
                                                    {comparisonInsights.keyDifferences.length > 0 && (
                                                        <ul className="mt-3 space-y-1.5">
                                                            {comparisonInsights.keyDifferences.map((item, idx) => (
                                                                <li key={`${item}-${idx}`} className="text-xs text-gray-600 leading-relaxed">- {item}</li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>

                                                <div className={`rounded-xl border p-4 ${comparisonInsights.deltaScore !== null && comparisonInsights.deltaScore >= 0 ? 'border-green-200 bg-green-50/60' : 'border-red-200 bg-red-50/60'}`}>
                                                    <p className="text-[11px] uppercase tracking-wider text-gray-600 mb-1">Delta Summary</p>
                                                    <div className="flex items-center justify-between">
                                                        <p className={`text-3xl font-semibold ${comparisonInsights.deltaScore !== null && comparisonInsights.deltaScore >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            {comparisonInsights.deltaScore ?? 0}
                                                        </p>
                                                        {comparisonInsights.deltaScore !== null && comparisonInsights.deltaScore > 0 ? <TrendingUp className="w-5 h-5 text-green-600" /> :
                                                            comparisonInsights.deltaScore !== null && comparisonInsights.deltaScore < 0 ? <TrendingDown className="w-5 h-5 text-red-600" /> :
                                                                <Minus className="w-5 h-5 text-gray-500" />}
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-2">Overall movement vs previous visit</p>
                                                    {previousAnalysis?.rating !== undefined && (
                                                        <p className="mt-3 text-sm text-gray-600">
                                                            Previous rating: <span className="font-semibold">{previousAnalysis.rating}</span>
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {comparisonInsights.scoreChanges.length > 0 && (
                                                <div className="rounded-xl border border-gray-200 bg-white p-4">
                                                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">Skill Score Changes</p>
                                                    <div className="space-y-2.5">
                                                        {comparisonInsights.scoreChanges.map((row) => (
                                                            <div key={row.key} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <p className="text-sm font-semibold text-gray-900">{row.label}</p>
                                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${row.change > 0 ? 'bg-green-100 text-green-700' : row.change < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                        {row.change > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : row.change < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                                                                        {row.change > 0 ? `+${row.change}` : row.change}
                                                                    </span>
                                                                </div>
                                                                <div className="mt-2 h-1.5 rounded-full bg-gray-200">
                                                                    <div className={`h-1.5 rounded-full ${row.change > 0 ? 'bg-green-500' : row.change < 0 ? 'bg-red-500' : 'bg-gray-400'}`} style={{ width: `${Math.min(100, Math.max(8, row.current))}%` }} />
                                                                </div>
                                                                <p className="mt-1.5 text-xs text-gray-500">{`Previous ${row.previous}/100 -> Current ${row.current}/100`}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div className="rounded-xl border border-green-200 bg-white p-3">
                                                    <p className="text-xs uppercase tracking-wide text-green-700 mb-2">Improvements</p>
                                                    <ul className="space-y-1.5">
                                                        {(comparisonInsights.improvements.length > 0 ? comparisonInsights.improvements : ['No explicit improvements listed.']).map((item, idx) => (
                                                            <li key={`${item}-${idx}`} className="text-xs text-gray-700 leading-relaxed">- {item}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                <div className="rounded-xl border border-red-200 bg-white p-3">
                                                    <p className="text-xs uppercase tracking-wide text-red-700 mb-2">Regressions</p>
                                                    <ul className="space-y-1.5">
                                                        {(comparisonInsights.regressions.length > 0 ? comparisonInsights.regressions : ['No regressions identified.']).map((item, idx) => (
                                                            <li key={`${item}-${idx}`} className="text-xs text-gray-700 leading-relaxed">- {item}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                <div className="rounded-xl border border-gray-200 bg-white p-3">
                                                    <p className="text-xs uppercase tracking-wide text-gray-600 mb-2">Unchanged</p>
                                                    <ul className="space-y-1.5">
                                                        {(comparisonInsights.unchanged.length > 0 ? comparisonInsights.unchanged : ['No unchanged items listed.']).map((item, idx) => (
                                                            <li key={`${item}-${idx}`} className="text-xs text-gray-700 leading-relaxed">- {item}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                        {/* Excuses Timeline */}
                        {excuses.length > 0 && (
                            <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-5">
                                    <div className="p-2 bg-amber-100 rounded-lg">
                                        <AlertCircle className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900">Excuse Timeline</h3>
                                </div>

                                <div className="space-y-4">
                                    {excuses.map((excuse) => (
                                        <div key={excuse.id} className="p-4 rounded-xl border border-gray-200 bg-gray-50">
                                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                                <div>
                                                    <p className="font-semibold text-gray-900">
                                                        {excuse.reason_details?.trim() || formatExcuseReason(excuse.reason)}
                                                    </p>
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        {formatExcuseReason(excuse.reason)} - {excuse.employee?.fullname || 'Unknown employee'}
                                                    </p>
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-full border text-xs font-semibold uppercase ${getExcuseStatusClass(excuse.status)}`}>
                                                    {excuse.status}
                                                </span>
                                            </div>

                                            <div className="mt-3 text-sm text-gray-600 grid md:grid-cols-2 gap-2">
                                                <p>Submitted: {new Date(excuse.submitted_at).toLocaleString()}</p>
                                                <p>Estimated Start: {excuse.estimated_start_time ? new Date(excuse.estimated_start_time).toLocaleString() : 'N/A'}</p>
                                            </div>

                                            {excuse.admin_notes && (
                                                <div className="mt-3 p-3 rounded-lg border border-gray-200 bg-white">
                                                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Admin Notes</p>
                                                    <p className="text-sm text-gray-700">{excuse.admin_notes}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {analysis?.improvementsuggestions && analysis.improvementsuggestions.length > 0 && (
                            <TicketCoachingCards suggestions={analysis.improvementsuggestions} />
                        )}

                        </TicketDetailWorkspace>

                        {/* ── Admin Notes (Markdown) ── */}
                        <section className="ticket-detail-notes" aria-label="Employee notes">
                            <TicketNotesSection ticketId={id} initialNotes={ticket?.notes || ''} />
                        </section>
                    </div>

                    {/* ── Flag Confirmation Modal ── */}
                    {flagModalStep === 'confirm' && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={closeFlagModal}>
                            <div
                                className="relative w-full max-w-md mx-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button type="button" onClick={closeFlagModal} className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer">
                                    <X className="h-5 w-5" />
                                </button>

                                <div className="flex items-center gap-3 mb-5">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-red-100 to-orange-100 shadow-sm">
                                        <Flag className="h-5 w-5 text-red-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900">Flag This Ticket</h2>
                                        <p className="text-sm text-gray-500">This action will be logged in the activity log</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                                            Reason <span className="text-red-500">*</span>
                                        </label>
                                        <textarea
                                            value={flagReason}
                                            onChange={(e) => setFlagReason(e.target.value)}
                                            placeholder="Why are you flagging this ticket?"
                                            rows={3}
                                            className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-red-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100 transition-all resize-none"
                                            autoFocus
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-gray-500 uppercase tracking-wide">Recipient Name</label>
                                            <input
                                                type="text"
                                                value={flagRecipientName}
                                                onChange={(e) => setFlagRecipientName(e.target.value)}
                                                placeholder="e.g. John (MD)"
                                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-gray-500 uppercase tracking-wide">Recipient Email</label>
                                            <input
                                                type="email"
                                                value={flagRecipientEmail}
                                                onChange={(e) => setFlagRecipientEmail(e.target.value)}
                                                placeholder="md@company.com"
                                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={closeFlagModal}
                                        className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { void handleFlagTicket(); }}
                                        disabled={flagLoading || !flagReason.trim()}
                                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:from-red-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    >
                                        {flagLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                                        {flagLoading ? 'Flagging...' : 'Flag Ticket'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Share Modal (after flagging) ── */}
                    {flagModalStep === 'share' && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={closeFlagModal}>
                            <div
                                className="relative w-full max-w-md mx-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button type="button" onClick={closeFlagModal} className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer">
                                    <X className="h-5 w-5" />
                                </button>

                                <div className="flex items-center gap-3 mb-5">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-green-100 to-emerald-100 shadow-sm">
                                        <CheckCircle className="h-5 w-5 text-green-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900">Ticket Flagged Successfully</h2>
                                        <p className="text-sm text-gray-500">Share the report with the recipient</p>
                                    </div>
                                </div>

                                {/* Reason summary */}
                                <div className="rounded-xl border border-red-100 bg-red-50/60 p-3.5 mb-4">
                                    <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">Flag Reason</p>
                                    <p className="text-sm text-red-800 font-medium">{flagReason}</p>
                                </div>

                                {/* Share link */}
                                <div className="space-y-3">
                                    <label className="block text-sm font-semibold text-gray-700">
                                        <Link2 className="inline h-4 w-4 mr-1 -mt-0.5" />
                                        Shareable Report Link
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                                            <p className="truncate text-xs text-gray-600 font-mono">{flagShareUrl}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { void handleCopyShareLink(flagShareUrl); }}
                                            className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all cursor-pointer ${linkCopied
                                                ? 'border border-green-200 bg-green-50 text-green-700'
                                                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                                }`}
                                        >
                                            {linkCopied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                            {linkCopied ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>
                                    {flagShareExpiry && (
                                        <p className="text-[11px] text-gray-400">
                                            Link expires: {new Date(flagShareExpiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </p>
                                    )}
                                </div>

                                {/* Action buttons */}
                                <div className="mt-6 flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => { void handleNativeShare(flagShareUrl, flagReason); }}
                                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:from-purple-700 hover:to-indigo-700 cursor-pointer"
                                    >
                                        <Share2 className="h-4 w-4" />
                                        Share with Recipient
                                    </button>
                                    <button
                                        type="button"
                                        onClick={closeFlagModal}
                                        className="shrink-0 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 cursor-pointer"
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </AdminShell>

            {/* Re-analyze Confirmation Modal */}
            {
                isReanalyzeModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                            <div className="flex items-center gap-3 mb-4 text-amber-600">
                                <AlertTriangle className="w-6 h-6" />
                                <h3 className="text-lg font-semibold text-gray-900">Re-analyze Ticket?</h3>
                            </div>

                            <p className="text-gray-600 mb-6">
                                This will re-run the AI analysis and overwrite all existing scores, key moments, and insights with new data. This may take 30-60 seconds.
                            </p>

                            <div className="flex items-center justify-end gap-3">
                                <button
                                    onClick={() => setReanalyzeModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => reanalyze(id)}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center gap-2"
                                >
                                    <RefreshCcw className="w-4 h-4" />
                                    Yes, Re-analyze
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </ProtectedRoute >
    );
}
