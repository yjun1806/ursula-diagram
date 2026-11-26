// The playground's copy and download actions, in the browser. What each tab hands over is decided in draw.js.

import { resolveColours } from './draw.js';

/** Copies by selecting a hidden text area, for browsers without navigator.clipboard (or outside HTTPS). */
function copyWithSelection(text) {
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(input);
  const focused = document.activeElement;
  let ok = false;
  try {
    input.select();
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  input.remove();
  if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  return ok;
}

/** Puts `text` on the clipboard. Resolves to whether it got there. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied or unavailable: try the selection below.
  }
  return copyWithSelection(text);
}

/** Whether this browser can put a PNG on the clipboard. */
export function canCopyImage() {
  return typeof ClipboardItem === 'function' && !!navigator.clipboard?.write && window.isSecureContext;
}

/**
 * Draws `svg` as a PNG at twice its size, in the colours `frame` shows now (light or dark), on the frame's surface
 * colour so that a dark drawing stays readable where it is pasted.
 */
async function toPng(svg, frame) {
  const style = getComputedStyle(frame);
  const lookup = (name) => style.getPropertyValue(`--${name}`).trim();
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(resolveColours(svg, lookup))}`;
  await img.decode();
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(img.naturalWidth * scale);
  canvas.height = Math.ceil(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = lookup('ursula-surface') || '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no PNG'))), 'image/png'));
}

/** Copies `svg` as a PNG image. The PNG is passed as a promise so that the click still counts as the user's gesture. */
export async function copyImage(svg, frame) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': toPng(svg, frame) })]);
    return true;
  } catch {
    return false;
  }
}

/** Saves `text` as a file named `name`. */
export function download(text, { name, type }) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
