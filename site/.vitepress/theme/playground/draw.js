// What the playground does with the engine, kept free of the DOM so that it can be run under Node as well.

/** The output tabs, in the order they are shown. */
export const TABS = [
  { id: 'svg', label: 'SVG' },
  { id: 'text', label: 'Terminal text' },
  { id: 'ascii', label: 'ASCII' },
  { id: 'text-svg', label: 'text-svg' },
];

export const MIN_WIDTH = 20;
export const MAX_WIDTH = 240;
export const DEFAULT_WIDTH = 80;

/** Keeps a width inside the range the control offers. */
export function clampWidth(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
}

/**
 * Draws `src` for one tab with the engine (the `ursula` global of dist/ursula.global.js, or the ES module).
 * Returns `{ svg }`, `{ lines }` (each line an array of `{ text, tone }` spans) or `{ error }`; it never throws.
 */
export function draw(engine, src, tab, width) {
  try {
    switch (tab) {
      case 'svg':
        return { svg: engine.render(src) };
      case 'text':
      case 'ascii': {
        const out = engine.renderTextSpans(src, width, tab === 'ascii' ? { charset: 'ascii' } : {});
        return 'error' in out ? { error: out.error } : { lines: out.lines };
      }
      case 'text-svg': {
        const out = engine.renderTextSvg(src, width);
        return 'error' in out ? { error: out.error } : { svg: out.svg };
      }
      default:
        return { error: `Unknown output: ${tab}` };
    }
  } catch (err) {
    return { error: err && typeof err.message === 'string' ? err.message : String(err) };
  }
}

// --- Sharing by the URL hash: #tab=text&w=80&z=<deflate-raw, base64url> (or b=<base64url> without compression) ---

function toBase64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** The hash (without `#`) that brings back this text, tab and width. */
export async function encodeState({ src, tab, width }) {
  const params = new URLSearchParams({ tab, w: String(width) });
  const bytes = new TextEncoder().encode(src);
  if (typeof CompressionStream === 'function') {
    params.set('z', toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw'))));
  } else {
    params.set('b', toBase64Url(bytes));
  }
  return params.toString();
}

/** Reads a hash made by `encodeState`. Missing or broken parts come back as undefined. */
export async function decodeState(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state = {};
  const tab = params.get('tab');
  if (tab && TABS.some((t) => t.id === tab)) state.tab = tab;
  if (params.has('w')) state.width = clampWidth(params.get('w'));
  try {
    if (params.has('z') && typeof DecompressionStream === 'function') {
      state.src = new TextDecoder().decode(await pipe(fromBase64Url(params.get('z')), new DecompressionStream('deflate-raw')));
    } else if (params.has('b')) {
      state.src = new TextDecoder().decode(fromBase64Url(params.get('b')));
    }
  } catch {
    // A broken link leaves the text as it was.
  }
  return state;
}
