<script setup>
// The client side of an Examples type page. The items are static HTML written by .vitepress/examples/pages.mjs; this
// component listens on the document for their buttons:
// - the page toggle (rendered here) and each item's "SVG / Terminal" tabs set the item's data-view, which CSS reads;
//   the page choice is kept in localStorage;
// - the copy button of a terminal view copies the plain text from its .txt file;
// - a picture opens large in a dialog, fitted to the screen, with a button for the full size.
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useData, withBase } from 'vitepress';
import { langOf } from '../playground/strings.js';

const KEY = 'ursula-examples-view';
const VIEWS = ['svg', 'term'];

const T = {
  en: {
    show: 'Show every example as',
    svg: 'SVG',
    term: 'Terminal',
    dialog: 'Enlarged picture',
    close: 'Close',
    fit: 'Fit to screen',
    full: 'Full size',
  },
  ko: {
    show: '모든 예시를 이렇게 보기',
    svg: 'SVG',
    term: '터미널',
    dialog: '크게 본 그림',
    close: '닫기',
    fit: '화면에 맞추기',
    full: '원래 크기',
  },
};

const { lang } = useData();
const t = computed(() => T[langOf(lang.value)]);
const pageView = ref('svg');

function readChoice() {
  try {
    const v = localStorage.getItem(KEY);
    return VIEWS.includes(v) ? v : 'svg';
  } catch {
    return 'svg';
  }
}

function saveChoice(view) {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    // Storage may be off (private window); the choice then lasts for this page only.
  }
}

function setItemView(item, view) {
  item.dataset.view = view;
  for (const b of item.querySelectorAll('.ex-tab')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
}

function setPageView(view, save = true) {
  pageView.value = view;
  for (const item of document.querySelectorAll('.ex-item')) setItemView(item, view);
  if (save) saveChoice(view);
}

// --- Copying the terminal text -----------------------------------------------------------------------------------

const timers = new WeakMap();

async function copyFrom(button) {
  const url = withBase(button.dataset.copy);
  const text = () =>
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.text();
    });
  try {
    // A ClipboardItem with a pending blob keeps the click's permission while the file loads (Safari needs this).
    if (typeof ClipboardItem === 'function' && navigator.clipboard?.write) {
      const blob = text().then((s) => new Blob([s], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
    } else {
      await navigator.clipboard.writeText(await text());
    }
  } catch {
    return;
  }
  button.classList.add('copied');
  clearTimeout(timers.get(button));
  timers.set(
    button,
    setTimeout(() => button.classList.remove('copied'), 2000),
  );
}

// --- The enlarged picture ----------------------------------------------------------------------------------------

const dialog = ref(null);
const shown = ref(null); // { src, alt, width, height }
const full = ref(false);
let opener = null;

async function openPicture(button) {
  const img = button.querySelector('img');
  if (!img) return;
  opener = button;
  full.value = false;
  shown.value = { src: img.currentSrc || img.src, alt: img.alt, width: Number(img.getAttribute('width')), height: Number(img.getAttribute('height')) };
  await nextTick();
  dialog.value?.showModal();
}

function closePicture() {
  dialog.value?.close();
}

function onClosed() {
  shown.value = null;
  opener?.focus();
  opener = null;
}

// A click on the backdrop lands on the <dialog> itself or on the empty area around the picture.
function onDialogClick(event) {
  if (event.target === dialog.value || event.target.classList.contains('ex-lightbox-stage')) closePicture();
}

// --- One listener for every item on the page ---------------------------------------------------------------------

function onClick(event) {
  const el = event.target instanceof Element ? event.target : null;
  if (!el) return;
  const tab = el.closest('.ex-tab');
  if (tab) {
    const item = tab.closest('.ex-item');
    if (item) setItemView(item, tab.dataset.view);
    return;
  }
  const copy = el.closest('.ex-copy');
  if (copy) {
    copyFrom(copy);
    return;
  }
  const zoom = el.closest('.ex-zoom');
  if (zoom) openPicture(zoom);
}

onMounted(() => {
  setPageView(readChoice(), false);
  document.addEventListener('click', onClick);
});
onUnmounted(() => document.removeEventListener('click', onClick));
</script>

<template>
  <p class="ex-view-toggle">
    <span class="ex-view-label">{{ t.show }}</span>
    <span class="ex-tabs" role="group" :aria-label="t.show">
      <button v-for="v in VIEWS" :key="v" type="button" class="ex-tab ex-page-tab" :aria-pressed="String(pageView === v)" @click.stop="setPageView(v)">
        {{ t[v] }}
      </button>
    </span>
  </p>
  <dialog ref="dialog" class="ex-lightbox" :aria-label="t.dialog" @close="onClosed" @click="onDialogClick">
    <template v-if="shown">
      <div class="ex-lightbox-bar">
        <button type="button" class="ex-lightbox-button" :aria-pressed="String(full)" @click="full = !full">{{ full ? t.fit : t.full }}</button>
        <button type="button" class="ex-lightbox-button" @click="closePicture">{{ t.close }}</button>
      </div>
      <div class="ex-lightbox-stage" :class="{ full }">
        <div class="ex-lightbox-frame ursula-frame">
          <img :src="shown.src" :alt="shown.alt" :width="shown.width" :height="shown.height" :style="{ '--ratio': shown.width / shown.height, '--natural': `${shown.width}px` }" />
        </div>
      </div>
    </template>
  </dialog>
</template>
