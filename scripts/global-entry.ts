import * as engine from '../src/index.ts';
import { renderHtml } from '../src/html.ts';

/** The browser build: everything the package exports from its entrance, and the HTML page, under `ursula`. */
(globalThis as Record<string, unknown>)['ursula'] = { ...engine, renderHtml };
