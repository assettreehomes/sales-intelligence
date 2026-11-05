// Builds the "who introduces themselves" report for presales calls (GET /analytics/presales-introductions).
// Only real calls analysed since the intro name was added count: their scores carry the
// agent_intro_name key (null = the agent never said their name).
import { extensionOf } from './agentMatch.js';

export const AGENT_SOURCES = ['selldo', 'intro_name', 'intro_name_extension', 'extension', 'earlier', 'none'];

export function agentSourceOf(ticket, scores) {
    if (ticket.selldo_enriched_at && ticket.presales_agent_id) return 'selldo';
    if (scores?.agent_match && ticket.presales_agent_id) return scores.agent_match;
    if (ticket.presales_agent_id) return 'earlier';
    return 'none';
}

function pct(part, whole) {
    return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/**
 * @param {object[]} tickets   telecmi tickets (id, createdat, presales_agent_id, presales_team_id, selldo_enriched_at, telecmi_user, call_authenticity)
 * @param {Map}      scoresByTicket  ticket id -> analysisresults.scores
 * @param {Map}      employeesById   id -> { full_name, team_id }
 * @param {Map}      teamsById       id -> { name }
 */
export function buildIntroReport(tickets, scoresByTicket, employeesById = new Map(), teamsById = new Map()) {
    const sources = Object.fromEntries(AGENT_SOURCES.map((s) => [s, 0]));
    const agents = new Map();
    const unmatchedNames = new Map();
    const unnamedExtensions = new Map();
    let checked = 0;
    let introduced = 0;

    for (const ticket of tickets) {
        if (ticket.call_authenticity !== 'real') continue;
        const scores = scoresByTicket.get(ticket.id);
        if (!scores || !Object.prototype.hasOwnProperty.call(scores, 'agent_intro_name')) continue;

        checked += 1;
        const name = scores.agent_intro_name || null;
        if (name) introduced += 1;
        sources[agentSourceOf(ticket, scores)] += 1;

        const extension = extensionOf(ticket.telecmi_user) || 'unknown';
        if (ticket.presales_agent_id) {
            const row = agents.get(ticket.presales_agent_id) || {
                agent_id: ticket.presales_agent_id,
                name: employeesById.get(ticket.presales_agent_id)?.full_name || 'Unknown agent',
                telecmi_agent_id: employeesById.get(ticket.presales_agent_id)?.telecmi_agent_id || null,
                team: teamsById.get(ticket.presales_team_id || employeesById.get(ticket.presales_agent_id)?.team_id)?.name || null,
                calls: 0,
                introduced: 0,
                skipped: 0,
                last_skipped_ticket_id: null,
                last_skipped_at: null
            };
            row.calls += 1;
            if (name) row.introduced += 1;
            else {
                row.skipped += 1;
                if (!row.last_skipped_at || ticket.createdat > row.last_skipped_at) {
                    row.last_skipped_at = ticket.createdat;
                    row.last_skipped_ticket_id = ticket.id;
                }
            }
            agents.set(ticket.presales_agent_id, row);
        } else if (name) {
            const key = `${name.toLowerCase()}|${extension}`;
            const row = unmatchedNames.get(key) || { name, extension, calls: 0, last_ticket_id: null, last_at: null };
            row.calls += 1;
            if (!row.last_at || ticket.createdat > row.last_at) {
                row.last_at = ticket.createdat;
                row.last_ticket_id = ticket.id;
            }
            unmatchedNames.set(key, row);
        } else {
            const row = unnamedExtensions.get(extension) || { extension, calls: 0, last_ticket_id: null, last_at: null };
            row.calls += 1;
            if (!row.last_at || ticket.createdat > row.last_at) {
                row.last_at = ticket.createdat;
                row.last_ticket_id = ticket.id;
            }
            unnamedExtensions.set(extension, row);
        }
    }

    const agentRows = [...agents.values()]
        .map((row) => ({ ...row, intro_rate: pct(row.introduced, row.calls) }))
        .sort((a, b) => a.intro_rate - b.intro_rate || b.calls - a.calls);

    return {
        totals: {
            real_calls_checked: checked,
            introduced,
            skipped: checked - introduced,
            intro_rate: pct(introduced, checked),
            with_agent: checked - sources.none,
            with_agent_rate: pct(checked - sources.none, checked),
            agent_source: sources
        },
        agents: agentRows,
        unmatched_names: [...unmatchedNames.values()].sort((a, b) => b.calls - a.calls).slice(0, 50),
        unnamed_extensions: [...unnamedExtensions.values()].sort((a, b) => b.calls - a.calls).slice(0, 50)
    };
}
