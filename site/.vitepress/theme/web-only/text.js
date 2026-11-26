// The same marking for the components' own words: a string, or an array of strings and { web, agent } parts. The page
// shows `web`; the Markdown for AI agents shows `agent` (nothing when it is left out).

const join = (value, pick) => (Array.isArray(value) ? value.map((p) => (typeof p === 'string' ? p : pick(p) ?? '')).join('') : value);

/** The text as the web page shows it. */
export const forWeb = (value) => join(value, (p) => p.web);

/** The text as the Markdown for AI agents shows it. */
export const forAgents = (value) => join(value, (p) => p.agent);
