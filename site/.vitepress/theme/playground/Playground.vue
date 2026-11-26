<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { withBase } from 'vitepress';
import { DEFAULT_WIDTH, FILES, MAX_WIDTH, MIN_WIDTH, TABS, clampWidth, copyText as outputText, decodeState, draw, encodeState } from './draw.js';
import { canCopyImage, copyImage, copyText, download } from './clipboard.js';
import { examplesFor } from './examples.js';
import { STRINGS } from './strings.js';
import { useLang, useWords } from '../locale.js';

const code = useLang();
const t = useWords(STRINGS, code);
const examples = computed(() => examplesFor(code.value));

const src = ref(examples.value[0].src);
const exampleId = ref(examples.value[0].id);
const tab = ref('svg');
const width = ref(DEFAULT_WIDTH);
const result = ref(null);
const loading = ref(true);
const loadError = ref('');
/** What stands in the output box instead of a drawing: the loading words, an engine error, or '' once it draws. */
const status = computed(() => (loading.value ? t.value.loading : loadError.value));
const outEl = ref(null);
const imageCopy = ref(false);
/** The last action's word ("Copied") and which button it belongs to, shown beside the buttons and read out. */
const notice = ref({ key: '', text: '' });
let noticeTimer = 0;

let engine = null;
let drawTimer = 0;
let hashTimer = 0;

const usesWidth = computed(() => tab.value !== 'svg');

/** What the output buttons hand over: the engine's own output for this tab, or null while there is none. */
const payload = computed(() => (status.value ? null : outputText(result.value)));
const isSvg = computed(() => tab.value === 'svg' || tab.value === 'text-svg');
const outputError = computed(() => !status.value && !!result.value?.error);

/** Loads dist/ursula.global.js, copied into the site at build time. */
function loadEngine() {
  if (window.ursula) return Promise.resolve(window.ursula);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = withBase('/ursula.global.js');
    script.onload = () => (window.ursula ? resolve(window.ursula) : reject(new Error(t.value.engineMissing)));
    script.onerror = () => reject(new Error(t.value.engineFetch));
    document.head.appendChild(script);
  });
}

/** Drops anything in an SVG that could run code. The engine escapes text, so this is a second guard. */
function cleanSvg(svg) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return svg.replace(/<script[\s\S]*?<\/script>/gi, '');
  for (const el of doc.querySelectorAll('script, foreignObject, iframe, object, embed')) el.remove();
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const isLink = name === 'href' || name.endsWith(':href');
      if (name.startsWith('on') || (isLink && /^\s*(javascript|data):/i.test(attr.value))) el.removeAttribute(attr.name);
    }
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function redraw() {
  if (!engine) return;
  const out = draw(engine, src.value, tab.value, width.value);
  // `shown` is what the page draws; `svg` stays as the engine returned it, for the copy and download buttons.
  result.value = out.svg ? { svg: out.svg, shown: cleanSvg(out.svg) } : out;
}

function schedule() {
  clearTimeout(drawTimer);
  drawTimer = setTimeout(redraw, 150);
  clearTimeout(hashTimer);
  hashTimer = setTimeout(saveHash, 600);
}

async function saveHash() {
  const hash = await encodeState({ src: src.value, tab: tab.value, width: width.value });
  history.replaceState(history.state, '', `#${hash}`);
}

function say(key, text) {
  clearTimeout(noticeTimer);
  notice.value = { key, text };
  noticeTimer = setTimeout(() => (notice.value = { key: '', text: '' }), 1800);
}

async function copyLink() {
  await saveHash();
  // If the clipboard refuses, the link is still in the address bar.
  say('link', (await copyText(location.href)) ? t.value.copied : t.value.failed);
}

async function copyMermaid() {
  say('mermaid', (await copyText(src.value)) ? t.value.done : t.value.failed);
}

async function copyOutput() {
  if (payload.value === null) return;
  say('output', (await copyText(payload.value)) ? t.value.done : t.value.failed);
}

async function copyOutputImage() {
  if (payload.value === null || !outEl.value) return;
  say('image', (await copyImage(payload.value, outEl.value)) ? t.value.done : t.value.failed);
}

function downloadOutput() {
  if (payload.value === null) return;
  download(isSvg.value ? payload.value : `${payload.value}\n`, FILES[tab.value]);
  say('download', t.value.saved);
}

function pickExample() {
  const found = examples.value.find((e) => e.id === exampleId.value);
  if (found) src.value = found.src;
}

