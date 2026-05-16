import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';

const router = Router();

// Metric keys tracked in analysisresults.scores
const SKILL_KEYS = [
    'politeness',
    'confidence',
    'interest',
    'rapport_building',
    'objection_handling',
    'closing_techniques',
    'product_knowledge',
    'professionalism'
];

const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90, 'all': 365 * 5 };

function toNumber(v) {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function roundTo(v, d = 2) { return Math.round(v * 10 ** d) / 10 ** d; }
function safePercent(part, whole) { return whole > 0 ? roundTo((part / whole) * 100) : 0; }
function emptyOutcomeCounts() {
    return { interested: 0, not_interested: 0, follow_up_required: 0 };
}
function addOutcome(counts, value) {
    if (value && Object.prototype.hasOwnProperty.call(counts, value)) counts[value] += 1;
}
/**
 * GET /analytics/employees
 * Per-employee deep performance stats with skill breakdowns.
 * Query: ?period=7d|30d|90d|all (default 30d)
 */
router.get('/employees', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const periodKey = PERIOD_DAYS[req.query.period] ? req.query.period : '30d';
        const days = PERIOD_DAYS[periodKey];
        const now = new Date();
        const fromDate = new Date(now.getTime() - days * 86400000);

        // 1. Fetch all employees
        const { data: users, error: usersError } = await supabaseAdmin
            .from('users')
            .select('id, fullname, email, role, status, avatar_url')
            .in('role', ['employee', 'admin', 'superadmin'])
            .eq('status', 'active');

        if (usersError) {
            console.error('Analytics users error:', usersError);
            return res.status(500).json({ error: 'Failed to fetch users' });
        }

        // 2. Fetch tickets in period (exclude TeleCMI — those belong to Presales Performance)
        const { data: tickets, error: ticketsError } = await supabaseAdmin
            .from('tickets')
            .select('id, status, rating, createdby, createdat, istrainingcall, visittype, client_id')
            .neq('source', 'telecmi')
            .neq('visittype', 'telecmi_call')
            .is('deletedat', null)
            .gte('createdat', fromDate.toISOString());

        if (ticketsError) {
            console.error('Analytics tickets error:', ticketsError);
            return res.status(500).json({ error: 'Failed to fetch tickets' });
        }

        // 3. Fetch analysis results for those tickets
        const ticketIds = (tickets || []).filter(t => t.status === 'analyzed').map(t => t.id);

        let analysisRows = [];
        if (ticketIds.length > 0) {
            // Batch in chunks of 200
            for (let i = 0; i < ticketIds.length; i += 200) {
                const batch = ticketIds.slice(i, i + 200);
                const { data, error } = await supabaseAdmin
                    .from('analysisresults')
                    .select('ticketid, rating, scores, call_outcome, call_authenticity')
                    .in('ticketid', batch);
                if (!error && data) analysisRows.push(...data);
            }
        }

        // Infer call_outcome from scores.interest for rows where it was never stored
        for (const row of analysisRows) {
            if (!row.call_outcome) {
                const int = String(row.scores?.interest || '').toLowerCase();
                if      (int === 'high')   row.call_outcome = 'interested';
                else if (int === 'low')    row.call_outcome = 'not_interested';
                else if (int === 'medium') row.call_outcome = 'follow_up_required';
            }
        }

        // Index analysis by ticketid
        const analysisByTicket = new Map(analysisRows.map(a => [a.ticketid, a]));

        // Index tickets by creator
        const ticketsByCreator = new Map();
        for (const ticket of (tickets || [])) {
            const creator = ticket.createdby || 'unknown';
            if (!ticketsByCreator.has(creator)) ticketsByCreator.set(creator, []);
            ticketsByCreator.get(creator).push(ticket);
        }

        // 4. Build per-employee stats
        const employees = (users || []).map(user => {
            const empTickets = ticketsByCreator.get(user.id) || [];
            const analyzedTickets = empTickets.filter(t => t.status === 'analyzed');
            const totalCount = empTickets.length;
            const analyzedCount = analyzedTickets.length;
            const failedCount = empTickets.filter(t => t.status === 'analysis_failed').length;
            const trainingCalls = empTickets.filter(t => t.istrainingcall).length;
            const outcome_counts = emptyOutcomeCounts();

            // Ratings
            const ratings = analyzedTickets
                .map(t => toNumber(t.rating))
                .filter(r => r !== null);
            const avgRating10 = ratings.length > 0 ? roundTo(ratings.reduce((a, b) => a + b, 0) / ratings.length) : 0;
            const avgRating5 = roundTo(avgRating10 / 2);

            // Skills breakdown
            const skillSums = {};
            const skillCounts = {};
            SKILL_KEYS.forEach(k => { skillSums[k] = 0; skillCounts[k] = 0; });

            for (const ticket of analyzedTickets) {
                const analysis = analysisByTicket.get(ticket.id);
                addOutcome(outcome_counts, analysis?.call_outcome);
                if (!analysis?.scores) continue;
                const scores = typeof analysis.scores === 'object' ? analysis.scores : {};
                for (const key of SKILL_KEYS) {
                    const val = toNumber(scores[key]);
                    if (val !== null) {
                        skillSums[key] += val;
                        skillCounts[key] += 1;
                    }
                }
            }

            const skills = {};
            let skillTotal = 0;
            let skillMetricCount = 0;
            for (const key of SKILL_KEYS) {
                skills[key] = skillCounts[key] > 0 ? roundTo(skillSums[key] / skillCounts[key]) : 0;
                if (skillCounts[key] > 0) {
                    skillTotal += skills[key];
                    skillMetricCount++;
                }
            }
            const skillAvg = skillMetricCount > 0 ? roundTo(skillTotal / skillMetricCount) : 0;

            // Recent ticket ratings (last 5) for sparkline
            const recentRatings = analyzedTickets
                .sort((a, b) => new Date(b.createdat) - new Date(a.createdat))
                .slice(0, 10)
                .map(t => ({
                    date: t.createdat?.slice(0, 10),
                    rating: toNumber(t.rating) ?? 0
                }))
                .reverse();

            // Visit types
            const visitTypes = {};
            for (const t of empTickets) {
                const vt = t.visittype || 'unknown';
                visitTypes[vt] = (visitTypes[vt] || 0) + 1;
            }

            // Unique projects
            const projectSet = new Set(empTickets.map(t => t.client_id).filter(Boolean));

            return {
                user_id: user.id,
                fullname: user.fullname,
                avatar_url: user.avatar_url,
                email: user.email,
                role: user.role,
                total_tickets: totalCount,
                analyzed_tickets: analyzedCount,
                failed_tickets: failedCount,
                training_calls: trainingCalls,
                outcome_counts,
                completion_rate: safePercent(analyzedCount, totalCount),
                avg_rating_10: avgRating10,
                avg_rating_5: avgRating5,
                skills,
                skill_avg: skillAvg,
                recent_ratings: recentRatings,
                visit_types: visitTypes,
                projects_count: projectSet.size,
            };
        });

        // 5. Team-wide aggregates
        const allRatings = employees.flatMap(e =>
            (ticketsByCreator.get(e.user_id) || [])
                .map(t => toNumber(t.rating))
                .filter(r => r !== null)
        );
        const totalTickets = (tickets || []).length;
        const totalAnalyzed = (tickets || []).filter(t => t.status === 'analyzed').length;
        const totalTraining = (tickets || []).filter(t => t.istrainingcall).length;
        const outcomeCounts = emptyOutcomeCounts();
        analysisRows.forEach((row) => addOutcome(outcomeCounts, row.call_outcome));
        const teamAvgRating10 = allRatings.length > 0
            ? roundTo(allRatings.reduce((a, b) => a + b, 0) / allRatings.length) : 0;

        // Team skill averages
        const teamSkills = {};
        for (const key of SKILL_KEYS) {
            const vals = employees.map(e => e.skills[key]).filter(v => v > 0);
            teamSkills[key] = vals.length > 0 ? roundTo(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
        }

        // Rating distribution (0-2, 2-4, 4-6, 6-8, 8-10)
        const ratingDistribution = [
            { label: 'Poor', range: '0-2', count: 0, color: '#ef4444' },
            { label: 'Fair', range: '2-4', count: 0, color: '#f97316' },
            { label: 'Good', range: '4-6', count: 0, color: '#eab308' },
            { label: 'Great', range: '6-8', count: 0, color: '#22c55e' },
            { label: 'Excellent', range: '8-10', count: 0, color: '#8b5cf6' },
        ];
        for (const r of allRatings) {
            if (r < 2) ratingDistribution[0].count++;
            else if (r < 4) ratingDistribution[1].count++;
            else if (r < 6) ratingDistribution[2].count++;
            else if (r < 8) ratingDistribution[3].count++;
            else ratingDistribution[4].count++;
        }

        // Trend (daily buckets for rating and ticket volume)
        const trendMap = new Map();
        for (const ticket of (tickets || [])) {
            const d = ticket.createdat?.slice(0, 10);
            if (!d) continue;
            const bucket = trendMap.get(d) || { date: d, tickets: 0, rating_sum: 0, rating_count: 0 };
            bucket.tickets++;
            const r = toNumber(ticket.rating);
            if (r !== null) { bucket.rating_sum += r; bucket.rating_count++; }
            trendMap.set(d, bucket);
        }
        const trend = Array.from(trendMap.values())
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(b => ({
                date: b.date,
                tickets: b.tickets,
                avg_rating_5: b.rating_count > 0 ? roundTo((b.rating_sum / b.rating_count) / 2) : null
            }));

        res.json({
            period: periodKey,
            from: fromDate.toISOString(),
            to: now.toISOString(),
            summary: {
                total_tickets: totalTickets,
                analyzed_tickets: totalAnalyzed,
                training_calls: totalTraining,
                outcome_counts: outcomeCounts,
                completion_rate: safePercent(totalAnalyzed, totalTickets),
                avg_rating_10: teamAvgRating10,
                avg_rating_5: roundTo(teamAvgRating10 / 2),
                total_employees: employees.length,
            },
            team_skills: teamSkills,
            rating_distribution: ratingDistribution,
            trend,
            employees: employees.sort((a, b) => b.total_tickets - a.total_tickets),
        });

    } catch (error) {
        console.error('Analytics employees error:', error);
        res.status(500).json({ error: 'Failed to generate employee analytics' });
    }
});

