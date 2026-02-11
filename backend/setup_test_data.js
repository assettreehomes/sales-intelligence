import { supabaseAdmin } from './src/config/supabase.js';

async function setupTestData() {
    // Check tickets schema
    const { data: sampleTicket, error: schemaError } = await supabaseAdmin
        .from('tickets')
        .select('*')
        .limit(1);

    if (schemaError) {
        // If error is PGRST204, it might be empty but valid query. If 404/400 etc, schema issue.
        console.log('Schema check result:', schemaError);
    } else if (sampleTicket && sampleTicket.length > 0) {
        console.log('Existing ticket columns:', Object.keys(sampleTicket[0]));
    } else {
        console.log('Tickets table is empty, trying to insert...');
    }

    // Get a valid user
    const { data: users } = await supabaseAdmin.from('users').select('id').limit(1);
    const userId = users && users.length > 0 ? users[0].id : null;

    if (!userId) {
        console.error('No users found to assign ticket to.');
        return;
    }

    const { data: tickets } = await supabaseAdmin
        .from('tickets')
        .select('id')
        .limit(1);

    if (!tickets || tickets.length === 0) {
        console.log('No tickets found. Creating one with userId:', userId);

        const { data: newTicket, error } = await supabaseAdmin
            .from('tickets')
            .insert({
                client_id: 'Test Client ID',
                clientname: 'Test Client Name',
                visittype: 'site_visit',
                visit_type: 'site_visit', // Populating both to be safe
                status: 'analyzed',
                createdby: userId,
                created_by: userId
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating ticket:', error);
            return;
        }
        console.log('Created ticket:', newTicket.id);
        await insertAnalysis(newTicket.id);
    } else {
        console.log('Using ticket:', tickets[0].id);
        await insertAnalysis(tickets[0].id);
    }
}

async function insertAnalysis(ticketId) {
    const analysis = {
        ticketid: ticketId,
        status: 'completed',
        rating: 8.5,
        summary: 'Excellent interaction with the client. The agent showed great product knowledge and handled potential concerns well.',
        scores: {
            politeness: 95,
            confidence: 88,
            interest: 'HIGH',
            speakers: 2
        },
        keymoments: [
            { time: '02:15', label: 'Rapport Building', description: 'Agent connected over shared interests', sentiment: 'positive' },
            { time: '05:30', label: 'Price Discussion', description: 'Client hesitated on price', sentiment: 'neutral' },
            { time: '08:45', label: 'Closing', description: 'Strong closing statement', sentiment: 'positive' }
        ],
        improvementsuggestions: [
            'Try to pause more often to let the client speak',
            'Address the budget concern earlier'
        ],
        objections: [
            'Price is too high for this location',
            'Not sure about the timeline'
        ],
        actionitems: [
            'Send brochure via email',
            'Schedule follow-up call'
        ]
    };

    const { error } = await supabaseAdmin
        .from('analysisresults') // Assuming this is the correct table name as verified earlier
        .upsert(analysis, { onConflict: 'ticketid' });

    if (error) {
        console.error('Error inserting analysis:', error);
    } else {
        console.log('Analysis inserted successfully for ticket:', ticketId);
    }
}

setupTestData();