function setWidth(event) {
  width.value = clampWidth(event.target.value);
}

/** The hash to start from: the address, or the drawing carried over by the language menu. */
function startHash() {
  let carried = '';
  try {
    carried = sessionStorage.getItem('ursula-carry-hash') ?? '';
    sessionStorage.removeItem('ursula-carry-hash');
  } catch {
    // No storage: only the address counts.
  }
  return location.hash || carried;
}

async function readHash() {
  const hash = startHash();
  if (!hash) return;
  const state = await decodeState(hash);
  if (state.src !== undefined) {
    src.value = state.src;
    exampleId.value = examples.value.find((e) => e.src === state.src)?.id ?? '';
  }
  if (state.tab) tab.value = state.tab;
  if (state.width) width.value = state.width;
}

watch([src, tab, width], schedule);
// The language changed while the playground stayed on screen: an example follows it, a text of the visitor's own stays.
watch(code, () => {
  const found = examples.value.find((e) => e.id === exampleId.value);
  if (found) src.value = found.src;
});

onMounted(async () => {
  imageCopy.value = canCopyImage();
  await readHash();
  try {
    engine = await loadEngine();
    loading.value = false;
    redraw();
  } catch (err) {
    loading.value = false;
    loadError.value = err.message;
  }
});

onBeforeUnmount(() => {
  clearTimeout(drawTimer);
  clearTimeout(hashTimer);
  clearTimeout(noticeTimer);
});
</script>

