import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanIntroName, labelWithIntroName } from '../utils/agentIntroName.js';
import { getPresalesAnalysisPrompt } from '../prompts/analysis.js';

test('cleanIntroName keeps a plain name', () => {
    assert.equal(cleanIntroName('  Nisha '), 'Nisha');
    assert.equal(cleanIntroName('"Priya."'), 'Priya');
});

test('cleanIntroName drops empty, placeholder and non-string values', () => {
    for (const v of [null, undefined, '', '   ', 'null', 'Unknown', 'N/A', 42, {}]) {
        assert.equal(cleanIntroName(v), null);
    }
});

test('cleanIntroName strips digits and caps length', () => {
    assert.equal(cleanIntroName('Nisha 98765'), 'Nisha');
    assert.ok(cleanIntroName('A'.repeat(100)).length <= 40);
});

test('labelWithIntroName combines extension and spoken name', () => {
    assert.equal(labelWithIntroName('Ext. 5206', 'Nisha'), 'Ext. 5206 (said "Nisha")');
    assert.equal(labelWithIntroName('Ext. 5206', null), 'Ext. 5206');
    assert.equal(labelWithIntroName(null, 'Nisha'), 'said "Nisha"');
    assert.equal(labelWithIntroName(null, null), null);
});

test('presales prompt asks for the agent intro name', () => {
    assert.match(getPresalesAnalysisPrompt(), /agent_intro_name/);
});
