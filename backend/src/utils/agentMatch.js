// Matches the name a presales agent says in their call intro ("This is Nisha from
// Asset Tree Homes") to the presales employee list, so calls with no Sell.Do agent
// still count for someone. Pure functions: the roster and extension history are
// passed in (services/agentIdentity.js loads them).
//
// Order of trust:
//   1. the intro name matches exactly one employee                   -> 'intro_name'
//   2. it matches several, and the TeleCMI extension picks one         -> 'intro_name_extension'
//      (an employee whose telecmi_agent_id is this extension, or the one
//       Sell.Do has named most often on this extension)
//   3. no usable intro, but exactly one employee has this extension    -> 'extension'
//   otherwise no agent: a wrong name is worse than none.

const MIN_FUZZY_LEN = 5;

/** "5088_33336999" or "5088" -> "5088" */
export function extensionOf(value) {
    if (value === null || value === undefined) return null;
    const ext = String(value).trim().split('_')[0];
    return ext || null;
}

export function normalizeName(value) {
    if (typeof value !== 'string') return '';
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z\s]/g, ' ')
        // Transliteration variants of the same name: Priyaa/Priya, Neesha/Nisha, Deepa/Dheepa
        .replace(/aa+/g, 'a')
        .replace(/ee+/g, 'i')
        .replace(/oo+/g, 'u')
        .replace(/([bcdgkpt])h/g, '$1')
        .replace(/y\b/g, 'i')
        .replace(/\s+/g, ' ')
        .trim();
}

const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'sir', 'madam', 'mam', 'dr', 'ath', 'pml', 'new', 'presales', 'pre', 'sales', 'agent', 'tl']);

function nameTokens(value) {
    return normalizeName(value).split(' ').filter((t) => t.length >= 2 && !TITLES.has(t));
}

function emailTokens(email) {
    if (typeof email !== 'string') return [];
    const local = email.split('@')[0].replace(/\d+/g, ' ').replace(/[._-]+/g, ' ');
    // "kalaivanipml" -> "kalaivani"
    return nameTokens(local.replace(/pml\b/i, ''));
}

function withinOneEdit(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    let j = 0;
    let edits = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { i += 1; j += 1; continue; }
        edits += 1;
        if (edits > 1) return false;
        if (a.length > b.length) i += 1;
        else if (b.length > a.length) j += 1;
        else { i += 1; j += 1; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenMatches(spoken, token) {
    if (spoken === token) return true;
    return spoken.length >= MIN_FUZZY_LEN && token.length >= MIN_FUZZY_LEN && withinOneEdit(spoken, token);
}

/** Employees whose name (full name, Sell.Do name or email) contains the spoken first name. */
export function findNameCandidates(introName, employees = []) {
    const spoken = nameTokens(introName);
    if (!spoken.length) return [];
    const first = spoken[0];
    return employees.filter((employee) => {
        if (employee.status && employee.status !== 'active') return false;
        const tokens = new Set([
            ...nameTokens(employee.full_name),
            ...nameTokens(employee.selldo_agent_name),
            ...emailTokens(employee.email)
        ]);
        for (const token of tokens) {
            if (tokenMatches(first, token)) return true;
        }
        return false;
    });
}

function pickByExtension(candidates, extension, extensionHistory) {
    if (!extension || !candidates.length) return null;
    const own = candidates.filter((c) => extensionOf(c.telecmi_agent_id) === extension);
    if (own.length === 1) return own[0];

    // extensionHistory: Map(employeeId -> calls Sell.Do attributed to them on this extension)
    if (extensionHistory?.size) {
        const ranked = candidates
            .map((c) => ({ c, n: extensionHistory.get(c.id) || 0 }))
            .sort((a, b) => b.n - a.n);
        const [best, next] = ranked;
        if (best && best.n >= 3 && best.n >= 2 * (next?.n || 0)) return best.c;
    }
    return null;
}

/**
 * @param {object} p
 * @param {string|null} p.introName       cleaned agent_intro_name from the analysis
 * @param {string|null} p.telecmiUser     tickets.telecmi_user ("5088_33336999")
 * @param {object[]}    p.employees       presales_employees rows
 * @param {Map}         [p.extensionHistory] employeeId -> Sell.Do-attributed calls on this extension
 * @returns {{ employee: object|null, method: string|null, candidates: number }}
 */
export function matchAgent({ introName, telecmiUser, employees = [], extensionHistory = null }) {
    const extension = extensionOf(telecmiUser);
    const candidates = introName ? findNameCandidates(introName, employees) : [];

    if (candidates.length === 1) {
        return { employee: candidates[0], method: 'intro_name', candidates: 1 };
    }
    if (candidates.length > 1) {
        const picked = pickByExtension(candidates, extension, extensionHistory);
        return picked
            ? { employee: picked, method: 'intro_name_extension', candidates: candidates.length }
            : { employee: null, method: null, candidates: candidates.length };
    }

    // No intro, or a name nobody on the list has: fall back to the extension alone,
    // but only when the intro does not contradict it.
    if (extension) {
        const owners = employees.filter((e) => (!e.status || e.status === 'active') && extensionOf(e.telecmi_agent_id) === extension);
        if (owners.length === 1 && !introName) {
            return { employee: owners[0], method: 'extension', candidates: 0 };
        }
    }
    return { employee: null, method: null, candidates: 0 };
}
