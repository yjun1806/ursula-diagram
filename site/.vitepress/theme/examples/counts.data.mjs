// The number of examples per type, and how many of them the engine refused, for the Examples index page.
import { readRendered } from '../../examples/pages.mjs';

export default {
  watch: ['../../examples/rendered.json'],
  load: () => Object.fromEntries(readRendered().map((t) => [t.id, { count: t.items.length, errors: t.items.filter((i) => i.error).length }])),
};
