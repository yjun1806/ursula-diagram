<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { withBase } from 'vitepress';
import { DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH, TABS, clampWidth, decodeState, draw, encodeState } from './draw.js';
import { EXAMPLES } from './examples.js';

const src = ref(EXAMPLES[0].src);
const exampleId = ref(EXAMPLES[0].id);
const tab = ref('svg');
const width = ref(DEFAULT_WIDTH);
const result = ref(null);
const status = ref('Loading the engine…');
const copied = ref(false);

let engine = null;
let drawTimer = 0;
let hashTimer = 0;

const usesWidth = computed(() => tab.value !== 'svg');

/** Loads dist/ursula.global.js, copied into the site at build time. */
function loadEngine() {
  if (window.ursula) return Promise.resolve(window.ursula);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = withBase('/ursula.global.js');
    script.onload = () => (window.ursula ? resolve(window.ursula) : reject(new Error('The engine did not load.')));
    script.onerror = () => reject(new Error('The engine script could not be fetched.'));
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
  result.value = out.svg ? { svg: cleanSvg(out.svg) } : out;
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

async function copyLink() {
  await saveHash();
  try {
    await navigator.clipboard.writeText(location.href);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // Clipboard refused: the link is in the address bar.
  }
}

function pickExample() {
  const found = EXAMPLES.find((e) => e.id === exampleId.value);
  if (found) src.value = found.src;
}

function setWidth(event) {
  width.value = clampWidth(event.target.value);
}

async function readHash() {
  if (!location.hash) return;
  const state = await decodeState(location.hash);
  if (state.src !== undefined) {
    src.value = state.src;
    exampleId.value = EXAMPLES.find((e) => e.src === state.src)?.id ?? '';
  }
  if (state.tab) tab.value = state.tab;
  if (state.width) width.value = state.width;
}

watch([src, tab, width], schedule);

onMounted(async () => {
  await readHash();
  try {
    engine = await loadEngine();
    status.value = '';
    redraw();
  } catch (err) {
    status.value = err.message;
  }
});

onBeforeUnmount(() => {
  clearTimeout(drawTimer);
  clearTimeout(hashTimer);
});
</script>

<template>
  <div class="pg">
    <div class="pg-bar">
      <label class="pg-field">
        <span>Example</span>
        <select v-model="exampleId" @change="pickExample">
          <option v-if="exampleId === ''" value="">Your text</option>
          <option v-for="e in EXAMPLES" :key="e.id" :value="e.id">{{ e.label }}</option>
        </select>
      </label>
      <label class="pg-field" :class="{ 'pg-off': !usesWidth }" title="Terminal columns, for the text outputs">
        <span>Width</span>
        <input type="range" :min="MIN_WIDTH" :max="MAX_WIDTH" :value="width" :disabled="!usesWidth" @input="setWidth" />
        <input class="pg-num" type="number" :min="MIN_WIDTH" :max="MAX_WIDTH" :value="width" :disabled="!usesWidth" @change="setWidth" />
      </label>
      <button class="pg-button" type="button" @click="copyLink">{{ copied ? 'Link copied' : 'Copy link' }}</button>
    </div>

    <div class="pg-panes">
      <div class="pg-pane">
        <textarea
          v-model="src"
          class="pg-input"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          aria-label="Mermaid text"
          @input="exampleId = ''"
        ></textarea>
      </div>

      <div class="pg-pane">
        <div class="pg-tabs" role="tablist">
          <button
            v-for="t in TABS"
            :key="t.id"
            type="button"
            role="tab"
            :aria-selected="tab === t.id"
            :class="{ active: tab === t.id }"
            @click="tab = t.id"
          >
            {{ t.label }}
          </button>
        </div>

        <div class="pg-out ursula-frame" role="tabpanel">
          <p v-if="status" class="pg-status">{{ status }}</p>
          <pre v-else-if="result && result.error" class="pg-error">{{ result.error }}</pre>
          <div v-else-if="result && result.svg" class="pg-svg" v-html="result.svg"></div>
          <pre v-else-if="result && result.lines" class="pg-text"><template v-for="(line, i) in result.lines" :key="i"><span v-for="(s, j) in line" :key="j" :class="`tone-${s.tone}`">{{ s.text }}</span>{{ '\n' }}</template></pre>
        </div>
        <p v-if="tab === 'text' || tab === 'ascii'" class="pg-note">
          A text drawing keeps its columns only where every character is as wide as the engine counts it. A browser
          font often draws Korean, Chinese or Japanese characters and some arrowheads at another width; the
          <a href="#" @click.prevent="tab = 'text-svg'">text-svg</a> tab draws the same drawing with fixed columns.
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
.pg-button {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 14px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
}
.pg-button:hover {
  border-color: var(--vp-c-brand-1);
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
  font-size: 13px;
  line-height: 1.5;
  background: var(--vp-c-bg-soft);
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
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'D2Coding', 'Noto Sans Mono CJK KR', monospace;
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
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.pg-status {
  margin: 0;
  color: var(--vp-c-text-2);
}
</style>