router.get('/presales-performance', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const periodKey = PERIOD_DAYS[req.query.period] ? req.query.period : '30d';
        const days = PERIOD_DAYS[periodKey];
        const now = new Date();
        const fromDate = new Date(now.getTime() - days * 86400000);

        const [
            { data: employees, error: employeesError },
            { data: teams, error: teamsError },
            { data: tickets, error: ticketsError }
        ] = await Promise.all([
            supabaseAdmin
                .from('presales_employees')
                .select('id, full_name, email, role, team_id, status'),
            supabaseAdmin
                .from('presales_teams')
                .select('id, name, team_leader_id, status'),
            supabaseAdmin
                .from('tickets')
                .select('id, status, rating, createdat, durationseconds, presales_agent_id, presales_team_id, selldo_agent_name, selldo_agent_email, selldo_team_name, call_outcome, call_authenticity')
                .eq('source', 'telecmi')
                .is('deletedat', null)
                .gte('createdat', fromDate.toISOString())
        ]);

        if (employeesError) throw employeesError;
        if (teamsError) throw teamsError;
        if (ticketsError) throw ticketsError;

        const ticketIds = (tickets || []).map((ticket) => ticket.id);
        let analysisRows = [];
        for (let i = 0; i < ticketIds.length; i += 200) {
            const batch = ticketIds.slice(i, i + 200);
            const { data, error } = await supabaseAdmin
                .from('analysisresults')
                .select('ticketid, rating, summary, keymoments, actionitems, objections, scores, call_outcome, call_authenticity')
                .in('ticketid', batch);
            if (error) throw error;
            if (data) analysisRows.push(...data);
        }

        // For rows missing call_outcome/call_authenticity (historical data before columns were added),
        // infer from available signals. Priority: lead_quality > interest level.
        let inferredCount = 0;
        for (const row of analysisRows) {
            if (!row.call_outcome) {
                const lq  = row.scores?.lead_qualification?.lead_quality?.toLowerCase?.() || '';
                const int = String(row.scores?.interest || '').toLowerCase();
                // lead_quality is most reliable (explicit AI classification)
                if      (lq === 'hot')   { row.call_outcome = 'interested';         row._inferred = true; }
                else if (lq === 'warm')  { row.call_outcome = 'follow_up_required'; row._inferred = true; }
                else if (lq === 'cold')  { row.call_outcome = 'not_interested';     row._inferred = true; }
                // Fall back to interest level (always present in scores)
                else if (int === 'high') { row.call_outcome = 'interested';         row._inferred = true; }
                else if (int === 'low')  { row.call_outcome = 'not_interested';     row._inferred = true; }
                else if (int === 'medium') { row.call_outcome = 'follow_up_required'; row._inferred = true; }
                if (row._inferred) inferredCount++;
            }
            if (!row.call_authenticity) {
                // Use speakers count as the primary signal — 1 speaker = no customer, likely fake/unanswered
                // Fall back to rating + duration heuristic when speakers data is absent
                const ticket = (tickets || []).find(t => t.id === row.ticketid);
                const dur    = toNumber(ticket?.durationseconds) || 0;
                const score  = toNumber(row.rating) ?? 10;
                const spk    = toNumber(row.scores?.speakers);
                if (spk !== null) {
                    row.call_authenticity = (spk <= 1 && dur < 30) ? 'fake' : 'real';
                } else {
                    row.call_authenticity = (score <= 2 && dur < 20) ? 'fake' : 'real';
                }
            }
        }

        const analysisByTicket = new Map(analysisRows.map((row) => [row.ticketid, row]));
        const employeeMap = new Map((employees || []).map((employee) => [employee.id, employee]));
        const teamMap = new Map((teams || []).map((team) => [team.id, team]));

        // ── DEBUG: inferred outcome counts ──────────────────────────────
        const inferredOutcomeCounts = { interested: 0, not_interested: 0, follow_up_required: 0 };
        const inferredAuthCounts = { real: 0, fake: 0 };
        for (const row of analysisRows) {
            if (row.call_outcome && Object.prototype.hasOwnProperty.call(inferredOutcomeCounts, row.call_outcome)) inferredOutcomeCounts[row.call_outcome]++;
            if (row.call_authenticity === 'real' || row.call_authenticity === 'fake') inferredAuthCounts[row.call_authenticity]++;
        }
        console.log('[presales-perf] inferred outcome counts:', inferredOutcomeCounts, '| auth counts:', inferredAuthCounts);
        // ────────────────────────────────────────────────────────────────

        const buildBucket = (id, label, extra = {}) => ({
            id,
            label,
            total_calls: 0,
            analyzed_calls: 0,
            duration_seconds: 0,
            avg_duration_seconds: 0,
            avg_rating_10: 0,
            outcome_counts: emptyOutcomeCounts(),
            authenticity_counts: { real: 0, fake: 0 },
            daily: {},
            weekly: {},
            ...extra
        });

        const agentBuckets = new Map();
        const teamBuckets = new Map();
        const daily = new Map();
        const weekly = new Map();
        const summary = {
            total_calls: 0,
            analyzed_calls: 0,
            duration_seconds: 0,
            avg_duration_seconds: 0,
            avg_rating_10: 0,
            outcome_counts: emptyOutcomeCounts(),
            authenticity_counts: { real: 0, fake: 0 }
        };

        function addToBucket(bucket, ticket, analysis) {
            bucket.total_calls += 1;
            bucket.duration_seconds += toNumber(ticket.durationseconds) || 0;
            if (ticket.status === 'analyzed') bucket.analyzed_calls += 1;
            const outcome = ticket.call_outcome || analysis?.call_outcome;
            const authenticity = ticket.call_authenticity || analysis?.call_authenticity;
            addOutcome(bucket.outcome_counts, outcome);
            if (authenticity === 'real' || authenticity === 'fake') {
                bucket.authenticity_counts[authenticity] += 1;
            }

            const date = ticket.createdat?.slice(0, 10) || 'unknown';
            bucket.daily[date] = (bucket.daily[date] || 0) + 1;

            const d = new Date(ticket.createdat);
            if (Number.isFinite(d.getTime())) {
                const year = d.getUTCFullYear();
                const week = Math.ceil((((d - new Date(Date.UTC(year, 0, 1))) / 86400000) + 1) / 7);
                const weekKey = `${year}-W${String(week).padStart(2, '0')}`;
                bucket.weekly[weekKey] = (bucket.weekly[weekKey] || 0) + 1;
            }
        }

        for (const ticket of (tickets || [])) {
            const analysis = analysisByTicket.get(ticket.id);
            summary.total_calls += 1;
            summary.duration_seconds += toNumber(ticket.durationseconds) || 0;
            if (ticket.status === 'analyzed') summary.analyzed_calls += 1;
            const outcome = ticket.call_outcome || analysis?.call_outcome;
            const authenticity = ticket.call_authenticity || analysis?.call_authenticity;
            addOutcome(summary.outcome_counts, outcome);
            if (authenticity === 'real' || authenticity === 'fake') {
                summary.authenticity_counts[authenticity] += 1;
            }

            const agentId = ticket.presales_agent_id || `raw:${ticket.selldo_agent_email || ticket.selldo_agent_name || 'unknown'}`;
            const employee = employeeMap.get(ticket.presales_agent_id);
            if (!agentBuckets.has(agentId)) {
                agentBuckets.set(agentId, buildBucket(agentId, employee?.full_name || ticket.selldo_agent_name || 'Unmapped Agent', {
                    email: employee?.email || ticket.selldo_agent_email || null,
                    team_id: ticket.presales_team_id || employee?.team_id || null
                }));
            }
            addToBucket(agentBuckets.get(agentId), ticket, analysis);

            const teamId = ticket.presales_team_id || `raw:${ticket.selldo_team_name || 'unknown'}`;
            const team = teamMap.get(ticket.presales_team_id);
            const leader = team?.team_leader_id ? employeeMap.get(team.team_leader_id) : null;
            if (!teamBuckets.has(teamId)) {
                teamBuckets.set(teamId, buildBucket(teamId, team?.name || ticket.selldo_team_name || 'Unmapped Team', {
                    team_leader: leader ? { id: leader.id, full_name: leader.full_name, email: leader.email } : null
                }));
            }
            addToBucket(teamBuckets.get(teamId), ticket, analysis);

            const date = ticket.createdat?.slice(0, 10);
            if (date) daily.set(date, (daily.get(date) || 0) + 1);
            const d = new Date(ticket.createdat);
            if (Number.isFinite(d.getTime())) {
                const year = d.getUTCFullYear();
                const week = Math.ceil((((d - new Date(Date.UTC(year, 0, 1))) / 86400000) + 1) / 7);
                const key = `${year}-W${String(week).padStart(2, '0')}`;
                weekly.set(key, (weekly.get(key) || 0) + 1);
            }
        }

        const allRatings = (tickets || [])
            .map((ticket) => toNumber(ticket.rating))
            .filter((rating) => rating !== null);
        summary.avg_duration_seconds = summary.total_calls ? Math.round(summary.duration_seconds / summary.total_calls) : 0;
        summary.avg_rating_10 = allRatings.length ? roundTo(allRatings.reduce((a, b) => a + b, 0) / allRatings.length) : 0;

        function finalizeBucket(bucket) {
            const sourceTickets = (tickets || []).filter((ticket) => {
                if (String(bucket.id).startsWith('raw:')) {
                    return bucket.label === (ticket.selldo_agent_name || ticket.selldo_team_name || bucket.label);
                }
                return ticket.presales_agent_id === bucket.id || ticket.presales_team_id === bucket.id;
            });
            const ratings = sourceTickets.map((ticket) => toNumber(ticket.rating)).filter((rating) => rating !== null);
            return {
                ...bucket,
                avg_duration_seconds: bucket.total_calls ? Math.round(bucket.duration_seconds / bucket.total_calls) : 0,
                avg_rating_10: ratings.length ? roundTo(ratings.reduce((a, b) => a + b, 0) / ratings.length) : 0,
                daily: Object.entries(bucket.daily).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
                weekly: Object.entries(bucket.weekly).map(([week, count]) => ({ week, count })).sort((a, b) => a.week.localeCompare(b.week))
            };
        }

        const realOutcomeCount = analysisRows.filter(r => !r._inferred && r.call_outcome).length;
        res.json({
            period: periodKey,
            from: fromDate.toISOString(),
            to: now.toISOString(),
            outcome_data_quality: {
                real: realOutcomeCount,
                inferred: inferredCount,
                unclassified: analysisRows.length - realOutcomeCount - inferredCount,
                total_analyzed: analysisRows.length,
                is_partial: realOutcomeCount < analysisRows.length,
            },
            summary,
            agents: Array.from(agentBuckets.values()).map(finalizeBucket).sort((a, b) => b.total_calls - a.total_calls),
            teams: Array.from(teamBuckets.values()).map(finalizeBucket).sort((a, b) => b.total_calls - a.total_calls),
            daily: Array.from(daily.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
            weekly: Array.from(weekly.entries()).map(([week, count]) => ({ week, count })).sort((a, b) => a.week.localeCompare(b.week))
        });
    } catch (error) {
        console.error('Presales performance analytics error:', error);
        res.status(500).json({ error: 'Failed to generate presales performance analytics' });
    }
});

