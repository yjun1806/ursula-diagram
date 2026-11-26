// Switches the language with the nav menu on the built site, in headless Chrome, and checks that each page shows the
// other language at once, without a reload: the page's text after the switch must match a fresh load of the same page.
// Also checks that the menu stores the choice the redirect in the page head reads.
// Run after `npm run build`. Chrome is found at CHROME_PATH or in the usual places.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = '/ursula-diagram/';
// A page of each kind: home (its sections stay mounted across the switch), a guide page, the examples index, a type
// page, the playground, the charts of the comparison, the roadmap, the changelog, the colour table and the demo.
const PAGES = ['', 'guide/why', 'examples/', 'examples/flowchart', 'playground', 'guide/compared', 'roadmap', 'changelog', 'guide/colours', 'guide/use-cases'];
const SWITCHES = [
  { from: '', to: 'ko/', label: '한국어', lang: 'ko' },
  { from: 'ko/', to: '', label: 'English', lang: 'en' },
];
const SETTLE_MS = 3000;

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(site, '.vitepress', 'dist');
if (!existsSync(dist)) {
  console.log('skip language switch: no build in .vitepress/dist (run npm run build first)');
  process.exit(0);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const path of candidates) if (existsSync(path)) return path;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = spawnSync('which', [name], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  return null;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };

