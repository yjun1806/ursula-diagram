<script setup>
// The home page's case for agents: what the command does for an agent, each with the command and what it prints,
// and the measured time per drawing next to a skill that has the model lay out the drawing.
import { useData, withBase } from 'vitepress';
import { HOME_STRINGS } from './strings.js';
import { CARDS, MEASURE, MEASURE_SCALE } from './agents.js';
import { langOf } from '../playground/strings.js';
import CopyButton from './CopyButton.vue';

const { lang } = useData();
const code = langOf(lang.value);
const t = HOME_STRINGS[code];
const prefix = code === 'ko' ? '/ko' : '';
const skillPage = withBase(`${prefix}/guide/agent-skill`);
const comparePage = withBase(`${prefix}/guide/compared`);

const cards = CARDS.map((c, i) => ({ ...c, step: i + 1, title: t.cards[c.id][0], body: t.cards[c.id][1] }));
const loopSrc = withBase(`/assets/${code === 'ko' ? 'ko-' : ''}loop.svg`);
const rows = MEASURE.map((m, i) => ({
  ...m,
  name: t.measureRows[i],
  low: `${(m.seconds[0] / MEASURE_SCALE) * 100}%`,
  high: `${(m.seconds[1] / MEASURE_SCALE) * 100}%`,
}));
</script>

<template>
  <section class="ag">
    <h2 class="ag-title">{{ t.agentsTitle }}</h2>
    <p class="ag-lead">{{ t.agentsLead }}</p>
    <div class="ag-loop ursula-frame">
      <img :src="loopSrc" :alt="t.loopAlt" loading="lazy" />
    </div>

    <div class="ag-grid">
      <article v-for="c in cards" :key="c.id" class="ag-card" :class="{ featured: c.featured }">
        <h3><span class="ag-step">{{ c.step }}</span>{{ c.title }}</h3>
        <p>{{ c.body }}</p>
        <div class="ag-code">
          <div v-for="cmd in c.commands" :key="cmd" class="ag-cmd">
            <code><span class="ag-prompt" aria-hidden="true">$ </span>{{ cmd }}</code>
            <CopyButton :text="cmd" />
          </div>
          <pre v-if="c.output"><code>{{ c.output }}</code></pre>
          <p v-if="c.exit" class="ag-exit">{{ t.exitCode }} {{ c.exit }}</p>
        </div>
      </article>
    </div>
    <p class="ag-more"><a :href="skillPage">{{ t.agentsMore }} →</a></p>

    <figure class="ag-measure">
      <figcaption>
        <h3>{{ t.measureTitle }}</h3>
        <p>{{ t.measureLead }}</p>
      </figcaption>
      <div v-for="r in rows" :key="r.name" class="ag-row" :class="{ ours: r.ours }">
        <span class="ag-name">{{ r.name }}</span>
        <span class="ag-track" aria-hidden="true">
          <span class="ag-span" :style="{ width: r.high }"></span>
          <span class="ag-low" :style="{ width: r.low }"></span>
        </span>
        <span class="ag-value"><b>{{ r.seconds[0] }}–{{ r.seconds[1] }} s</b> · {{ r.tokens }} {{ t.tokens }}</span>
      </div>
      <p class="ag-note">{{ t.measureNote }}</p>
      <p class="ag-more"><a :href="comparePage">{{ t.measureMore }} →</a></p>
    </figure>
  </section>
</template>

<style scoped>
.ag {
  padding-top: 8px;
}
.ag-title {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
  margin-bottom: 8px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--vp-c-text-1);
}
.ag-lead {
  max-width: 72ch;
  margin: 0 0 20px;
  font-size: 16px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}
.ag-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}
@media (min-width: 768px) {
  .ag-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
}
.ag-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 18px 18px 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg);
}
.ag-loop {
  margin: 0 0 20px;
  padding: 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--ursula-surface);
}
.ag-loop img {
  display: block;
  width: 100%;
  max-width: 760px;
  height: auto;
  margin: 0 auto;
}
.ag-card.featured {
  border-color: var(--vp-c-brand-1);
  box-shadow: inset 4px 0 0 var(--vp-c-brand-1);
}
.ag-card.featured > p {
  color: var(--vp-c-text-1);
}
.ag-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 700;
  vertical-align: 1px;
}
.ag-cmd + .ag-cmd {
  border-top: 1px solid var(--vp-c-divider);
}
.ag-card h3 {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--vp-c-text-1);
}
.ag-card > p {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.ag-code {
  margin-top: auto;
  min-width: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  background: var(--vp-c-bg-alt);
}
.ag-cmd {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 6px 12px;
}
.ag-cmd code {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  color: var(--vp-c-text-1);
}
.ag-prompt {
  color: var(--vp-c-text-3);
  user-select: none;
}
.ag-code pre {
  margin: 0;
  padding: 10px 12px;
  border-top: 1px solid var(--vp-c-divider);
  overflow-x: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
.ag-exit {
  margin: 0;
  padding: 0 12px 10px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.ag-more {
  margin: 16px 0 0;
  font-size: 15px;
}
.ag-more a {
  font-weight: 600;
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.ag-measure {
  margin: 40px 0 0;
  padding: 20px;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg-alt);
}
.ag-measure figcaption h3 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}
.ag-measure figcaption p {
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.ag-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  margin-bottom: 14px;
  font-size: 14px;
}
@media (min-width: 768px) {
  .ag-row {
    grid-template-columns: 220px minmax(0, 1fr) 220px;
    align-items: center;
    gap: 16px;
  }
}
.ag-name {
  color: var(--vp-c-text-1);
  font-weight: 600;
}
.ag-track {
  position: relative;
  height: 14px;
  border-radius: 7px;
  background: var(--vp-c-bg);
}
.ag-span,
.ag-low {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 7px;
}
/* The light part runs to the slowest run, the solid part to the fastest. */
.ag-span {
  background: var(--vp-c-gray-1);
  opacity: 0.45;
}
.ag-low {
  background: var(--vp-c-gray-1);
}
.ours .ag-span {
  background: var(--vp-c-brand-1);
  opacity: 0.4;
}
.ours .ag-low {
  background: var(--vp-c-brand-1);
}
.ag-value {
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}
.ag-value b {
  color: var(--vp-c-text-1);
}
.ag-note {
  max-width: 72ch;
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
</style>
