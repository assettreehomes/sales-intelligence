import { supabaseAdmin } from '../config/supabase.js';

function cleanText(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
}

function cleanEmail(value) {
    const text = cleanText(value);
    return text ? text.toLowerCase() : null;
}

async function findTeamByName(name) {
    const { data, error } = await supabaseAdmin
        .from('presales_teams')
        .select('id, name, team_leader_id, status')
        .ilike('name', name)
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data || null;
}

async function findEmployeeByEmail(email) {
    const { data, error } = await supabaseAdmin
        .from('presales_employees')
        .select('id, full_name, email, role, team_id, status, selldo_agent_name')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data || null;
}

export async function resolvePresalesOrg({ agent_name, agent_email, team_name } = {}) {
    const agentName = cleanText(agent_name);
    const agentEmail = cleanEmail(agent_email);
    const teamName = cleanText(team_name);

    let team = null;
    if (teamName) {
        team = await findTeamByName(teamName);

        if (!team) {
            const { data, error } = await supabaseAdmin
                .from('presales_teams')
                .insert({
                    name: teamName,
                    status: 'active'
                })
                .select('id, name, team_leader_id, status')
                .single();

            if (error) throw error;
            team = data;
            console.log(`👥 Presales directory: created team "${teamName}"`);
        } else if (team.status !== 'active') {
            const { data, error } = await supabaseAdmin
                .from('presales_teams')
                .update({ status: 'active', updated_at: new Date().toISOString() })
                .eq('id', team.id)
                .select('id, name, team_leader_id, status')
                .single();

            if (!error && data) team = data;
        }
    }

    let agent = null;
    if (agentEmail) {
        agent = await findEmployeeByEmail(agentEmail);

        if (!agent) {
            const { data, error } = await supabaseAdmin
                .from('presales_employees')
                .insert({
                    full_name: agentName || agentEmail,
                    email: agentEmail,
                    role: 'agent',
                    team_id: team?.id || null,
                    status: 'active',
                    selldo_agent_name: agentName || null
                })
                .select('id, full_name, email, role, team_id, status, selldo_agent_name')
                .single();

            if (error) throw error;
            agent = data;
            console.log(`👤 Presales directory: created agent "${agent.full_name}" (${agentEmail})`);
        } else {
            const updates = {};
            if (agent.status !== 'active') updates.status = 'active';
            if (agentName && agent.full_name !== agentName) updates.full_name = agentName;
            if (agentName && agent.selldo_agent_name !== agentName) updates.selldo_agent_name = agentName;
            if (team?.id && !agent.team_id) updates.team_id = team.id;

            if (Object.keys(updates).length > 0) {
                updates.updated_at = new Date().toISOString();

                const { data, error } = await supabaseAdmin
                    .from('presales_employees')
                    .update(updates)
                    .eq('id', agent.id)
                    .select('id, full_name, email, role, team_id, status, selldo_agent_name')
                    .single();

                if (error) throw error;
                agent = data;
            }
        }
    }

    return {
        agent,
        team,
        agentId: agent?.id || null,
        teamId: team?.id || agent?.team_id || null,
        teamLeaderId: team?.team_leader_id || null
    };
}

export async function getPresalesDirectorySnapshot() {
    const [{ data: teams, error: teamsError }, { data: employees, error: employeesError }] = await Promise.all([
        supabaseAdmin
            .from('presales_teams')
            .select('id, name, team_leader_id, status, created_at, updated_at')
            .order('name', { ascending: true }),
        supabaseAdmin
            .from('presales_employees')
            .select('id, full_name, email, role, team_id, status, selldo_agent_name, telecmi_agent_id, created_at, updated_at')
            .order('full_name', { ascending: true })
    ]);

    if (teamsError) throw teamsError;
    if (employeesError) throw employeesError;

    const employeeById = new Map((employees || []).map((employee) => [employee.id, employee]));
    const enrichedTeams = (teams || []).map((team) => ({
        ...team,
        team_leader: team.team_leader_id ? employeeById.get(team.team_leader_id) || null : null,
        members: (employees || []).filter((employee) => employee.team_id === team.id && employee.role === 'agent')
    }));

    return {
        teams: enrichedTeams,
        employees: employees || []
    };
}
