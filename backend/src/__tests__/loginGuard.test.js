import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    createFailureLimiter,
    sessionIdFromJwt,
    isTotpSessionValid,
    addTotpSession,
    TOTP_SESSION_TTL_MS
} from '../services/loginGuard.js';

function fakeJwt(payload) {
    return ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.');
}

describe('failure limiter', () => {
    it('blocks after max failures inside the window and forgets them after it', () => {
        let t = 0;
        const limiter = createFailureLimiter({ windowMs: 1000, now: () => t });
        for (let i = 0; i < 3; i++) limiter.recordFailure('a@x');
        assert.equal(limiter.isBlocked('a@x', 3), true);
        assert.equal(limiter.isBlocked('b@x', 3), false);
        t = 1001;
        assert.equal(limiter.isBlocked('a@x', 3), false);
    });

    it('reset clears a key after a successful login', () => {
        const limiter = createFailureLimiter();
        limiter.recordFailure('a@x');
        limiter.recordFailure('a@x');
        limiter.reset('a@x');
        assert.equal(limiter.isBlocked('a@x', 1), false);
    });
});

describe('server-side TOTP sessions', () => {
    it('reads the session id from a Supabase token', () => {
        assert.equal(sessionIdFromJwt(fakeJwt({ session_id: 's-1', sub: 'u' })), 's-1');
        assert.equal(sessionIdFromJwt('not-a-jwt'), null);
        assert.equal(sessionIdFromJwt(fakeJwt({ sub: 'u' })), null);
    });

    it('accepts only sessions that passed TOTP in the last 24 hours', () => {
        const now = 10 * TOTP_SESSION_TTL_MS;
        const meta = { totp_sessions: [{ sid: 'fresh', at: now - 1000 }, { sid: 'old', at: now - TOTP_SESSION_TTL_MS - 1 }] };
        assert.equal(isTotpSessionValid(meta, 'fresh', now), true);
        assert.equal(isTotpSessionValid(meta, 'old', now), false);
        assert.equal(isTotpSessionValid(meta, 'other', now), false);
        assert.equal(isTotpSessionValid({}, 'fresh', now), false);
        assert.equal(isTotpSessionValid(meta, null, now), false);
    });

    it('adds a session, drops expired ones and keeps the list short', () => {
        const now = 10 * TOTP_SESSION_TTL_MS;
        let list = addTotpSession({ totp_sessions: [{ sid: 'old', at: 0 }] }, 'new', now);
        assert.deepEqual(list, [{ sid: 'new', at: now }]);
        for (let i = 0; i < 15; i++) list = addTotpSession({ totp_sessions: list }, `s${i}`, now);
        assert.equal(list.length, 10);
        assert.equal(list.at(-1).sid, 's14');
    });
});
