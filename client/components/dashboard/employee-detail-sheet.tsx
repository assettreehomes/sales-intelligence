import { Star, Ticket, Target, Gauge, Mail } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { SkillRadarChart } from '@/components/ui/charts';

export interface EmployeeInsight {
    user_id: string;
    fullname: string;
    email: string;
    role: string;
    avatar_url?: string | null;
    total_tickets: number;
    analyzed_tickets: number;
    failed_tickets: number;
    training_calls: number;
    completion_rate: number;
    avg_rating_5: number;
    avg_rating_10: number;
    skill_avg: number;
    skills: Record<string, number>;
    recent_ratings: Array<{ date: string; rating: number }>;
    visit_types: Record<string, number>;
}

interface EmployeeDetailSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employee: EmployeeInsight | null;
    isOnline?: boolean;
    skillKeys: string[];
    skillLabels: Record<string, string>;
}

function initials(name: string) {
    const chunks = name.trim().split(/\s+/).filter(Boolean);
    if (!chunks.length) return 'NA';
    return chunks.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export function EmployeeDetailSheet({ open, onOpenChange, employee, isOnline = false, skillKeys, skillLabels }: EmployeeDetailSheetProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-xl">
                {employee ? (
                    <>
                        <SheetHeader className="pb-2">
                            <div className="flex items-start justify-between gap-3 pr-8">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-12 w-12 border border-[var(--color-border-subtle)]">
                                        <AvatarImage src={employee.avatar_url || undefined} alt={employee.fullname} />
                                        <AvatarFallback>{initials(employee.fullname)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <SheetTitle>{employee.fullname}</SheetTitle>
                                        <SheetDescription className="mt-1 inline-flex items-center gap-1.5">
                                            <Mail className="h-3.5 w-3.5" />
                                            {employee.email}
                                        </SheetDescription>
                                    </div>
                                </div>
                                <StatusBadge status={isOnline ? 'online' : 'offline'} dot>
                                    {isOnline ? 'Online' : 'Offline'}
                                </StatusBadge>
                            </div>
                        </SheetHeader>

                        <ScrollArea className="h-[calc(100vh-9rem)] pr-4">
                            <div className="space-y-5 pb-6">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-card)] p-3">
                                        <p className="text-xs text-[var(--color-text-muted)]">Tickets</p>
                                        <p className="mt-1 inline-flex items-center gap-1 text-xl font-bold text-[var(--color-text-primary)]">
                                            <Ticket className="h-4 w-4 text-[var(--color-primary-400)]" />
                                            {employee.total_tickets}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-card)] p-3">
                                        <p className="text-xs text-[var(--color-text-muted)]">Avg Rating</p>
                                        <p className="mt-1 inline-flex items-center gap-1 text-xl font-bold text-[var(--color-text-primary)]">
                                            <Star className="h-4 w-4 text-[var(--color-primary-400)]" />
                                            {employee.avg_rating_5.toFixed(1)}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-card)] p-3">
                                        <p className="text-xs text-[var(--color-text-muted)]">Completion</p>
                                        <p className="mt-1 inline-flex items-center gap-1 text-xl font-bold text-[var(--color-text-primary)]">
                                            <Target className="h-4 w-4 text-[var(--color-primary-400)]" />
                                            {employee.completion_rate.toFixed(0)}%
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-card)] p-3">
                                        <p className="text-xs text-[var(--color-text-muted)]">Skill Avg</p>
                                        <p className="mt-1 inline-flex items-center gap-1 text-xl font-bold text-[var(--color-text-primary)]">
                                            <Gauge className="h-4 w-4 text-[var(--color-primary-400)]" />
                                            {employee.skill_avg.toFixed(1)}
                                        </p>
                                    </div>
                                </div>

                                <Separator />

                                <section className="space-y-3">
                                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Skill Radar</h3>
                                    <div className="flex justify-center rounded-xl border border-[var(--color-border-subtle)] bg-[var(--surface-card)] p-3">
                                        <SkillRadarChart
                                            size={230}
                                            labels={skillKeys.map((k) => skillLabels[k] || k)}
                                            values={skillKeys.map((k) => employee.skills?.[k] ?? 0)}
                                        />
                                    </div>
                                </section>

                                <section className="space-y-3">
                                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Skill Breakdown</h3>
                                    <div className="grid grid-cols-1 gap-2">
                                        {skillKeys.map((key) => (
                                            <div
                                                key={key}
                                                className="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--surface-card)] px-3 py-2"
                                            >
                                                <span className="text-sm text-[var(--color-text-secondary)]">{skillLabels[key] || key}</span>
                                                <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                                                    {(employee.skills?.[key] ?? 0).toFixed(1)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <section className="space-y-3">
                                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Visit Type Mix</h3>
                                    <div className="space-y-2">
                                        {Object.entries(employee.visit_types || {}).length ? (
                                            Object.entries(employee.visit_types || {}).map(([visitType, count]) => (
                                                <div
                                                    key={visitType}
                                                    className="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm"
                                                >
                                                    <span className="capitalize text-[var(--color-text-secondary)]">{visitType.replaceAll('_', ' ')}</span>
                                                    <span className="font-semibold text-[var(--color-text-primary)]">{count}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-[var(--color-text-muted)]">No visit type data in this period.</p>
                                        )}
                                    </div>
                                </section>
                            </div>
                        </ScrollArea>
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}
