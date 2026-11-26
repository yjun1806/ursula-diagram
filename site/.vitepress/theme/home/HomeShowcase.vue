<script setup>
// The home page's first drawing: the Mermaid text, and the SVG and the terminal text ursula draws from it, both drawn at
// build time by scripts/render-home.mjs (public/assets/hero.svg and outputs.json).
import { computed } from 'vue';
import { withBase } from 'vitepress';
import { HOME_STRINGS } from './strings.js';
import { SOURCE } from './sample.js';
import OUTPUTS from './outputs.json';
import { localPath, useLang, useWords } from '../locale.js';
import CodeBlock from './CodeBlock.vue';

const code = useLang();
const t = useWords(HOME_STRINGS, code);
const playground = computed(() => localPath(code.value, '/playground'));
const TEXT_WIDE = OUTPUTS.terminal.wide;
const TEXT_NARROW = OUTPUTS.terminal.narrow;
const alt = useWords({ en: 'The same flowchart drawn by ursula as SVG', ko: '같은 flowchart를 ursula가 SVG로 그린 그림' }, code);
</script>

<template>
  <section class="hs">
    <div class="hs-grid">
      <figure class="hs-panel hs-in">
        <figcaption>
          <span class="hs-label">{{ t.input }}</span>
          <code>order.mmd</code>
        </figcaption>
        <CodeBlock class="hs-code" lang="mermaid" :text="SOURCE" />
      </figure>

      <div class="hs-out">
        <figure class="hs-panel">
          <figcaption>
            <span class="hs-label">{{ t.svg }}</span>
            <code>--format svg</code>
          </figcaption>
          <div class="hs-svg ursula-frame">
            <img :src="withBase('/assets/hero.svg')" :alt="alt" width="976" height="192" />
          </div>
        </figure>

        <figure class="hs-panel hs-term">
          <figcaption>
            <span class="hs-label">{{ t.terminal }}</span>
            <code class="hs-wide">--format text --width {{ TEXT_WIDE.width }}</code>
            <code class="hs-narrow">--format text --width {{ TEXT_NARROW.width }}</code>
          </figcaption>
          <CodeBlock class="hs-code hs-wide" dark :text="TEXT_WIDE.text" />
          <CodeBlock class="hs-code hs-narrow" dark :text="TEXT_NARROW.text" />
        </figure>
      </div>
    </div>
    <p class="hs-foot">
      {{ t.sameText }}
      <a :href="playground">{{ t.tryIt }} →</a>
    </p>
  </section>
</template>

<style scoped>
.hs {
  padding: 0 24px 16px;
}
.hs > * {
  max-width: 1152px;
  margin-left: auto;
  margin-right: auto;
}
@media (min-width: 640px) {
  .hs {
    padding: 0 48px 24px;
  }
}
@media (min-width: 960px) {
  .hs {
    padding: 0 64px 24px;
  }
}
.hs-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}
@media (min-width: 960px) {
  .hs-grid {
    grid-template-columns: minmax(0, 6fr) minmax(0, 11fr);
    align-items: start;
  }
}
.hs-out {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.hs-panel {
  margin: 0;
  min-width: 0;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg);
}
.hs-panel figcaption {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
  font-size: 14px;
}
.hs-label {
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.hs-panel figcaption code {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.hs-code {
  font-size: 13px;
  line-height: 1.5;
  color: var(--vp-c-text-1);
}
.hs-in .hs-code {
  --cblock-bg: var(--vp-c-bg-alt);
}
.hs-in figcaption {
  background: var(--vp-c-bg-soft);
}
.hs-svg {
  padding: 16px;
  background: var(--ursula-surface);
}
.hs-svg img {
  display: block;
  width: 100%;
  height: auto;
}
/* The terminal panel stays dark in both themes, as a terminal usually is. */
.hs-term {
  border-color: #2c2b2a;
  background: #171614;
}
.hs-term figcaption {
  border-bottom-color: #2c2b2a;
  background: #1e1d1b;
}
.hs-term .hs-label {
  color: #efeeec;
}
.hs-term figcaption code {
  color: #b2b1af;
}
.hs-term .hs-code {
  line-height: 1.25;
  color: #efeeec;
}
.hs-narrow {
  display: none;
}
@media (max-width: 639px) {
  .hs-wide {
    display: none;
  }
  .hs-narrow {
    display: block;
  }
  .hs-panel figcaption code.hs-narrow {
    display: inline;
  }
}
.hs-foot {
  margin-top: 16px;
  margin-bottom: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.hs-foot a {
  font-weight: 600;
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
