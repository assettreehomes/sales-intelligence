import { supabaseAdmin } from '../config/supabase.js';

/**
 * Visit Sequencing Service
 * Automatically determines visit number and links to previous ticket using client_id
 */

/**
 * Get the next visit number for a client
 * @param {string} clientId - The unique client ID (required)
 * @returns {object} - { visitNumber, previousTicketId }
 */
export async function getVisitSequence(clientId) {
    if (!clientId) {
        return { visitNumber: 1, previousTicketId: null };
    }

    // Find the most recent ticket for this client_id
    const { data: previousTickets, error } = await supabaseAdmin
        .from('tickets')
        .select('id, visitnumber, client_id')
        .eq('client_id', clientId.trim())
        .order('visitnumber', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching previous tickets:', error);
        return { visitNumber: 1, previousTicketId: null };
    }

    if (!previousTickets || previousTickets.length === 0) {
        // First visit for this client
        return { visitNumber: 1, previousTicketId: null };
    }

    const lastTicket = previousTickets[0];

    return {
        visitNumber: (lastTicket.visitnumber || 0) + 1,
        previousTicketId: lastTicket.id
    };
}

/**
 * Get previous ticket analysis for comparison
 * @param {string} previousTicketId - UUID of previous ticket
 * @returns {object|null} - Previous analysis data
 */
export async function getPreviousAnalysis(previousTicketId) {
    if (!previousTicketId) {
        return null;
    }

    const { data: analysis, error } = await supabaseAdmin
        .from('analysisresults')
        .select('*')
        .eq('ticketid', previousTicketId)
        .single();

    if (error || !analysis) {
        return null;
    }

    return {
        rating: analysis.rating,
        summary: analysis.summary,
        scores: analysis.scores, // CRITICAL: needed for comparison
        key_moments: analysis.keymoments,
        improvement_suggestions: analysis.improvementsuggestions,
        objections: analysis.objections,
        action_items: analysis.actionitems
    };
}

/**
 * Get all tickets in a visit chain for a client
 * @param {string} ticketId - Starting ticket ID
 * @returns {array} - Array of tickets in chronological order
 */
export async function getVisitChain(ticketId) {
    // First get the current ticket to find client_id
    const { data: currentTicket, error: ticketError } = await supabaseAdmin
        .from('tickets')
        .select('client_id')
        .eq('id', ticketId)
        .single();

    if (ticketError || !currentTicket || !currentTicket.client_id) {
        return [];
    }

    // Get all tickets for this client_id, ordered by visit number
    const { data: chain, error } = await supabaseAdmin
        .from('tickets')
        .select('id, visitnumber, createdat, status, rating, client_id, clientname')
        .eq('client_id', currentTicket.client_id)
        .order('visitnumber', { ascending: true });

    if (error) {
        console.error('Error fetching visit chain:', error);
        return [];
    }

    return chain || [];
}

export default { getVisitSequence, getPreviousAnalysis, getVisitChain };
