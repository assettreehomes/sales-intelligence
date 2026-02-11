import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../../data');
const ticketsFile = join(dataDir, 'tickets.json');

// Ensure data directory exists
if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
}

// Initialize empty tickets file if it doesn't exist
if (!existsSync(ticketsFile)) {
    writeFileSync(ticketsFile, JSON.stringify([], null, 2));
}

/**
 * Load all tickets from JSON file
 * @returns {Array} All tickets
 */
export function loadTickets() {
    try {
        const data = readFileSync(ticketsFile, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading tickets:', error);
        return [];
    }
}

/**
 * Save tickets to JSON file
 * @param {Array} tickets 
 */
export function saveTickets(tickets) {
    writeFileSync(ticketsFile, JSON.stringify(tickets, null, 2));
}

/**
 * Get a single ticket by ID
 * @param {string} id 
 * @returns {object|null}
 */
export function getTicketById(id) {
    const tickets = loadTickets();
    return tickets.find(t => t.ticket_id === id) || null;
}

/**
 * Create a new ticket
 * @param {object} ticketData 
 * @returns {object} Created ticket
 */
export function createTicket(ticketData) {
    const tickets = loadTickets();
    const newTicket = {
        ...ticketData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    tickets.push(newTicket);
    saveTickets(tickets);
    return newTicket;
}

/**
 * Update a ticket
 * @param {string} id 
 * @param {object} updates 
 * @returns {object|null} Updated ticket
 */
export function updateTicket(id, updates) {
    const tickets = loadTickets();
    const index = tickets.findIndex(t => t.ticket_id === id);

    if (index === -1) return null;

    tickets[index] = {
        ...tickets[index],
        ...updates,
        updated_at: new Date().toISOString()
    };

    saveTickets(tickets);
    return tickets[index];
}

/**
 * Delete a ticket
 * @param {string} id 
 * @returns {boolean}
 */
export function deleteTicket(id) {
    const tickets = loadTickets();
    const filtered = tickets.filter(t => t.ticket_id !== id);

    if (filtered.length === tickets.length) return false;

    saveTickets(filtered);
    return true;
}
