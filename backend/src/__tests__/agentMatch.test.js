import test from 'node:test';
import assert from 'node:assert/strict';
import { matchAgent, findNameCandidates, normalizeName, extensionOf } from '../utils/agentMatch.js';
import { buildIntroReport, agentSourceOf } from '../utils/introReport.js';

const roster = [
    { id: 'a1', full_name: 'Nisha R', email: 'nisha@x.com', team_id: 't1', status: 'active', telecmi_agent_id: null },
    { id: 'a2', full_name: 'Priya S', email: 'priya.s@x.com', team_id: 't1', status: 'active', telecmi_agent_id: '5116_33336999' },
    { id: 'a3', full_name: 'Priya K', email: 'priyak@x.com', team_id: 't2', status: 'active', telecmi_agent_id: null },
    { id: 'a4', full_name: 'Kalaivani ATH', email: 'kalaivanipml@x.com', team_id: 't2', status: 'active', telecmi_agent_id: '5206' },
    { id: 'a5', full_name: 'Deepa M', email: 'deepa@x.com', team_id: 't2', status: 'inactive', telecmi_agent_id: null }
];

test('extensionOf takes the part before the underscore', () => {
    assert.equal(extensionOf('5088_33336999'), '5088');
    assert.equal(extensionOf('5088'), '5088');
    assert.equal(extensionOf(null), null);
});

test('normalizeName folds common spelling variants', () => {
    assert.equal(normalizeName('Neesha'), normalizeName('Nisha'));
    assert.equal(normalizeName('Priyaa'), normalizeName('Priya'));
    assert.equal(normalizeName('Dheepa'), normalizeName('Deepa'));
});

test('a unique spoken name picks that employee', () => {
    const r = matchAgent({ introName: 'Neesha', telecmiUser: '5300_1', employees: roster });
    assert.equal(r.employee?.id, 'a1');
    assert.equal(r.method, 'intro_name');
});

test('a name two people share is settled by the extension', () => {
    const r = matchAgent({ introName: 'Priya', telecmiUser: '5116_33336999', employees: roster });
    assert.equal(r.employee?.id, 'a2');
    assert.equal(r.method, 'intro_name_extension');
});

test('a shared name with no extension clue gives no agent', () => {
    const r = matchAgent({ introName: 'Priya', telecmiUser: '5999_1', employees: roster });
    assert.equal(r.employee, null);
    assert.equal(r.candidates, 2);
});

test('Sell.Do history on the extension can break a tie', () => {
    const history = new Map([['a3', 12], ['a2', 1]]);
    const r = matchAgent({ introName: 'Priya', telecmiUser: '5999_1', employees: roster, extensionHistory: history });
    assert.equal(r.employee?.id, 'a3');
    const weak = matchAgent({ introName: 'Priya', telecmiUser: '5999_1', employees: roster, extensionHistory: new Map([['a3', 2]]) });
    assert.equal(weak.employee, null);
});

test('no intro falls back to the one employee on that extension', () => {
    const r = matchAgent({ introName: null, telecmiUser: '5206_4', employees: roster });
    assert.equal(r.employee?.id, 'a4');
    assert.equal(r.method, 'extension');
});

test('an intro name nobody has does not fall back to the extension', () => {
    const r = matchAgent({ introName: 'Ramesh', telecmiUser: '5206_4', employees: roster });
    assert.equal(r.employee, null);
});

test('email names and inactive staff are handled', () => {
    assert.deepEqual(findNameCandidates('Kalaivani', roster).map((e) => e.id), ['a4']);
    assert.deepEqual(findNameCandidates('Deepa', roster), []);
});

test('short names must match exactly', () => {
    assert.deepEqual(findNameCandidates('Nila', roster), []);
});

test('agentSourceOf prefers Sell.Do, then the match method', () => {
    assert.equal(agentSourceOf({ selldo_enriched_at: 'x', presales_agent_id: 'a1' }, { agent_match: 'intro_name' }), 'selldo');
    assert.equal(agentSourceOf({ presales_agent_id: 'a1' }, { agent_match: 'extension' }), 'extension');
    assert.equal(agentSourceOf({ presales_agent_id: 'a1' }, {}), 'earlier');
    assert.equal(agentSourceOf({}, {}), 'none');
});

test('buildIntroReport counts intros per agent and lists unmatched names', () => {
    const tickets = [
        { id: '1', createdat: '2026-11-01T05:00:00Z', presales_agent_id: 'a1', call_authenticity: 'real', telecmi_user: '5300_1' },
        { id: '2', createdat: '2026-11-02T05:00:00Z', presales_agent_id: 'a1', call_authenticity: 'real', telecmi_user: '5300_1' },
        { id: '3', createdat: '2026-11-02T06:00:00Z', presales_agent_id: null, call_authenticity: 'real', telecmi_user: '5400_1' },
        { id: '4', createdat: '2026-11-02T07:00:00Z', presales_agent_id: null, call_authenticity: 'real', telecmi_user: '5500_1' },
        { id: '5', createdat: '2026-11-02T08:00:00Z', presales_agent_id: 'a1', call_authenticity: 'fake', telecmi_user: '5300_1' },
        { id: '6', createdat: '2026-10-01T08:00:00Z', presales_agent_id: 'a1', call_authenticity: 'real', telecmi_user: '5300_1' }
    ];
    const scores = new Map([
        ['1', { agent_intro_name: 'Nisha', agent_match: 'intro_name' }],
        ['2', { agent_intro_name: null }],
        ['3', { agent_intro_name: 'Ramesh' }],
        ['4', { agent_intro_name: null }],
        ['5', { agent_intro_name: null }],
        ['6', { politeness: 80 }] // analysed before the intro field existed
    ]);
    const report = buildIntroReport(tickets, scores, new Map([['a1', { full_name: 'Nisha R', team_id: 't1' }]]), new Map([['t1', { name: 'Team A' }]]));
    assert.equal(report.totals.real_calls_checked, 4);
    assert.equal(report.totals.introduced, 2);
    assert.equal(report.totals.intro_rate, 50);
    assert.equal(report.totals.agent_source.intro_name, 1);
    assert.equal(report.totals.agent_source.earlier, 1);
    assert.equal(report.totals.agent_source.none, 2);
    assert.equal(report.agents[0].name, 'Nisha R');
    assert.equal(report.agents[0].team, 'Team A');
    assert.equal(report.agents[0].skipped, 1);
    assert.equal(report.agents[0].last_skipped_ticket_id, '2');
    assert.deepEqual(report.unmatched_names.map((r) => [r.name, r.extension]), [['Ramesh', '5400']]);
    assert.deepEqual(report.unnamed_extensions.map((r) => r.extension), ['5500']);
});