/**
 * GET /analytics/leaderboard
 * Ranked employees by composite performance score.
 * Composite = rating (40%) + completion (20%) + volume (20%) + skill_avg (20%)
 * Query: ?period=7d|30d|90d|all
 */
router.get('/leaderboard', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const periodKey = PERIOD_DAYS[req.query.period] ? req.query.period : '30d';
        const days = PERIOD_DAYS[periodKey];
        const now = new Date();
        const fromDate = new Date(now.getTime() - days * 86400000);

        const { data: users } = await supabaseAdmin
            .from('users')
            .select('id, fullname, email, role, status, avatar_url')
            .in('role', ['employee', 'admin', 'superadmin'])
            .eq('status', 'active');

        const { data: tickets } = await supabaseAdmin
            .from('tickets')
            .select('id, status, rating, createdby, istrainingcall')
            .neq('source', 'telecmi')
            .neq('visittype', 'telecmi_call')
            .is('deletedat', null)
            .gte('createdat', fromDate.toISOString());

        const ticketIds = (tickets || []).filter(t => t.status === 'analyzed').map(t => t.id);
        let analysisRows = [];
        for (let i = 0; i < ticketIds.length; i += 200) {
            const batch = ticketIds.slice(i, i + 200);
            const { data } = await supabaseAdmin
                .from('analysisresults')
                .select('ticketid, scores')
                .in('ticketid', batch);
            if (data) analysisRows.push(...data);
        }
        const analysisByTicket = new Map(analysisRows.map(a => [a.ticketid, a]));

        const ticketsByCreator = new Map();
        for (const t of (tickets || [])) {
            const c = t.createdby || 'unknown';
            if (!ticketsByCreator.has(c)) ticketsByCreator.set(c, []);
            ticketsByCreator.get(c).push(t);
        }

        // Find max tickets for normalization
        let maxTickets = 1;
        for (const [, tks] of ticketsByCreator) {
            if (tks.length > maxTickets) maxTickets = tks.length;
        }

        const leaderboard = (users || []).map(user => {
            const empTickets = ticketsByCreator.get(user.id) || [];
            if (empTickets.length === 0) return null;

            const analyzed = empTickets.filter(t => t.status === 'analyzed');
            const ratings = analyzed.map(t => toNumber(t.rating)).filter(r => r !== null);
            const avgRating10 = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
            const completionRate = empTickets.length > 0 ? (analyzed.length / empTickets.length) * 100 : 0;
            const volumeNorm = (empTickets.length / maxTickets) * 10; // 0-10 scale

            // Skill avg
            let skillTotal = 0, skillCount = 0;
            for (const t of analyzed) {
                const a = analysisByTicket.get(t.id);
                if (!a?.scores) continue;
                for (const k of SKILL_KEYS) {
                    const v = toNumber(a.scores[k]);
                    if (v !== null) { skillTotal += v; skillCount++; }
                }
            }
            const skillAvg = skillCount > 0 ? skillTotal / skillCount : 0;

            // Composite: rating 40% + completion 20% + volume 20% + skills 20%
            const composite = roundTo(
                (avgRating10 * 0.40) +
                ((completionRate / 10) * 0.20) +  // normalize to 0-10
                (volumeNorm * 0.20) +
                (skillAvg * 0.20),
                2
            );

            return {
                user_id: user.id,
                fullname: user.fullname,
                avatar_url: user.avatar_url,
                role: user.role,
                total_tickets: empTickets.length,
                analyzed_tickets: analyzed.length,
                training_calls: empTickets.filter(t => t.istrainingcall).length,
                avg_rating_10: roundTo(avgRating10),
                avg_rating_5: roundTo(avgRating10 / 2),
                completion_rate: roundTo(completionRate),
                skill_avg: roundTo(skillAvg),
                composite_score: composite,
            };
        }).filter(Boolean).sort((a, b) => b.composite_score - a.composite_score);

        // Assign ranks
        leaderboard.forEach((entry, i) => { entry.rank = i + 1; });

        res.json({
            period: periodKey,
            leaderboard,
        });

    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: 'Failed to generate leaderboard' });
    }
});

export default router;
