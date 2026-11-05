// The name a presales agent says for themselves at the start of a call
// ("This is Nisha from Asset Tree Homes"). Used to identify the agent when
// Sell.Do sent no name and the TeleCMI extension is shared or unmapped.

const MAX_LEN = 40;

/** Returns a short, safe name string, or null when the model gave nothing usable. */
export function cleanIntroName(value) {
    if (typeof value !== 'string') return null;
    const name = value.replace(/\d/g, '').replace(/\s+/g, ' ').trim().replace(/^["'.,\s]+|["'.,\s]+$/g, '');
    if (!name || /^(null|none|unknown|n\/a|na)$/i.test(name)) return null;
    return name.length > MAX_LEN ? name.slice(0, MAX_LEN).trim() : name;
}

/** "Ext. 5206" + "Nisha" -> 'Ext. 5206 (said "Nisha")'. */
export function labelWithIntroName(base, introName) {
    const name = cleanIntroName(introName);
    if (!base) return name ? `said "${name}"` : null;
    return name ? `${base} (said "${name}")` : base;
}
