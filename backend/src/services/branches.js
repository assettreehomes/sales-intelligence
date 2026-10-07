// Branches: Asset Tree Homes Chrompet and Asset Tree Homes Pammal.
//
// users, presales_teams and presales_employees carry a nullable `branch` column
// (migrations/2026-10-07_branches.sql). A ticket's branch is its caller's branch:
//   presales call  -> the agent's branch, else the agent's team, else the call's team
//   site visit     -> the branch of the user who recorded it (createdby)
// Not set means: an agent follows their team, a team whose name contains "pammal" is Pammal,
// everything else is Chrompet. Until the migration runs every row reads as "not set", so the
// filters still work (Pammal = the Pammal teams) instead of failing.
import { supabaseAdmin } from '../config/supabase.js';
import { buildBranchDirectory } from '../utils/branches.js';

export * from '../utils/branches.js';

const CACHE_MS = 60 * 1000;
let cached = null;
let cachedAt = 0;

/** Lookup maps id -> branch for users, presales agents and teams. Cached for a minute. */
export async function loadBranchDirectory({ fresh = false } = {}) {
    if (!fresh && cached && Date.now() - cachedAt < CACHE_MS) return cached;
    // select('*') so this keeps working before the branch columns exist
    const [users, agents, teams] = await Promise.all([
        supabaseAdmin.from('users').select('*'),
        supabaseAdmin.from('presales_employees').select('*'),
        supabaseAdmin.from('presales_teams').select('*')
    ]);
    const failed = users.error || agents.error || teams.error;
    if (failed) throw failed;
    cached = buildBranchDirectory({ users: users.data || [], agents: agents.data || [], teams: teams.data || [] });
    cachedAt = Date.now();
    return cached;
}

export function clearBranchCache() {
    cached = null;
}

