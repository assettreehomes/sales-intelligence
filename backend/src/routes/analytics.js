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

        // 2. Fetch tickets in period
        const { data: tickets, error: ticketsError } = await supabaseAdmin
            .from('tickets')
            .select('id, status, rating, createdby, createdat, istrainingcall, visittype, client_id')
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
                    .select('ticketid, rating, scores')
                    .in('ticketid', batch);
                if (!error && data) analysisRows.push(...data);
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
