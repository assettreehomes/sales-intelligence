// Branch names and the rules that put a person, team or ticket in a branch. Pure (no I/O):
// services/branches.js loads the rows and caches the lookup maps.
export const BRANCHES = {
    chrompet: 'Asset Tree Homes Chrompet',
    pammal: 'Asset Tree Homes Pammal'
};
export const BRANCH_KEYS = Object.keys(BRANCHES);
export const DEFAULT_BRANCH = 'chrompet';

/** 'pammal' | 'chrompet' | null. Accepts the key or the full name, any case. */
export function normalizeBranch(value) {
    const text = String(value ?? '').trim().toLowerCase();
    if (!text || text === 'all') return null;
    return BRANCH_KEYS.find((key) => text === key || text === BRANCHES[key].toLowerCase() || text.endsWith(` ${key}`)) || null;
}

export function branchLabel(branch) {
    return BRANCHES[normalizeBranch(branch) || DEFAULT_BRANCH];
}

// Never matches a real row; keeps "in.()" lists valid when a branch has nobody in it yet.
const NO_ID = '00000000-0000-0000-0000-000000000000';

export function teamBranch(team) {
    const own = normalizeBranch(team?.branch);
    if (own) return own;
    return /pammal/i.test(team?.name || '') ? 'pammal' : DEFAULT_BRANCH;
}

/** Pure: builds the lookup maps from raw rows (exported for tests). */
export function buildBranchDirectory({ users = [], agents = [], teams = [] } = {}) {
    const teamBranches = new Map(teams.map((team) => [team.id, teamBranch(team)]));
    const agentBranches = new Map(agents.map((agent) => [
        agent.id,
        normalizeBranch(agent.branch) || teamBranches.get(agent.team_id) || DEFAULT_BRANCH
    ]));
    const userBranches = new Map(users.map((user) => [user.id, normalizeBranch(user.branch) || DEFAULT_BRANCH]));
    return { users: userBranches, agents: agentBranches, teams: teamBranches };
}

export function isPresalesTicket(ticket) {
    return ticket?.source === 'telecmi' || ticket?.visittype === 'telecmi_call' || Boolean(ticket?.presales_agent_id);
}

export function ticketBranch(ticket, dir) {
    if (!ticket || !dir) return DEFAULT_BRANCH;
    if (isPresalesTicket(ticket)) {
        return dir.agents.get(ticket.presales_agent_id) || dir.teams.get(ticket.presales_team_id) || DEFAULT_BRANCH;
    }
    return dir.users.get(ticket.createdby) || DEFAULT_BRANCH;
}

export function idsInBranch(map, branch) {
    const ids = [];
    for (const [id, value] of map) if (value === branch) ids.push(id);
    return ids;
}

const list = (ids) => `(${(ids.length ? ids : [NO_ID]).join(',')})`;

/**
 * Narrows a tickets query to one branch. `presales` picks the ticket kind the query returns
 * (true: TeleCMI calls, false: site visits). No branch -> query unchanged.
 */
export function applyTicketBranchFilter(query, branch, dir, { presales }) {
    if (!branch || !dir) return query;
    if (presales) {
        const pammalAgents = list(idsInBranch(dir.agents, 'pammal'));
        const pammalTeams = list(idsInBranch(dir.teams, 'pammal'));
        if (branch === 'pammal') {
            return query.or(`presales_agent_id.in.${pammalAgents},and(presales_agent_id.is.null,presales_team_id.in.${pammalTeams})`);
        }
        return query
            .or(`presales_agent_id.is.null,presales_agent_id.not.in.${pammalAgents}`)
            .or(`presales_agent_id.not.is.null,presales_team_id.is.null,presales_team_id.not.in.${pammalTeams}`);
    }
    const pammalUsers = idsInBranch(dir.users, 'pammal');
    if (branch === 'pammal') return query.in('createdby', pammalUsers.length ? pammalUsers : [NO_ID]);
    return query.or(`createdby.is.null,createdby.not.in.${list(pammalUsers)}`);
}

/** Reads ?branch= from a request: 'chrompet' | 'pammal' | null (all branches). */
export function branchFromQuery(req) {
    return normalizeBranch(req?.query?.branch);
}
