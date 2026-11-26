// Turns the anchor VitePress puts in every h2 and h3 into a button that copies a link to that section.
// The anchor stays a link (a middle click or a modified click still opens it); a plain click, Enter or Space copies
// the page's address with the section's hash, puts the hash in the address bar without scrolling, and says so.

const ANCHORS = ':is(h2, h3)[id] > a.header-anchor';
const LABEL = { en: 'Copy link to this section', ko: '이 절의 링크 복사' };
const COPIED = { en: 'Link copied', ko: '링크를 복사했습니다' };
const SHOWN_MS = 1600;

const langOf = () => (/^ko\b/i.test(document.documentElement.lang) ? 'ko' : 'en');

function upgrade(root) {
  const lang = langOf();
  for (const a of root.querySelectorAll(ANCHORS)) {
    if (a.dataset.copyLink === lang) continue;
    a.dataset.copyLink = lang;
    a.setAttribute('role', 'button');
    // VitePress's router scrolls to any same-page anchor before this script sees the click; it leaves links with a
    // target alone, so the copy can stop the scroll.
    a.setAttribute('target', '_self');
    a.setAttribute('aria-label', LABEL[lang]);
    a.setAttribute('title', LABEL[lang]);
  }
}

// The page address without its query, with the section's id as the hash; the URL parser percent-encodes the id the
// same way the browser does when it follows the anchor, so Korean ids survive a paste.
function sectionUrl(id) {
  const url = new URL(location.origin + location.pathname);
  url.hash = id;
  return url.href;
}

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

async function copyText(text) {
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

let status;
let hideTimer;

function statusRegion() {
  if (status && status.isConnected) return status;
  status = document.createElement('div');
  status.className = 'section-link-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  document.body.appendChild(status);
  return status;
}

function announce(anchor, text) {
  const region = statusRegion();
  const box = anchor.getBoundingClientRect();
  region.style.left = `${Math.max(8, box.left)}px`;
  region.style.top = `${Math.max(8, box.top - 36)}px`;
  region.textContent = text;
  region.classList.add('shown');
  anchor.classList.add('copied');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    region.classList.remove('shown');
    region.textContent = '';
    document.querySelectorAll('a.header-anchor.copied').forEach((a) => a.classList.remove('copied'));
  }, SHOWN_MS);
}

async function copySection(anchor) {
  try {
    const id = anchor.parentElement && anchor.parentElement.id;
    if (!id) return;
    const url = sectionUrl(id);
    try {
      history.replaceState(history.state, '', url);
    } catch {
      // The address bar keeps its old hash; the copy still happens.
    }
    const ok = await copyText(url);
    if (ok) announce(anchor, COPIED[langOf()]);
  } catch {
    // Never break the page over a copy.
  }
}

const anchorOf = (target) => (target instanceof Element ? target.closest(ANCHORS) : null);

export function watchSectionLinks() {
  document.addEventListener(
    'click',
    (event) => {
      const anchor = anchorOf(event.target);
      if (!anchor) return;
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      copySection(anchor);
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== ' ' && event.key !== 'Spacebar') return;
      const anchor = anchorOf(event.target);
      if (!anchor) return;
      event.preventDefault();
      copySection(anchor);
    },
    true,
  );
  let queued = false;
  const run = () => {
    queued = false;
    upgrade(document);
  };
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['lang'] });
  run();
}
