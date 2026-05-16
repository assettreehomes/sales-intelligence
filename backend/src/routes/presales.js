import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { getPresalesDirectorySnapshot } from '../services/presalesDirectory.js';

const router = Router();

function cleanText(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
}

function cleanEmail(value) {
    const text = cleanText(value);
    return text ? text.toLowerCase() : null;
}

function requireRole(value) {
    return value === 'team_leader' ? 'team_leader' : 'agent';
}

router.use(authMiddleware, requireAdmin);

router.get('/directory', async (_req, res) => {
    try {
        const snapshot = await getPresalesDirectorySnapshot();
        res.json(snapshot);
    } catch (error) {
        console.error('Presales directory fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch presales directory' });
    }
});

router.get('/employees', async (_req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('presales_employees')
            .select('id, full_name, email, role, team_id, status, selldo_agent_name, telecmi_agent_id, created_at, updated_at')
            .order('full_name', { ascending: true });

        if (error) throw error;
        res.json({ employees: data || [] });
    } catch (error) {
        console.error('Presales employees fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch presales employees' });
    }
});

router.post('/employees', async (req, res) => {
    try {
        const fullName = cleanText(req.body.full_name || req.body.fullname || req.body.name);
        const email = cleanEmail(req.body.email);
        const role = requireRole(req.body.role);
        const teamId = cleanText(req.body.team_id);

        if (!fullName) {
            return res.status(400).json({ error: 'full_name is required' });
        }

        const payload = {
            full_name: fullName,
            email,
            role,
            team_id: role === 'agent' ? teamId : null,
            status: cleanText(req.body.status) || 'active',
            selldo_agent_name: cleanText(req.body.selldo_agent_name) || (role === 'agent' ? fullName : null),
            telecmi_agent_id: cleanText(req.body.telecmi_agent_id)
        };

        const { data, error } = await supabaseAdmin
            .from('presales_employees')
            .insert(payload)
            .select('id, full_name, email, role, team_id, status, selldo_agent_name, telecmi_agent_id, created_at, updated_at')
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, employee: data });
    } catch (error) {
        console.error('Presales employee create error:', error);
        res.status(500).json({ error: 'Failed to create presales employee', details: error.message });
    }
});

router.patch('/employees/:id', async (req, res) => {
    try {
        const updates = {};
        if ('full_name' in req.body || 'fullname' in req.body || 'name' in req.body) {
            const name = cleanText(req.body.full_name || req.body.fullname || req.body.name);
            if (!name) return res.status(400).json({ error: 'full_name cannot be blank' });
            updates.full_name = name;
        }
        if ('email' in req.body) updates.email = cleanEmail(req.body.email);
        if ('role' in req.body) updates.role = requireRole(req.body.role);
        if ('team_id' in req.body) updates.team_id = cleanText(req.body.team_id);
        if ('status' in req.body) updates.status = cleanText(req.body.status) || 'active';
        if ('selldo_agent_name' in req.body) updates.selldo_agent_name = cleanText(req.body.selldo_agent_name);
        if ('telecmi_agent_id' in req.body) updates.telecmi_agent_id = cleanText(req.body.telecmi_agent_id);

        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin
            .from('presales_employees')
            .update(updates)
            .eq('id', req.params.id)
            .select('id, full_name, email, role, team_id, status, selldo_agent_name, telecmi_agent_id, created_at, updated_at')
            .single();

        if (error) throw error;
        res.json({ success: true, employee: data });
    } catch (error) {
        console.error('Presales employee update error:', error);
        res.status(500).json({ error: 'Failed to update presales employee', details: error.message });
    }
});

router.get('/teams', async (_req, res) => {
    try {
        const snapshot = await getPresalesDirectorySnapshot();
        res.json({ teams: snapshot.teams });
    } catch (error) {
        console.error('Presales teams fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch presales teams' });
    }
});

router.post('/teams', async (req, res) => {
    try {
        const name = cleanText(req.body.name);
        if (!name) return res.status(400).json({ error: 'name is required' });

        const { data, error } = await supabaseAdmin
            .from('presales_teams')
            .insert({
                name,
                team_leader_id: cleanText(req.body.team_leader_id),
                status: cleanText(req.body.status) || 'active'
            })
            .select('id, name, team_leader_id, status, created_at, updated_at')
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, team: data });
    } catch (error) {
        console.error('Presales team create error:', error);
        res.status(500).json({ error: 'Failed to create presales team', details: error.message });
    }
});

router.patch('/teams/:id', async (req, res) => {
    try {
        const updates = {};
        if ('name' in req.body) {
            const name = cleanText(req.body.name);
            if (!name) return res.status(400).json({ error: 'name cannot be blank' });
            updates.name = name;
        }
        if ('team_leader_id' in req.body) updates.team_leader_id = cleanText(req.body.team_leader_id);
        if ('status' in req.body) updates.status = cleanText(req.body.status) || 'active';
        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin
            .from('presales_teams')
            .update(updates)
            .eq('id', req.params.id)
            .select('id, name, team_leader_id, status, created_at, updated_at')
            .single();

        if (error) throw error;
        res.json({ success: true, team: data });
    } catch (error) {
        console.error('Presales team update error:', error);
        res.status(500).json({ error: 'Failed to update presales team', details: error.message });
    }
});

router.post('/teams/:teamId/members', async (req, res) => {
    try {
        const employeeId = cleanText(req.body.employee_id);
        if (!employeeId) return res.status(400).json({ error: 'employee_id is required' });

        const { data, error } = await supabaseAdmin
            .from('presales_employees')
            .update({
                team_id: req.params.teamId,
                role: 'agent',
                updated_at: new Date().toISOString()
            })
            .eq('id', employeeId)
            .select('id, full_name, email, role, team_id, status, selldo_agent_name, telecmi_agent_id, created_at, updated_at')
            .single();

        if (error) throw error;
        res.json({ success: true, employee: data });
    } catch (error) {
        console.error('Presales team member add error:', error);
        res.status(500).json({ error: 'Failed to add team member', details: error.message });
    }
});

router.delete('/teams/:teamId/members/:employeeId', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('presales_employees')
            .update({
                team_id: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.employeeId)
            .eq('team_id', req.params.teamId)
            .select('id, full_name, email, role, team_id, status, selldo_agent_name, telecmi_agent_id, created_at, updated_at')
            .maybeSingle();

        if (error) throw error;
        res.json({ success: true, employee: data || null });
    } catch (error) {
        console.error('Presales team member remove error:', error);
        res.status(500).json({ error: 'Failed to remove team member', details: error.message });
    }
});

export default router;
