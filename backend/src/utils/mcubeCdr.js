// Parse an MCube "call completed" push into the fields the presales pipeline needs.
//
// MCube's documented payload (ticket #207698, 23 Nov 2026):
// {
//   "starttime": "2023-10-12 11:49:57", "endtime": "2023-10-12 11:50:28",
//   "callid": "8088976729169709111", "emp_phone": "9996999832",
//   "clicktocalldid": "9996999720", "callto": "8306111333",
//   "dialstatus": "ANSWER", "filename": "https://s3.ap-south-1.amazonaws.com/app.mcube.com/recordings/....wav",
//   "direction": "inbound", "disconnectedby": "Customer", "answeredtime": "00:00:04",
//   "groupname": "Integration", "agentname": "Test"
// }
// Times come without a zone and are IST. MCube may add more keys (dtmf, custom params),
// so unknown keys are tolerated and a few alternative spellings are accepted.

const IST_OFFSET = '+05:30';

function str(v) {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'false' ? s : null;
}

function pick(obj, ...keys) {
    for (const k of keys) {
        const v = str(obj?.[k]);
        if (v) return v;
    }
    return null;
}

// "2023-10-12 11:49:57" (IST) → ISO string. Values that already carry a zone are kept.
export function mcubeTimeToIso(value) {
    const s = str(value);
    if (!s) return null;
    if (/^\d{10,13}$/.test(s)) {
        const n = Number(s);
        const d = new Date(s.length === 13 ? n : n * 1000);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/);
    const d = m ? new Date(`${m[1]}T${m[2].length === 5 ? m[2] + ':00' : m[2]}${IST_OFFSET}`) : new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// "00:01:04" → 64, "64" → 64
export function hmsToSeconds(value) {
    const s = str(value);
    if (!s) return 0;
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
    const parts = s.split(':').map(Number);
    if (parts.some(n => !Number.isFinite(n))) return 0;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function digits(v) {
    const s = str(v);
    return s ? s.replace(/\D/g, '') || null : null;
}

// Optional CRM lead id passed with click-to-call and echoed back by MCube.
function leadIdFrom(payload) {
    const direct = pick(payload, 'lead_id', 'leadid', 'leadId', 'crm_lead_id', 'refid', 'ref_id');
    if (direct) return direct;
    const custom = pick(payload, 'custom', 'customparam', 'custom_param', 'param');
    if (!custom) return null;
    try {
        const parsed = JSON.parse(custom);
        const id = parsed?.lead_id ?? parsed?.leadId ?? parsed?.id ?? null;
        return id == null ? null : String(id);
    } catch (_) {
        return /^\d{3,12}$/.test(custom) ? custom : null;
    }
}

export function parseMcubeCdr(payload = {}) {
    const p = payload && typeof payload === 'object' ? payload : {};
    const dirRaw = (pick(p, 'direction', 'calltype', 'call_type') || '').toLowerCase();
    const direction = dirRaw.startsWith('in') ? 'inbound' : 'outbound';
    const dialstatus = (pick(p, 'dialstatus', 'status', 'callstatus') || '').toUpperCase();
    const recordingUrl = pick(p, 'filename', 'recording', 'recording_url', 'recordingurl');
    const startIso = mcubeTimeToIso(pick(p, 'starttime', 'start_time'));
    const endIso = mcubeTimeToIso(pick(p, 'endtime', 'end_time'));
    let talkSec = hmsToSeconds(pick(p, 'answeredtime', 'answered_time', 'duration', 'billsec'));
    if (!talkSec && startIso && endIso && dialstatus === 'ANSWER') {
        talkSec = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000));
    }

    return {
        callId: pick(p, 'callid', 'call_id', 'callId'),
        direction,
        dialstatus: dialstatus || null,
        answered: dialstatus === 'ANSWER' || dialstatus === 'ANSWERED',
        // customer number: callto for outbound; inbound pushes may put the caller in callfrom
        customerNumber: digits(direction === 'inbound'
            ? (p.callfrom ?? p.caller ?? p.callto)
            : (p.callto ?? p.customer_number)),
        agentPhone: digits(p.emp_phone ?? p.agent_phone),
        agentName: pick(p, 'agentname', 'agent_name', 'empname', 'emp_name'),
        agentEmail: pick(p, 'agentemail', 'agent_email', 'empemail', 'emp_email'),
        group: pick(p, 'groupname', 'group_name', 'group'),
        did: digits(p.clicktocalldid ?? p.did ?? p.landingnumber),
        disconnectedBy: pick(p, 'disconnectedby', 'disconnected_by'),
        dtmf: pick(p, 'dtmf', 'dtmfinput', 'dtmf_input'),
        recordingUrl,
        startIso,
        endIso,
        talkSec,
        leadId: leadIdFrom(p)
    };
}

// Only fetch recordings from MCube's own storage. The URL comes from the request
// body, so without this check the webhook could be used to make our server fetch
// arbitrary internal addresses.
const DEFAULT_HOSTS = ['s3.ap-south-1.amazonaws.com', 'app.mcube.com', 'mcube.com'];

export function isAllowedRecordingUrl(url, extraHosts = process.env.MCUBE_RECORDING_HOSTS) {
    let u;
    try { u = new URL(String(url).trim()); } catch (_) { return false; }
    if (u.protocol !== 'https:') return false;
    const allowed = [...DEFAULT_HOSTS, ...String(extraHosts || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)];
    const host = u.hostname.toLowerCase();
    const hostOk = allowed.some(h => host === h || host.endsWith('.' + h));
    if (!hostOk) return false;
    // On the shared S3 host only MCube's bucket path is accepted
    if (host === 's3.ap-south-1.amazonaws.com' && !u.pathname.startsWith('/app.mcube.com/')) return false;
    return true;
}

export function recordingExtension(url, contentType = '') {
    const ct = String(contentType).toLowerCase();
    if (ct.includes('wav')) return 'wav';
    if (ct.includes('mpeg') || ct.includes('mp3')) return 'mp3';
    const m = String(url || '').toLowerCase().split('?')[0].match(/\.(wav|mp3|m4a|ogg|flac|aac|webm)$/);
    return m ? m[1] : 'mp3';
}
