<script setup>
// The enlarged picture, for every page: a click on a .ex-zoom button (the Examples pages, the picture grids) opens its
// <img> large in a dialog, fitted to the screen, with a button for the full size. A button with data-light shows the
// picture on a light panel in both themes, as the grids do, so pictures by other tools look as they were drawn.
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useData } from 'vitepress';
import { langOf } from '../playground/strings.js';

const T = {
  en: { dialog: 'Enlarged picture', close: 'Close', fit: 'Fit to screen', full: 'Full size' },
  ko: { dialog: '크게 본 그림', close: '닫기', fit: '화면에 맞추기', full: '원래 크기' },
};

const { lang } = useData();
const t = computed(() => T[langOf(lang.value)]);

const dialog = ref(null);
const shown = ref(null); // { src, alt, width, height, light }
const full = ref(false);
let opener = null;

async function openPicture(button) {
  const img = button.querySelector('img');
  if (!img) return;
  opener = button;
  full.value = false;
  shown.value = {
    src: img.currentSrc || img.src,
    alt: img.alt,
    width: Number(img.getAttribute('width')),
    height: Number(img.getAttribute('height')),
    light: button.hasAttribute('data-light'),
  };
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

function onClick(event) {
  const el = event.target instanceof Element ? event.target : null;
  const zoom = el?.closest('.ex-zoom');
  if (zoom) openPicture(zoom);
}

onMounted(() => document.addEventListener('click', onClick));
onUnmounted(() => document.removeEventListener('click', onClick));
</script>

<template>
  <dialog ref="dialog" class="ex-lightbox" :aria-label="t.dialog" @close="onClosed" @click="onDialogClick">
    <template v-if="shown">
      <div class="ex-lightbox-bar">
        <button type="button" class="ex-lightbox-button" :aria-pressed="String(full)" @click="full = !full">{{ full ? t.fit : t.full }}</button>
        <button type="button" class="ex-lightbox-button" @click="closePicture">{{ t.close }}</button>
      </div>
      <div class="ex-lightbox-stage" :class="{ full }">
        <div class="ex-lightbox-frame" :class="shown.light ? 'ex-lightbox-light' : 'ursula-frame'">
          <img :src="shown.src" :alt="shown.alt" :width="shown.width" :height="shown.height" :style="{ '--ratio': shown.width / shown.height, '--natural': `${shown.width}px` }" />
        </div>
      </div>
    </template>
  </dialog>
</template>
