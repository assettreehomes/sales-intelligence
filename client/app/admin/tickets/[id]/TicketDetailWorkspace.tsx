'use client';

import { ReactNode, useMemo, useState } from 'react';
import {
    AlertCircle,
    AlertTriangle,
    Briefcase,
    CheckCircle,
    Compass,
    Lightbulb,
    PhoneCall,
    Sparkles,
    Target,
    User,
    Users,
    Zap,
} from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import {
    buildExecutiveFields,
    buildOpportunity,
    deriveMomentCategory,
    maskPhone,
    momentClock,
    normalizeActionItem,
    severityFromMoment,
    type TicketAnalysis,
    type TicketKeyMoment,
} from './ticket-detail-utils';
import { TicketAudioHero, type TicketAudioHeroProps } from './TicketAudioHero';
import { TicketScoreHeader } from './TicketScoreHeader';
import { TicketJsonViewer } from './TicketJsonViewer';
import { TicketNextStep } from './TicketNextStep';
import { TicketCallTimeline } from './TicketCallTimeline';

type SidebarTab = 'insights' | 'transcript' | 'technical';

export interface TicketDetailWorkspaceProps {
    ticket: {
        id: string;
        status: string;
        createdat: string;
        client_id: string;
        clientname?: string | null;
        visittype?: string;
        telecmi_lead_id?: string | null;
        telecmi_user?: string | null;
        selldo_enriched_at?: string | null;
        selldo_agent_name?: string | null;
        selldo_agent_email?: string | null;
        selldo_team_name?: string | null;
        selldo_call_status?: string | null;
        selldo_direction?: string | null;
        telecmi_direction?: string | null;
        presales_agent?: { full_name?: string; email?: string | null } | null;
        presales_team?: { name?: string } | null;
        presales_team_leader?: { full_name?: string } | null;
        creator_details?: { fullname?: string; avatar_url?: string | null };
    };
    analysis: TicketAnalysis | null;
    isPresales: boolean;
    agentName: string;
    agentInitials: string;
    metricCards: {
        politeness: number;
        confidence: number;
        speakers: number;
        interestRaw: string;
        interestScore: number;
        ratingOutOf100: number;
    };
    audio: TicketAudioHeroProps;
    sortedMoments: TicketKeyMoment[];
    seekToMoment: (time: string | number | null | undefined) => void | Promise<void>;
    getSentimentColor: (sentiment: string) => string;
    renderStars: (rating: number) => ReactNode;
    isSuperAdmin?: boolean;
    onAvatarClick?: () => void;
    callDuration?: number;
    children?: ReactNode;
}

function outcomeClass(outcome?: string | null) {
    if (outcome === 'interested') return 'ci-pill ci-pill--success';
    if (outcome === 'not_interested') return 'ci-pill ci-pill--danger';
    if (outcome === 'follow_up_required') return 'ci-pill ci-pill--warn';
    return 'ci-pill';
}

function riskClass(tone: 'low' | 'medium' | 'high') {
    if (tone === 'low') return 'ci-risk ci-risk--low';
    if (tone === 'high') return 'ci-risk ci-risk--high';
    return 'ci-risk ci-risk--medium';
}