<template>
  <div class="pg">
    <div class="pg-bar">
      <label class="pg-field">
        <span>{{ t.example }}</span>
        <select v-model="exampleId" @change="pickExample">
          <option v-if="exampleId === ''" value="">{{ t.yourText }}</option>
          <option v-for="e in examples" :key="e.id" :value="e.id">{{ e.label }}</option>
        </select>
      </label>
      <label class="pg-field" :class="{ 'pg-off': !usesWidth }" :title="t.widthTitle">
        <span>{{ t.width }}</span>
        <input type="range" :min="MIN_WIDTH" :max="MAX_WIDTH" :value="width" :disabled="!usesWidth" @input="setWidth" />
        <input class="pg-num" type="number" :min="MIN_WIDTH" :max="MAX_WIDTH" :value="width" :disabled="!usesWidth" @change="setWidth" />
      </label>
      <div class="pg-actions">
        <button class="pg-copy" :class="{ done: notice.key === 'mermaid' }" type="button" @click="copyMermaid">{{ t.copyMermaid }}</button>
        <button class="pg-copy pg-link" :class="{ done: notice.key === 'link' }" type="button" @click="copyLink">{{ t.copyLink }}</button>
        <span class="pg-notice" role="status" aria-live="polite">{{ notice.key === 'link' || notice.key === 'mermaid' ? notice.text : '' }}</span>
      </div>
    </div>

    <div class="pg-panes">
      <div class="pg-pane">
        <textarea
          v-model="src"
          class="pg-input"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          :aria-label="t.input"
          @input="exampleId = ''"
        ></textarea>
      </div>

      <div class="pg-pane">
        <div class="pg-tabs" role="tablist">
          <button
            v-for="x in TABS"
            :key="x.id"
            type="button"
            role="tab"
            :aria-selected="tab === x.id"
            :class="{ active: tab === x.id }"
            @click="tab = x.id"
          >
            {{ t.tabs[x.id] }}
          </button>
        </div>

        <div class="pg-actions pg-out-actions" role="group" :aria-label="t.actions">
          <button
            class="pg-copy"
            :class="{ done: notice.key === 'output' }"
            type="button"
            :disabled="payload === null"
            :title="outputError ? t.fixFirst : undefined"
            @click="copyOutput"
          >
            {{ isSvg ? t.copySvg : t.copyTextOut }}
          </button>
          <button
            v-if="tab === 'svg' && imageCopy"
            class="pg-copy"
            :class="{ done: notice.key === 'image' }"
            type="button"
            :disabled="payload === null"
            :title="outputError ? t.fixFirst : undefined"
            @click="copyOutputImage"
          >
            {{ t.copyImage }}
          </button>
          <button
            class="pg-copy pg-save"
            :class="{ done: notice.key === 'download' }"
            type="button"
            :disabled="payload === null"
            :title="outputError ? t.fixFirst : undefined"
            @click="downloadOutput"
          >
            {{ isSvg ? t.downloadSvg : t.downloadTxt }}
          </button>
          <span v-if="outputError" class="pg-notice">{{ t.fixFirst }}</span>
          <span class="pg-notice" role="status" aria-live="polite">{{
            ['output', 'image', 'download'].includes(notice.key) ? notice.text : ''
          }}</span>
        </div>

        <div ref="outEl" class="pg-out ursula-frame" role="tabpanel">
          <p v-if="status" class="pg-status">{{ status }}</p>
          <pre v-else-if="result && result.error" class="pg-error">{{ result.error }}</pre>
          <div v-else-if="result && result.svg" class="pg-svg" v-html="result.shown"></div>
          <pre v-else-if="result && result.lines" class="pg-text"><template v-for="(line, i) in result.lines" :key="i"><span v-for="(s, j) in line" :key="j" :class="`tone-${s.tone}`">{{ s.text }}</span>{{ '\n' }}</template></pre>
        </div>
        <p v-if="tab === 'text' || tab === 'ascii'" class="pg-note">
          {{ t.noteBefore }}<a href="#" @click.prevent="tab = 'text-svg'">text-svg</a>{{ t.noteAfter }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pg {
  margin: 24px 0 48px;
}
.pg-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  align-items: center;
  margin-bottom: 12px;
}
.pg-field {
  display: flex;
  min-width: 0;
  max-width: 100%;
  gap: 8px;
  align-items: center;
  font-size: 14px;
  color: var(--vp-c-text-2);
}
.pg-field > span {
  white-space: nowrap;
}
.pg-off {
  opacity: 0.5;
}
.pg-field select {
  min-width: 0;
  flex: 1 1 auto;
}
.pg-field select,
.pg-num {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 4px 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 14px;
  max-width: 100%;
}
.pg-num {
  width: 64px;
}
.pg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-width: 0;
}
.pg-out-actions {
  margin-bottom: 8px;
}
/* The look of VitePress's code block copy button (its colours and copy icon), with the action written beside the icon. */
.pg-copy {
  display: inline-flex;
  align-items: center;
  height: 32px;
  border: 1px solid var(--vp-code-copy-code-border-color);
  border-radius: 4px;
  padding: 0 10px 0 30px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--vp-c-text-1);
  background-color: var(--vp-code-copy-code-bg);
  background-image: var(--vp-icon-copy);
  background-position: 8px 50%;
  background-size: 16px;
  background-repeat: no-repeat;
  cursor: pointer;
  transition:
    border-color 0.25s,
    background-color 0.25s;
}
.pg-copy.pg-link {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='rgba(128,128,128,1)' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'/%3E%3Cpath d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/%3E%3C/svg%3E");
}
.pg-copy.pg-save {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='rgba(128,128,128,1)' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='M12 3v12'/%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3Cpath d='M5 21h14'/%3E%3C/svg%3E");
}
.pg-copy:hover:not(:disabled),
.pg-copy.done {
  border-color: var(--vp-code-copy-code-hover-border-color);
  background-color: var(--vp-code-copy-code-hover-bg);
}
.pg-copy.done {
  background-image: var(--vp-icon-copied);
}
.pg-copy:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}
.pg-copy:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.pg-notice {
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.pg-notice:empty {
  display: none;
}
.pg-panes {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: 16px;
}
@media (max-width: 960px) {
  .pg-panes {
    grid-template-columns: minmax(0, 1fr);
  }
}
.pg-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pg-input {
  flex: 1;
  min-height: 480px;
  width: 100%;
  resize: vertical;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 12px;
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  line-height: 1.6;
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text-1);
  tab-size: 2;
}
.pg-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.pg-tabs button {
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 14px;
  color: var(--vp-c-text-2);
}
.pg-tabs button.active {
  border-color: var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-weight: 600;
}
.pg-out {
  flex: 1;
  min-height: 480px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 16px;
  overflow: auto;
  background: var(--ursula-surface);
}
.pg-svg :deep(svg) {
  max-width: 100%;
  height: auto;
}
.pg-text {
  margin: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.2;
  white-space: pre;
  color: var(--ursula-fg);
}
.tone-dim {
  color: var(--ursula-faint);
}
.tone-bold {
  font-weight: 700;
}
.tone-accent {
  color: var(--ursula-accent);
}
.pg-error {
  margin: 0;
  padding: 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  color: var(--vp-c-danger-1);
  background: var(--vp-c-danger-soft);
}
.pg-note {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.pg-status {
  margin: 0;
  color: var(--vp-c-text-2);
}
</style>
