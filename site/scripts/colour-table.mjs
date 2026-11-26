// Prints the colour table of README.md (`en`, the default) or README.ko.md (`ko`) from the engine's colour table, to
// paste under the Colours section. `npm run check` fails when a README's table differs from this output.
import { markdownTable } from '../.vitepress/theme/colours/colours.mjs';

const lang = process.argv[2] ?? 'en';
if (!['en', 'ko'].includes(lang)) throw new Error(`unknown language ${lang}; use en or ko`);
console.log(markdownTable(lang));
