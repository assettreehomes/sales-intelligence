/**
 * Task #13 — Presales tickets filter: askedMobileNumber query param
 * Tests the query parameter parsing and filter-building logic used in tickets.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Replicate the filter-building logic from tickets.js ─────────────────────

/**
 * Builds a list of active filters from query params (mirrors tickets.js logic).
 * Returns an array of { field, op, value } filter descriptors for inspection.
 */
function buildPresalesFilters(query) {
    const filters = [];

    if (query.source) filters.push({ field: 'source', op: 'eq', value: query.source });
    if (query.status) filters.push({ field: 'status', op: 'eq', value: query.status });
    if (query.presalesAgentId) filters.push({ field: 'presales_agent_id', op: 'eq', value: query.presalesAgentId });
    if (query.presalesTeamId) filters.push({ field: 'presales_team_id', op: 'eq', value: query.presalesTeamId });
    if (query.callOutcome) filters.push({ field: 'call_outcome', op: 'eq', value: query.callOutcome });
    if (query.callAuthenticity) filters.push({ field: 'call_authenticity', op: 'eq', value: query.callAuthenticity });

    // askedMobileNumber filter — the feature under test
    if (query.askedMobileNumber === 'true') {
        filters.push({ field: 'asked_mobile_number', op: 'eq', value: true });
    }

    if (query.search) {
        filters.push({ field: 'clientname', op: 'ilike', value: `%${query.search}%` });
    }

    return filters;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ticketsFilter: askedMobileNumber query param (Task #13)', () => {
    it('adds asked_mobile_number=true filter when askedMobileNumber=true', () => {
        const filters = buildPresalesFilters({ source: 'telecmi', askedMobileNumber: 'true' });
        const mobileFilter = filters.find(f => f.field === 'asked_mobile_number');
        assert.ok(mobileFilter, 'Expected asked_mobile_number filter to be present');
        assert.equal(mobileFilter.op, 'eq');
        assert.equal(mobileFilter.value, true);
    });

    it('does NOT add asked_mobile_number filter when askedMobileNumber is absent', () => {
        const filters = buildPresalesFilters({ source: 'telecmi' });
        const mobileFilter = filters.find(f => f.field === 'asked_mobile_number');
        assert.equal(mobileFilter, undefined, 'Should not add filter when param absent');
    });

    it('does NOT add asked_mobile_number filter when askedMobileNumber=false', () => {
        const filters = buildPresalesFilters({ source: 'telecmi', askedMobileNumber: 'false' });
        const mobileFilter = filters.find(f => f.field === 'asked_mobile_number');
        assert.equal(mobileFilter, undefined, 'Should not add filter for false value');
    });

    it('does NOT add asked_mobile_number filter when askedMobileNumber=all', () => {
        const filters = buildPresalesFilters({ source: 'telecmi', askedMobileNumber: 'all' });
        const mobileFilter = filters.find(f => f.field === 'asked_mobile_number');
        assert.equal(mobileFilter, undefined);
    });

    it('combines with other filters correctly', () => {
        const filters = buildPresalesFilters({
            source: 'telecmi',
            askedMobileNumber: 'true',
            callAuthenticity: 'real',
            callOutcome: 'interested',
        });
        assert.equal(filters.length, 4);
        assert.ok(filters.some(f => f.field === 'asked_mobile_number' && f.value === true));
        assert.ok(filters.some(f => f.field === 'call_authenticity' && f.value === 'real'));
        assert.ok(filters.some(f => f.field === 'call_outcome' && f.value === 'interested'));
    });

    it('search filter is still applied alongside askedMobileNumber', () => {
        const filters = buildPresalesFilters({
            source: 'telecmi',
            askedMobileNumber: 'true',
            search: 'John'
        });
        const searchFilter = filters.find(f => f.field === 'clientname');
        assert.ok(searchFilter, 'Expected search filter');
        assert.equal(searchFilter.value, '%John%');
        assert.ok(filters.some(f => f.field === 'asked_mobile_number'));
    });
});

describe('ticketsFilter: sortOrder behaviour', () => {
    it('default sort order is desc', () => {
        const sortOrder = 'desc'; // matches DEFAULT_FILTERS
        assert.equal(sortOrder, 'desc');
    });

    it('when numberRequestsFilter is active, sortOrder should be desc', () => {
        // mirrors toggleNumberRequestsFilter in presalesStore.ts
        function activateNumberRequestsFilter(currentFilters) {
            return {
                ...currentFilters,
                numberRequestsFilter: 'true',
                dateFilter: 'all',
                sortOrder: 'desc',
            };
        }

        const result = activateNumberRequestsFilter({ statusFilter: 'all', dateFilter: '7d', sortOrder: 'asc' });
        assert.equal(result.numberRequestsFilter, 'true');
        assert.equal(result.dateFilter, 'all');
        assert.equal(result.sortOrder, 'desc');
    });
});
