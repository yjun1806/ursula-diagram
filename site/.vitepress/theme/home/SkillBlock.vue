<script setup>
// The first thing under the hero: the time per drawing of the ursula skill next to a skill that has the model lay out
// the drawing, where that time went, and the drawings both made from the same three texts, so the speed is never shown
// without the result.
import { useData, withBase } from 'vitepress';
import { HOME_STRINGS } from './strings.js';
import { MEASURE, MEASURE_SCALE } from './agents.js';
import { langOf } from '../playground/strings.js';
import PicGrid from '../compare/PicGrid.vue';

const { lang } = useData();
const code = langOf(lang.value);
const t = HOME_STRINGS[code];
const comparePage = withBase(`${code === 'ko' ? '/ko' : ''}/guide/compared`);

const rows = MEASURE.map((m, i) => ({
  ...m,
  name: t.measureRows[i],
  command: t.split.command[i],
  low: `${(m.seconds[0] / MEASURE_SCALE) * 100}%`,
  high: `${(m.seconds[1] / MEASURE_SCALE) * 100}%`,
}));
</script>

<template>
  <section class="sk">
    <h2>{{ t.measureTitle }}</h2>
    <p class="sk-lead">{{ t.measureHeadline }}</p>
    <div class="sk-bars">
      <div v-for="r in rows" :key="r.name" class="ag-row" :class="{ ours: r.ours }">
        <span class="ag-name">{{ r.name }}</span>
        <span class="ag-track" aria-hidden="true">
          <span class="ag-span" :style="{ width: r.high }"></span>
          <span class="ag-low" :style="{ width: r.low }"></span>
        </span>
        <span class="ag-value"><b>{{ r.seconds[0] }}–{{ r.seconds[1] }} s</b> · {{ r.tokens }} {{ t.tokens }}</span>
        <span class="ag-split">{{ t.split.model }} {{ r.split.model }} s · {{ r.command }} {{ r.split.command }} s · {{ t.split.other }} {{ r.split.other }} s</span>
      </div>
      <p class="sk-note">{{ t.measureLead }} {{ t.measureNote }}</p>
    </div>
    <p class="sk-note">{{ t.measureShown }}</p>
    <PicGrid name="skill" />
    <p class="sk-more"><a :href="comparePage">{{ t.measureMore }} →</a></p>
  </section>
</template>

<style scoped>
.sk {
  padding: 8px 24px 40px;
}
.sk > * {
  max-width: 1152px;
  margin-left: auto;
  margin-right: auto;
}
@media (min-width: 640px) {
  .sk {
    padding: 8px 48px 48px;
  }
}
@media (min-width: 960px) {
  .sk {
    padding: 8px 64px 48px;
  }
}
.sk h2 {
  margin-top: 0;
  margin-bottom: 8px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--vp-c-text-1);
}
.sk-lead {
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 17px;
  line-height: 1.6;
  color: var(--vp-c-text-1);
}
.sk-bars {
  margin-bottom: 16px;
  padding: 18px 20px 14px;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg-alt);
}
.sk-note {
  margin-top: 4px;
  margin-bottom: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.sk-more {
  margin-top: 8px;
  margin-bottom: 0;
  font-size: 15px;
}
.sk-more a {
  font-weight: 600;
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 3px;
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
    grid-template-columns: 330px minmax(0, 1fr) 250px;
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
/* Where the seconds went, under the bar. */
.ag-split {
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
@media (min-width: 768px) {
  .ag-split {
    grid-column: 2 / -1;
    margin-top: -10px;
  }
}
</style>
