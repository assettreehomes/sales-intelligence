/**
 * Branches: Asset Tree Homes Chrompet / Asset Tree Homes Pammal
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBranch, buildBranchDirectory, ticketBranch, applyTicketBranchFilter } from '../utils/branches.js';
import { isExcludedFromChat } from '../utils/numberRequestEmail.js';
import { buildNumberRequestSummary } from '../utils/numberRequestSummary.js';

const dir = buildBranchDirectory({
    users: [{ id: 'u-pml', branch: 'pammal' }, { id: 'u-chr', branch: null }, { id: 'u-old' }],
    teams: [{ id: 't-pml', name: 'Pammal pre sale' }, { id: 't-chr', name: 'Team C' }, { id: 't-moved', name: 'Pammal sale', branch: 'chrompet' }],
    agents: [
        { id: 'a-pml-own', team_id: 't-chr', branch: 'pammal' },  // own branch wins over the team
        { id: 'a-agent01', team_id: 't-pml', branch: null },        // follows the Pammal team
        { id: 'a-chr', team_id: 't-chr' },
        { id: 'a-none' }
    ]
});

// Records the filters a supabase query builder would get
const recorder = () => {
    const calls = [];
    const q = { or: (f) => (calls.push(['or', f]), q), in: (c, v) => (calls.push(['in', c, v]), q), calls };
    return q;
};

describe('normalizeBranch', () => {
    it('accepts keys and full names, anything else is no branch', () => {
        assert.equal(normalizeBranch('pammal'), 'pammal');
        assert.equal(normalizeBranch('Asset Tree Homes Pammal'), 'pammal');
        assert.equal(normalizeBranch(' CHROMPET '), 'chrompet');
        assert.equal(normalizeBranch('all'), null);
        assert.equal(normalizeBranch(''), null);
        assert.equal(normalizeBranch('madurai'), null);
    });
});

describe('branch directory', () => {
    it('uses a person\'s own branch, then their team, then Chrompet', () => {
        assert.equal(dir.users.get('u-pml'), 'pammal');
        assert.equal(dir.users.get('u-chr'), 'chrompet');
        assert.equal(dir.users.get('u-old'), 'chrompet');
        assert.equal(dir.teams.get('t-pml'), 'pammal');
        assert.equal(dir.teams.get('t-moved'), 'chrompet');
        assert.equal(dir.agents.get('a-pml-own'), 'pammal');
        assert.equal(dir.agents.get('a-agent01'), 'pammal');
        assert.equal(dir.agents.get('a-chr'), 'chrompet');
        assert.equal(dir.agents.get('a-none'), 'chrompet');
    });

    it('puts a ticket in its caller\'s branch', () => {
        assert.equal(ticketBranch({ source: 'manual', createdby: 'u-pml' }, dir), 'pammal');
        assert.equal(ticketBranch({ source: 'manual', createdby: 'u-chr' }, dir), 'chrompet');
        assert.equal(ticketBranch({ source: 'telecmi', presales_agent_id: 'a-pml-own', presales_team_id: 't-chr' }, dir), 'pammal');
        assert.equal(ticketBranch({ source: 'telecmi', presales_agent_id: null, presales_team_id: 't-pml' }, dir), 'pammal');
        assert.equal(ticketBranch({ source: 'telecmi', presales_agent_id: 'a-chr' }, dir), 'chrompet');
        assert.equal(ticketBranch({ source: 'telecmi' }, dir), 'chrompet');
    });
});

describe('applyTicketBranchFilter', () => {
    it('leaves the query alone for all branches', () => {
        const q = recorder();
        applyTicketBranchFilter(q, null, dir, { presales: true });
        assert.deepEqual(q.calls, []);
    });

    it('site visits: Pammal = Pammal staff, Chrompet = everyone else', () => {
        const p = recorder();
        applyTicketBranchFilter(p, 'pammal', dir, { presales: false });
        assert.deepEqual(p.calls, [['in', 'createdby', ['u-pml']]]);
        const c = recorder();
        applyTicketBranchFilter(c, 'chrompet', dir, { presales: false });
        assert.deepEqual(c.calls, [['or', 'createdby.is.null,createdby.not.in.(u-pml)']]);
    });

    it('presales calls: by agent, and by team when the call has no agent', () => {
        const p = recorder();
        applyTicketBranchFilter(p, 'pammal', dir, { presales: true });
        assert.deepEqual(p.calls, [['or', 'presales_agent_id.in.(a-pml-own,a-agent01),and(presales_agent_id.is.null,presales_team_id.in.(t-pml))']]);
        const c = recorder();
        applyTicketBranchFilter(c, 'chrompet', dir, { presales: true });
        assert.deepEqual(c.calls, [
            ['or', 'presales_agent_id.is.null,presales_agent_id.not.in.(a-pml-own,a-agent01)'],
            ['or', 'presales_agent_id.not.is.null,presales_team_id.is.null,presales_team_id.not.in.(t-pml)']
        ]);
    });

    it('keeps the id list valid when a branch has nobody yet', () => {
        const q = recorder();
        applyTicketBranchFilter(q, 'pammal', buildBranchDirectory({}), { presales: false });
        assert.deepEqual(q.calls, [['in', 'createdby', ['00000000-0000-0000-0000-000000000000']]]);
    });
});

describe('Synology Chat exclusion by branch', () => {
    it('skips Pammal branch calls even when no name says Pammal', () => {
        assert.equal(isExcludedFromChat({ agentName: 'Agent P1', teamName: 'Team B', branch: 'pammal' }, ['pammal']), true);
        assert.equal(isExcludedFromChat({ agentName: 'Agent C1', teamName: 'Team C', branch: 'chrompet' }, ['pammal']), false);
        assert.equal(isExcludedFromChat({ agentName: 'Agent PML', teamName: 'Pammal pre sale' }, ['pammal']), true);
    });
});

describe('number-request summary by branch', () => {
    it('groups by branch, then team', () => {
        const call = (agentName, teamName, branch) => ({
            ticket: { id: `tk-${agentName}`, createdat: '2026-10-06T09:15:00Z' }, agentName, teamName, branch,
            summary: 'x', instances: [{ transcript_excerpt: 'unga number sollunga' }]
        });
        const e = buildNumberRequestSummary({
            calls: [call('Agent P1', 'Pammal pre sale', 'pammal'), call('Agent C1', 'Team C', 'chrompet'), call('Agent C2', 'Team C', 'chrompet')],
            from: new Date('2026-10-05T15:30:00Z'), to: new Date('2026-10-06T15:30:00Z'), chatExcluded: ['pammal']
        });
        assert.match(e.text, /BY BRANCH\n- Asset Tree Homes Chrompet: 2 call\(s\)[^\n]*\n- Asset Tree Homes Pammal: 1 call\(s\)/);
        assert.match(e.text, /Asset Tree Homes Chrompet\n- Team C: 2 call\(s\)[\s\S]*Asset Tree Homes Pammal\n- Pammal pre sale: 1 call\(s\)/);
        assert.ok(e.text.indexOf('Agent C1 · Team C') < e.text.indexOf('Agent P1 · Pammal pre sale'));
        assert.match(e.html, /By branch/);
    });
});
