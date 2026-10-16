/**
 * Tickets whose analysis is running or waiting in a Vertex queue on this
 * instance. The backend runs as a single Cloud Run instance, so this set is the
 * truth about what is in flight. Stuck-ticket resets and re-triggers skip these
 * ids: a ticket waiting in a long queue is slow, not stuck, and starting a second
 * analysis of it made the two jobs delete each other's audio file.
 */
const inFlight = new Set();

export function isInFlight(ticketId) {
    return inFlight.has(ticketId);
}

/** Marks the ticket in flight; returns false if it already was. */
export function claimInFlight(ticketId) {
    if (inFlight.has(ticketId)) return false;
    inFlight.add(ticketId);
    return true;
}

export function releaseInFlight(ticketId) {
    inFlight.delete(ticketId);
}

export function inFlightIds() {
    return [...inFlight];
}
