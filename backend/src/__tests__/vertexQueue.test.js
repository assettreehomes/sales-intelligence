import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createVertexQueue, is429 } from '../services/vertexQueue.js';

const newQueue = () => createVertexQueue({ maxConcurrent: 1, maxRpm: 100, backoffBaseMs: 1, maxRetries: 0, label: 'test' });

describe('vertex queue', () => {
    it('clearQueue cancels waiting jobs instead of starting them all', async () => {
        const q = newQueue();
        let release;
        let started = 0;
        const running = q.callVertex(() => { started++; return new Promise(r => { release = r; }); });
        const waiting = [1, 2, 3].map(() => q.callVertex(async () => { started++; return 'ran'; }));
        await new Promise(r => setImmediate(r));

        assert.equal(q.getQueueStats().waiting, 3);
        assert.equal(q.clearQueue(), 3);
        for (const p of waiting) await assert.rejects(p, /Queue cleared/);
        assert.equal(started, 1);

        release('done');
        assert.equal(await running, 'done');
        assert.equal(q.getQueueStats().active, 0);
        assert.equal(await q.callVertex(async () => 'after'), 'after');
    });

    it('never runs more jobs than maxConcurrent', async () => {
        const q = createVertexQueue({ maxConcurrent: 2, maxRpm: 100, backoffBaseMs: 1, maxRetries: 0 });
        let active = 0, peak = 0;
        const job = () => q.callVertex(async () => {
            active++; peak = Math.max(peak, active);
            await new Promise(r => setTimeout(r, 5));
            active--;
        });
        await Promise.all([job(), job(), job(), job(), job()]);
        assert.equal(peak, 2);
        assert.equal(q.getQueueStats().rpm, 5);
    });
});

describe('is429', () => {
    it('recognises quota and unavailable errors', () => {
        assert.equal(is429({ message: '[VertexAI.ClientError]: got status: 429 Too Many Requests' }), true);
        assert.equal(is429({ message: 'RESOURCE_EXHAUSTED' }), true);
        assert.equal(is429({ message: 'got status: 503 Service Unavailable' }), true);
        assert.equal(is429({ code: 429 }), true);
    });

    it('does not mistake a JSON position for a 429', () => {
        assert.equal(is429({ message: 'Unterminated string in JSON at position 31429' }), false);
        assert.equal(is429({ message: 'Unexpected token at position 5034' }), false);
    });
});
