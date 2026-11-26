<script setup>
// The result of the single HTML page on the Ways to use pages: the same text drawn by the same browser build
// (dist/ursula.global.js, which the site serves), in a frame that follows the site's light and dark switch.
//
// Usage in Markdown: <ArtifactDemo />
import { computed, onMounted, ref } from 'vue';
import { withBase } from 'vitepress';
import { ARTIFACT_SAMPLE } from './artifact-sample.js';
import { useWords } from '../locale.js';

const WORDS = {
  en: { loading: 'Loading the engine…', failed: 'The engine did not load.', label: 'The flowchart of the HTML page above, drawn in this page' },
  ko: { loading: '엔진을 불러오는 중…', failed: '엔진을 불러오지 못했습니다.', label: '위 HTML 페이지의 flowchart를 이 페이지에서 그린 결과' },
};
const w = useWords(WORDS);

const svg = ref('');
// 'loading', 'failed' or '' once drawn; the words follow the page's language.
const state = ref('loading');
const status = computed(() => (state.value ? w.value[state.value] : ''));

/** Loads the browser build the site serves, as the playground does. */
function loadEngine() {
  if (window.ursula) return Promise.resolve(window.ursula);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = withBase('/ursula.global.js');
    script.onload = () => (window.ursula ? resolve(window.ursula) : reject(new Error('no ursula')));
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

onMounted(async () => {
  try {
    const engine = await loadEngine();
    svg.value = engine.render(ARTIFACT_SAMPLE);
    state.value = '';
  } catch {
    state.value = 'failed';
  }
});
</script>

<template>
  <div class="ad-frame ursula-frame" role="img" :aria-label="w.label">
    <p v-if="status" class="ad-status">{{ status }}</p>
    <div v-else class="ad-svg" v-html="svg" />
  </div>
</template>

<style scoped>
.ad-frame {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--ursula-surface);
  overflow-x: auto;
}
.ad-svg :deep(svg) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
.ad-status {
  margin: 0;
  color: var(--vp-c-text-2);
}
</style>