export function TicketDetailWorkspace({
    ticket,
    analysis,
    isPresales,
    agentName,
    metricCards,
    audio,
    sortedMoments,
    seekToMoment,
    isSuperAdmin,
    onAvatarClick,
    callDuration,
    children,
}: TicketDetailWorkspaceProps) {
    const [sidebarTab, setSidebarTab] = useState<SidebarTab>('insights');

    const executive = useMemo(() => buildExecutiveFields(analysis), [analysis]);
    const opportunity = useMemo(() => buildOpportunity(analysis), [analysis]);

    const starRating = Math.round((analysis?.rating || 0) / 2);

    type NumberRequestInstance = {
        reason: string;
        time?: string | null;
        transcript_excerpt?: string | null;
        start_time_ms?: number | null;
    };
    type NumberRequests = {
        detected: boolean;
        instances: NumberRequestInstance[];
    };
    // New schema: scores.number_requests.instances[]
    // Legacy schema (pre-migration): scores.mobile_number_alert flat object
    type LegacyMobileAlert = {
        detected?: boolean;
        description?: string | null;
        time?: string | null;
        transcript_excerpt?: string | null;
        start_time_ms?: number | null;
    };
    const numberRequests = isPresales
        ? (analysis?.scores?.number_requests as NumberRequests | null | undefined) ?? null
        : null;
    const legacyAlert = isPresales && !numberRequests
        ? (analysis?.scores?.mobile_number_alert as LegacyMobileAlert | null | undefined) ?? null
        : null;
    const numberInstances: NumberRequestInstance[] = numberRequests?.instances
        ?? (legacyAlert?.detected && legacyAlert.description
            ? [{
                reason: legacyAlert.description,
                time: legacyAlert.time ?? null,
                transcript_excerpt: legacyAlert.transcript_excerpt ?? null,
                start_time_ms: legacyAlert.start_time_ms ?? null,
              }]
            : []);

    const timelineMarkers = useMemo(() => {
        const totalSec = Math.max(callDuration || 0, 1);
        const momentMarkers = sortedMoments.map((m) => {
            const time = momentClock(m);
            const startMs = typeof m.start_time_ms === 'number' ? m.start_time_ms : null;
            const positionPct = startMs !== null && totalSec > 0
                ? Math.max(0, Math.min(100, (startMs / 1000 / totalSec) * 100))
                : undefined;
            return {
                time,
                label: m.label || m.description || 'Moment',
                category: m.category,
                positionPct,
            };
        });
        // Inject number request instances as high-priority markers
        const alertMarkers = numberInstances.map((inst) => {
            const startMs = typeof inst.start_time_ms === 'number' ? inst.start_time_ms : null;
            const positionPct = startMs !== null && totalSec > 0
                ? Math.max(0, Math.min(100, (startMs / 1000 / totalSec) * 100))
                : undefined;
            return {
                time: inst.time ?? (startMs !== null ? `${Math.floor(startMs / 60000)}:${String(Math.floor((startMs % 60000) / 1000)).padStart(2, '0')}` : '0:00'),
                label: '🚨 Number Request',
                category: 'negative',
                positionPct,
            };
        });
        return [...alertMarkers, ...momentMarkers];
    }, [sortedMoments, callDuration, numberInstances]);

    const actionItems = (analysis?.actionitems || [])
        .map(normalizeActionItem)
        .filter((item): item is string => Boolean(item));

    const clientLabel = isPresales
        ? ticket.telecmi_lead_id
            ? `Lead #${ticket.telecmi_lead_id}`
            : maskPhone(ticket.client_id)
        : ticket.clientname || ticket.client_id;

    const agentLabel = isPresales && agentName === 'Unknown Agent' && ticket.telecmi_user
        ? `Ext. ${ticket.telecmi_user.split('_')[0]}`
        : agentName;

    const teamLabel = ticket.presales_team?.name || ticket.selldo_team_name || null;

    return (
        <div className="ci-workspace">
            <header className="ci-pageheader">
                <div>
                    <div className="ci-pageheader__title-row">
                        <span className={`ci-source-tag ci-source-tag--${isPresales ? 'presales' : 'sales'}`}>
                            {isPresales ? <PhoneCall className="h-3.5 w-3.5" /> : <Briefcase className="h-3.5 w-3.5" />}
                            {isPresales ? 'Presales' : 'Sales'}
                        </span>
                        <h1 className="ci-pageheader__title">Conversation quality and intent</h1>
                    </div>
                    <p className="ci-pageheader__sub">
                        {new Date(ticket.createdat).toLocaleString()} · <span className="capitalize">{ticket.status}</span>
                    </p>
                </div>
                <div className="ci-pageheader__chips">
                    {analysis?.call_authenticity && (
                        <span className={`ci-pill ${analysis.call_authenticity === 'fake' ? 'ci-pill--danger' : 'ci-pill--neutral'}`}>
                            {analysis.call_authenticity === 'fake' ? 'Low authenticity' : 'Real call'}
                        </span>
                    )}
                    {analysis?.call_outcome && (
                        <span className={outcomeClass(analysis.call_outcome)}>
                            {analysis.call_outcome.replaceAll('_', ' ')}
                        </span>
                    )}
                    {isPresales && agentLabel && agentLabel !== 'Unknown Agent' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                            <User className="h-3 w-3" /> {agentLabel}
                        </span>
                    )}
                    {isPresales && teamLabel && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                            <Users className="h-3 w-3" /> {teamLabel}
                        </span>
                    )}
                    <div
                        className={`ci-pageheader__agent${isSuperAdmin ? ' is-clickable' : ''}`}
                        onClick={onAvatarClick}
                        title={ticket.creator_details?.fullname}
                        role={isSuperAdmin ? 'button' : undefined}
                    >
                        <Avatar src={ticket.creator_details?.avatar_url} name={agentName} size="xs" />
                        <div className="ci-pageheader__agent-text">
                            <span className="ci-pageheader__agent-label">Handled by</span>
                            <span className="ci-pageheader__agent-name">{agentLabel}</span>
                        </div>
                    </div>
                </div>
            </header>

            {numberInstances.length > 0 && (
                <div className="mx-4 mt-3 rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-500/40 dark:bg-red-500/10">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl leading-none">🚨</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-red-700 dark:text-red-400">
                                Number Request Detected
                            </p>
                            <p className="mt-0.5 text-xs text-red-600 dark:text-red-300">
                                {numberInstances.length === 1
                                    ? '1 number request detected on this call'
                                    : `${numberInstances.length} number requests detected on this call`}
                            </p>
                            <div className="mt-3 flex flex-col gap-3">
                                {numberInstances.map((inst, i) => (
                                    <div key={i} className="rounded-lg border border-red-200 bg-white/60 dark:bg-red-900/20 dark:border-red-500/30 px-3 py-2">
                                        <p className="text-xs font-semibold text-red-700 dark:text-red-300">{inst.reason}</p>
                                        {inst.transcript_excerpt && (
                                            <p className="mt-1 text-xs italic text-red-500 dark:text-red-400 line-clamp-2">
                                                &ldquo;{inst.transcript_excerpt}&rdquo;
                                            </p>
                                        )}
                                        {(inst.time ?? inst.start_time_ms != null) && (
                                            <button
                                                onClick={() => { void seekToMoment(inst.time ?? inst.start_time_ms); }}
                                                className="mt-1.5 text-[11px] font-semibold text-red-600 underline hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                            >
                                                Jump to {inst.time ?? `${Math.floor((inst.start_time_ms ?? 0) / 60000)}:${String(Math.floor(((inst.start_time_ms ?? 0) % 60000) / 1000)).padStart(2, '0')}`} →
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <TicketAudioHero
                {...audio}
                waveformBarCount={audio.waveformBarCount}
                timelineMarkers={timelineMarkers}
                onMarkerClick={(time) => { void seekToMoment(time); }}
            />

            <TicketScoreHeader
                analysis={analysis}
                metricCards={metricCards}
                clientLabel={clientLabel}
                agentLabel={agentLabel}
                teamLabel={teamLabel}
                callDuration={callDuration}
            />

            <div className="ci-workspace__grid">
                <div className="ci-workspace__main">
                    <section className="ci-panel ci-panel--primary">
                        <header className="ci-panel__head">
                            <Zap className="h-5 w-5 text-violet-600" />
                            <h2 className="ci-panel__title">Executive summary</h2>
                        </header>

                        <p className="ci-exec-block__text mb-4">{executive.situation}</p>
                        {executive.context && (
                            <p className="ci-exec-block__text mb-4 text-slate-500 dark:text-slate-400">
                                {executive.context}
                            </p>
                        )}

                        <div className="ci-exec-blocks">
                            <div className="ci-exec-block ci-exec-block--situation">
                                <div className="ci-exec-block__label">
                                    <Compass className="h-3 w-3" /> Main objection
                                </div>
                                <p className="ci-exec-block__text">{executive.mainObjection}</p>
                            </div>
                            <div className="ci-exec-block ci-exec-block--risk">
                                <div className="ci-exec-block__label">
                                    <AlertTriangle className="h-3 w-3" /> Risk
                                </div>
                                <p className="ci-exec-block__text">
                                    <span className={riskClass(executive.risk.tone)}>{executive.risk.label}</span>
                                    <span className="block mt-2 text-sm text-slate-500 dark:text-slate-400">
                                        Based on outcome and engagement signals.
                                    </span>
                                </p>
                            </div>
                            <div className="ci-exec-block ci-exec-block--opportunity">
                                <div className="ci-exec-block__label">
                                    <Target className="h-3 w-3" /> Opportunity
                                </div>
                                <p className="ci-exec-block__text">{opportunity}</p>
                            </div>
                            <div className="ci-exec-block ci-exec-block--action">
                                <div className="ci-exec-block__label">
                                    <Lightbulb className="h-3 w-3" /> Recommended action
                                </div>
                                <p className="ci-exec-block__text">{executive.recommendedAction}</p>
                            </div>
                        </div>
                    </section>

                    <section className="ci-panel">
                        <header className="ci-panel__head" style={{ justifyContent: 'space-between' }}>
                            <div className="flex items-center gap-2">
                                <AlertCircle className="h-5 w-5 text-red-500" />
                                <h2 className="ci-panel__title">Key objections</h2>
                            </div>
                            {analysis?.objections && analysis.objections.length > 0 && (
                                <span className="ci-severity ci-severity--mild">
                                    {analysis.objections.length} raised
                                </span>
                            )}
                        </header>
                        {analysis?.objections?.length ? (
                            <ul className="ci-objection-list">
                                {analysis.objections.map((obj, i) => {
                                    const isObj = typeof obj !== 'string';
                                    const quote = isObj ? obj.objection || '' : (obj as string);
                                    const response = isObj ? obj.response : undefined;
                                    const resolved = isObj ? Boolean(obj.resolved) : false;
                                    const effectiveness = isObj ? String(obj.effectiveness || '').toLowerCase() : '';
                                    const sevClass = resolved
                                        ? 'ci-severity--positive'
                                        : effectiveness === 'poor' || effectiveness === 'fair'
                                            ? 'ci-severity--strong'
                                            : 'ci-severity--mild';
                                    const sevLabel = resolved
                                        ? 'Resolved'
                                        : effectiveness === 'poor' || effectiveness === 'fair'
                                            ? 'Unresolved'
                                            : 'Open';

                                    return (
                                        <li key={i} className={`ci-objection-card ${resolved ? 'ci-objection-card--resolved' : ''}`} style={{ listStyle: 'none' }}>
                                            <div className="ci-objection-card__head">
                                                <p className="ci-objection-card__quote">{quote}</p>
                                                <span className={`ci-severity ${sevClass}`}>{sevLabel}</span>
                                            </div>
                                            {response && (
                                                <div className="ci-objection-card__response">
                                                    <div className="ci-objection-card__response-label">
                                                        <Sparkles className="h-3 w-3" /> Agent response
                                                    </div>
                                                    <p className="ci-objection-card__response-text">{response}</p>
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className="ci-empty">No objections detected on this call.</p>
                        )}
                    </section>

                    <section className="ci-panel">
                        <header className="ci-panel__head" style={{ justifyContent: 'space-between' }}>
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-5 w-5 text-emerald-600" />
                                <h2 className="ci-panel__title">Next steps</h2>
                            </div>
                            {actionItems.length > 0 && (
                                <span className="ci-severity ci-severity--positive">{actionItems.length} actions</span>
                            )}
                        </header>
                        {actionItems.length ? (
                            <div className="flex flex-col gap-2.5">
                                {actionItems.map((item, i) => (
                                    <TicketNextStep key={i} index={i + 1} text={item} />
                                ))}
                            </div>
                        ) : (
                            <p className="ci-empty">No action items generated yet.</p>
                        )}
                    </section>

                    <TicketCallTimeline
                        moments={sortedMoments}
                        duration={callDuration}
                        onJump={(t) => { void seekToMoment(t); }}
                    />

                    {children}
                </div>

                <aside className="ci-workspace__aside">
                    <div className="ci-tabs ci-tabs--segmented" role="tablist">
                        {(['insights', 'transcript', 'technical'] as const).map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                role="tab"
                                aria-selected={sidebarTab === tab}
                                className={`ci-tabs__btn ${sidebarTab === tab ? 'is-active' : ''}`}
                                onClick={() => setSidebarTab(tab)}
                            >
                                {tab === 'insights' ? 'Insights' : tab === 'transcript' ? 'Transcript' : 'Technical'}
                            </button>
                        ))}
                    </div>

                    <div className="ci-tabs__panel">
                        {sidebarTab === 'insights' && (
                            <div className="ci-tab-content">
                                <h3 className="ci-tab-content__title">Key moments</h3>
                                <div className="ci-moments">
                                    {numberInstances.map((inst, i) => {
                                        const time = inst.time ?? (inst.start_time_ms != null
                                            ? `${Math.floor(inst.start_time_ms / 60000)}:${String(Math.floor((inst.start_time_ms % 60000) / 1000)).padStart(2, '0')}`
                                            : '0:00');
                                        return (
                                            <button
                                                key={`nr-${i}`}
                                                type="button"
                                                className="ci-moment"
                                                onClick={() => { void seekToMoment(inst.time ?? inst.start_time_ms); }}
                                            >
                                                <span className="ci-moment__row">
                                                    <span className="ci-moment__dot ci-moment__dot--negative" />
                                                    <span className="ci-moment__time">{time}</span>
                                                    <span className="ci-severity ci-severity--strong">Alert</span>
                                                </span>
                                                <span className="ci-moment__label">🚨 {inst.reason}</span>
                                                <span className="ci-conf">
                                                    <span className="ci-conf__dot ci-conf__dot--high" />
                                                    100% confidence
                                                </span>
                                            </button>
                                        );
                                    })}
                                    {sortedMoments.length ? (
                                        sortedMoments.map((moment, i) => {
                                            const time = momentClock(moment);
                                            const label = moment.label || moment.description || 'Key moment';
                                            const cat = deriveMomentCategory(moment);
                                            const sev = severityFromMoment(moment);
                                            return (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    className="ci-moment"
                                                    onClick={() => { void seekToMoment(time); }}
                                                >
                                                    <span className="ci-moment__row">
                                                        <span className={`ci-moment__dot ci-moment__dot--${cat}`} />
                                                        <span className="ci-moment__time">{time}</span>
                                                        <span className={`ci-severity ci-severity--${sev.tone}`}>
                                                            {sev.label}
                                                        </span>
                                                    </span>
                                                    <span className="ci-moment__label">{label}</span>
                                                </button>
                                            );
                                        })
                                    ) : numberInstances.length === 0 ? (
                                        <p className="ci-empty">No key moments yet.</p>
                                    ) : null}
                                </div>
                            </div>
                        )}

                        {sidebarTab === 'transcript' && (
                            <div className="ci-tab-content">
                                <h3 className="ci-tab-content__title">Conversation timeline</h3>
                                <div className="ci-transcript">
                                    {sortedMoments.length ? (
                                        sortedMoments.map((moment, i) => {
                                            const time = momentClock(moment);
                                            const text = moment.description || moment.label || '—';
                                            return (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    className="ci-transcript__line"
                                                    onClick={() => { void seekToMoment(time); }}
                                                >
                                                    <span className="ci-transcript__time">{time}</span>
                                                    <span className="ci-transcript__text">&ldquo;{text}&rdquo;</span>
                                                </button>
                                            );
                                        })
                                    ) : (
                                        <p className="ci-empty">Transcript highlights will appear after analysis.</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {sidebarTab === 'technical' && (
                            <div className="ci-tab-content">
                                <h3 className="ci-tab-content__title">Metadata</h3>
                                <dl className="ci-meta-list">
                                    <div><dt>Ticket ID</dt><dd className="font-mono text-xs">{ticket.id}</dd></div>
                                    <div><dt>Visit type</dt><dd>{ticket.visittype || '—'}</dd></div>
                                    {isPresales && ticket.selldo_enriched_at && (
                                        <>
                                            <div><dt>CRM agent</dt><dd>{ticket.selldo_agent_name || '—'}</dd></div>
                                            <div><dt>Team</dt><dd>{ticket.selldo_team_name || '—'}</dd></div>
                                            <div><dt>Call status</dt><dd>{ticket.selldo_call_status || '—'}</dd></div>
                                        </>
                                    )}
                                </dl>
                                <h3 className="ci-tab-content__title mt-6">Raw analysis</h3>
                                <TicketJsonViewer data={analysis} />
                            </div>
                        )}
                    </div>
                </aside>
            </div>

            {/* hidden but preserved — star rating renderer used elsewhere */}
            <span className="sr-only">{starRating}/5</span>
        </div>
    );
}
