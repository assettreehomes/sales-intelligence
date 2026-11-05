// Gives a presales call an agent when Sell.Do did not: from the name the agent says in
// the intro, matched to the presales employee list, with the TeleCMI extension as the
// tie-breaker and fallback (rules in utils/agentMatch.js). Sell.Do's agent always wins:
// the ticket is only updated while presales_agent_id is still empty.
import { supabaseAdmin } from '../config/supabase.js';
import { matchAgent, extensionOf } from '../utils/agentMatch.js';

const ROSTER_TTL_MS = 10 * 60 * 1000;
const HISTORY_DAYS = 60;

let rosterCache = { at: 0, rows: null };

async function loadRoster() {
    if (rosterCache.rows && Date.now() - rosterCache.at < ROSTER_TTL_MS) return rosterCache.rows;
    const { data, error } = await supabaseAdmin
        .from('presales_employees')
        .select('id, full_name, email, team_id, status, selldo_agent_name, telecmi_agent_id');
    if (error) throw error;
    rosterCache = { at: Date.now(), rows: data || [] };
    return rosterCache.rows;
}

export function clearRosterCache() {
    rosterCache = { at: 0, rows: null };
}

// employeeId -> calls on this extension that Sell.Do attributed to them (recent only)
async function loadExtensionHistory(extension) {
    const history = new Map();
    if (!extension || !/^\w+$/.test(extension)) return history;
    const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();
    const { data, error } = await supabaseAdmin
        .from('tickets')
        .select('presales_agent_id, telecmi_user')
        .eq('source', 'telecmi')
        .like('telecmi_user', `${extension}_%`)
        .not('selldo_enriched_at', 'is', null)
        .not('presales_agent_id', 'is', null)
        .gte('createdat', since)
        .limit(2000);
    if (error) throw error;
    for (const row of data || []) {
        if (extensionOf(row.telecmi_user) !== extension) continue; // "_" in LIKE matches any character
        history.set(row.presales_agent_id, (history.get(row.presales_agent_id) || 0) + 1);
    }
    return history;
}

/**
 * Never throws: a matching problem must not fail the analysis.
 * @returns {Promise<{ agentId: string|null, teamId: string|null, agentName: string|null, method: string|null }>}
 */
export async function assignAgentFromIntro({ ticketId, ticket, introName }) {
    const none = { agentId: null, teamId: null, agentName: null, method: null };
    try {
        if (ticket.presales_agent_id) return none;
        const employees = await loadRoster();
        let result = matchAgent({ introName, telecmiUser: ticket.telecmi_user, employees });
        if (!result.employee && result.candidates > 1) {
            const history = await loadExtensionHistory(extensionOf(ticket.telecmi_user));
            result = matchAgent({ introName, telecmiUser: ticket.telecmi_user, employees, extensionHistory: history });
        }
        if (!result.employee) return none;

        const { data, error } = await supabaseAdmin
            .from('tickets')
            .update({
                presales_agent_id: result.employee.id,
                presales_team_id: ticket.presales_team_id || result.employee.team_id || null
            })
            .eq('id', ticketId)
            .is('presales_agent_id', null)
            .select('id');
        if (error) throw error;
        if (!data?.length) return none; // Sell.Do named the agent while we were matching

        console.log(`👤 Presales agent for ${ticketId}: ${result.employee.full_name} (${result.method})`);
        return {
            agentId: result.employee.id,
            teamId: ticket.presales_team_id || result.employee.team_id || null,
            agentName: result.employee.full_name || null,
            method: result.method
        };
    } catch (err) {
        console.warn(`⚠️ Agent matching skipped for ${ticketId}:`, err.message);
        return none;
    }
}