/** Serves the build under the site's base, with clean URLs as GitHub Pages does. */
function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!path.startsWith(BASE)) return void res.writeHead(404).end();
    let file = normalize(join(dist, path.slice(BASE.length)));
    if (!file.startsWith(dist)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(chrome) {
  const profile = mkdtempSync(join(tmpdir(), 'ursula-lang-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1400,900', '--lang=en-US', 'about:blank'];
  if (process.platform === 'linux') args.unshift('--no-sandbox');
  const proc = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let err = '';
    const timer = setTimeout(() => reject(new Error(`Chrome did not start: ${err.slice(-400)}`)), 20000);
    proc.stderr.on('data', (d) => {
      err += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on('exit', () => reject(new Error(`Chrome exited: ${err.slice(-400)}`)));
  });
  const close = () => {
    proc.kill();
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  };
  return { wsUrl, close };
}

/** A minimal DevTools client for one page target. */
async function connect(wsUrl) {
  const http = wsUrl.replace(/^ws:\/\/([^/]+).*/, 'http://$1');
  const target = await (await fetch(`${http}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else if (m.method) {
      const rest = [];
      for (const w of waiters.splice(0)) (w.method === m.method ? w.resolve(m) : rest.push(w));
      waiters.push(...rest);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id;
      pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const once = (method) => new Promise((resolve) => waiters.push({ method, resolve }));
  const evaluate = async (expression) => {
    const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (m.error || m.result?.exceptionDetails) throw new Error(JSON.stringify(m.error ?? m.result.exceptionDetails));
    return m.result.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  const go = async (url) => {
    const loaded = once('Page.loadEventFired');
    await send('Page.navigate', { url });
    await loaded;
    // The theme's components mount after the load event; wait until the content is in.
    for (let i = 0; i < 50 && !(await evaluate(`!!document.querySelector('.VPContent')`)); i++) await sleep(100);
    await sleep(600);
  };
  return { evaluate, go, close: () => ws.close() };
}

const SNAPSHOT = `(() => ({
  path: location.pathname,
  lang: document.documentElement.lang,
  heading: (document.querySelector('.VPContent h1')?.textContent ?? '').replace(/\\s+/g, ' ').trim(),
  text: (document.querySelector('.VPContent')?.innerText ?? '').replace(/\\s+/g, ' ').trim(),
  // Words and pictures that are not text: picture files and their alt, the labels screen readers hear, link targets.
  attrs: [...document.querySelectorAll('.VPContent :is(img, [aria-label], a[href])')]
    .map((e) => [e.getAttribute('src'), e.getAttribute('alt'), e.getAttribute('aria-label'), e.getAttribute('href')].join('|'))
    .join('\\n'),
  stored: (() => { try { return localStorage.getItem('ursula-lang'); } catch { return null; } })(),
  same: window.__ursulaSameDocument === true,
}))()`;

const clickMenu = (label) => `(() => {
  window.__ursulaSameDocument = true;
  const link = [...document.querySelectorAll('.VPNavBarTranslations a, .VPNavBarExtra .translations a')]
    .find((a) => a.textContent.trim() === ${JSON.stringify(label)});
  if (!link) return false;
  link.click();
  return true;
})()`;

/** The first words of `fresh` that `shown` lacks, to say what stayed in the old language. */
function missingWords(shown, fresh) {
  const have = new Set(shown.split(' '));
  return fresh.split(' ').filter((w) => !have.has(w)).slice(0, 8).join(' ');
}

/** The first line of `fresh` that `shown` lacks. */
function firstDiff(shown, fresh) {
  const have = new Set(shown.split('\n'));
  return fresh.split('\n').find((line) => !have.has(line)) ?? '(order)';
}

const chrome = findChrome();
if (!chrome) {
  console.error('FAIL language switch: no Chrome found; set CHROME_PATH');
  process.exit(1);
}

const server = await serve();
const root = `http://127.0.0.1:${server.address().port}${BASE}`;
const browser = await launch(chrome);
let failed = 0;
const fail = (message) => {
  failed++;
  console.error(`FAIL ${message}`);
};

try {
  const page = await connect(browser.wsUrl);
  for (const path of PAGES) {
    for (const s of SWITCHES) {
      const name = `${s.from}${path || '(home)'} → ${s.label}`;
      // The stored choice is the page's own language, so the redirect in the head leaves the start page alone.
      const startPath = `${BASE}${s.from}${path}`;
      await page.go(`${root}${s.from}${path}`);
      await page.evaluate(`localStorage.setItem('ursula-lang', ${JSON.stringify(s.lang === 'ko' ? 'en' : 'ko')})`);
      // A browser that puts Korean first was sent to /ko/ before the choice was stored; load the start page again.
      if ((await page.evaluate('location.pathname')) !== startPath) await page.go(`${root}${s.from}${path}`);
      if (!(await page.evaluate(clickMenu(s.label)))) {
        fail(`${name}: no "${s.label}" link in the language menu`);
        continue;
      }
      const target = `${BASE}${s.to}${path}`;
      // Wait for the router to reach the other page, then give the components a second to follow.
      const start = Date.now();
      while ((await page.evaluate('location.pathname')) !== target && Date.now() - start < SETTLE_MS) await sleep(100);
      await sleep(1000);
      const shown = await page.evaluate(SNAPSHOT);
      // The reference: what a fresh load of the same page shows.
      await page.go(`${root}${s.to}${path}`);
      const fresh = await page.evaluate(SNAPSHOT);

      if (shown.path !== target) fail(`${name}: the menu went to ${shown.path}, not ${target}`);
      else if (!shown.same) fail(`${name}: the page reloaded instead of switching in place`);
      else if (shown.stored !== s.lang) fail(`${name}: the menu stored ${shown.stored}, not ${s.lang}`);
      else if (shown.lang !== fresh.lang) fail(`${name}: <html lang> is ${shown.lang}, a fresh load has ${fresh.lang}`);
      else if (shown.heading !== fresh.heading) fail(`${name}: the heading is "${shown.heading}", a fresh load shows "${fresh.heading}"`);
      else if (shown.text !== fresh.text) fail(`${name}: the text differs from a fresh load; still missing: ${missingWords(shown.text, fresh.text)}`);
      else if (shown.attrs !== fresh.attrs) fail(`${name}: a picture, label or link differs from a fresh load: ${firstDiff(shown.attrs, fresh.attrs)}`)
      else console.log(`ok   ${name}: "${shown.heading.slice(0, 40)}" without a reload, same text as a fresh load`);
    }
  }
  page.close();
} finally {
  browser.close();
  server.close();
}

if (failed) {
  console.error(`${failed} language switches failed`);
  process.exit(1);
}
