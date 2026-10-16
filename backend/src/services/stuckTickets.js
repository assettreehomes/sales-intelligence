import { supabaseAdmin } from '../config/supabase.js';
import { isInFlight } from './inFlight.js';

/**
 * Moves tickets left in `processing` (any source: presales calls and site
 * visits) back to `analysis_failed`, skipping tickets this instance is still
 * analysing or has queued. Optionally also recovers TeleCMI tickets that never
 * got past `uploading` / `pending` (the instance died while downloading the
 * recording); autoRetry then re-downloads them.
 *
 * Returns the ids that were reset.
 */
export async function resetStuckTickets(reason, { olderThanMs = 10 * 60 * 1000, includeTelecmiUploads = false } = {}) {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const ids = [];

    const { data: processing, error } = await supabaseAdmin
        .from('tickets')
        .select('id')
        .eq('status', 'processing')
        .or(`analysis_started_at.lt.${cutoff},analysis_started_at.is.null`)
        .limit(500);
    if (error) {
        console.warn('Stuck-ticket reset: lookup failed:', error.message);
        return ids;
    }
    ids.push(...(processing || []).map(t => t.id));

    if (includeTelecmiUploads) {
        const { data: uploads, error: uploadsError } = await supabaseAdmin
            .from('tickets')
            .select('id')
            .eq('source', 'telecmi')
            .in('status', ['uploading', 'pending'])
            .not('telecmi_filename', 'is', null)
            .lt('createdat', cutoff)
            .limit(500);
        if (uploadsError) console.warn('Stuck-ticket reset: upload lookup failed:', uploadsError.message);
        else ids.push(...(uploads || []).map(t => t.id));
    }

    const toReset = ids.filter(id => !isInFlight(id));
    if (!toReset.length) return [];

    const { error: updateError } = await supabaseAdmin
        .from('tickets')
        .update({ status: 'analysis_failed', analysiserror: reason })
        .in('id', toReset);
    if (updateError) {
        console.warn('Stuck-ticket reset: update failed:', updateError.message);
        return [];
    }
    console.log(`Stuck-ticket reset: ${toReset.length} ticket(s) → analysis_failed (${reason})`);
    return toReset;
}
