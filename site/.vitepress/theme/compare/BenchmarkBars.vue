<script setup>
// One benchmark as horizontal bars, with its conditions in one line under it.
//
// Usage in Markdown: <BenchmarkBars name="speed" />  (reads charts.speed from ./benchmark.json)
// Data: { charts: { [name]: { placeholder, title: {en, ko}, conditions: {en, ko}, unit, decimals, lowerIsBetter,
//         bars: [{ name: string | {en, ko}, value, highlight }] } } }
// While "placeholder" is true the chart renders only in the dev server, marked as placeholder, and nothing in a build,
// so no made-up number reaches the published site.
import { computed } from 'vue';
import { useData } from 'vitepress';
import DATA from './benchmark.json';
import { langOf } from '../playground/strings.js';

const props = defineProps({ name: { type: String, required: true }, data: { type: Object, default: null } });

const { lang } = useData();
const code = langOf(lang.value);
const data = computed(() => props.data ?? DATA.charts[props.name]);
const shown = computed(() => !data.value.placeholder || import.meta.env.DEV);
const pick = (v) => (v && typeof v === 'object' ? v[code] ?? v.en : v);

const max = computed(() => Math.max(1, ...data.value.bars.map((b) => b.value ?? 0)));
const rows = computed(() =>
  data.value.bars.map((b) => ({
    ...b,
    name: pick(b.name),
    pct: b.value == null ? 100 : Math.max(0.5, (b.value / max.value) * 100),
    label:
      b.value == null
        ? '—'
        : `${b.value.toLocaleString('en-US', { minimumFractionDigits: data.value.decimals ?? 0, maximumFractionDigits: data.value.decimals ?? 3 })} ${data.value.unit}`,
  })),
);
</script>

<template>
  <figure v-if="shown" class="bb" :class="{ 'bb-placeholder': data.placeholder }">
    <figcaption class="bb-title">
      {{ pick(data.title) }}
      <span v-if="data.lowerIsBetter" class="bb-hint">{{ code === 'ko' ? '짧을수록 빠름' : 'lower is faster' }}</span>
    </figcaption>
    <div class="bb-rows">
      <div v-for="r in rows" :key="r.name" class="bb-row" :class="{ 'bb-me': r.highlight }">
        <span class="bb-name">{{ r.name }}</span>
        <span class="bb-track"><span class="bb-bar" :style="{ width: `${r.pct}%` }"></span></span>
        <span class="bb-value">{{ r.label }}</span>
      </div>
    </div>
    <p class="bb-conditions">{{ pick(data.conditions) }}</p>
  </figure>
</template>

<style scoped>
.bb {
  margin: 24px 0;
  padding: 20px;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
}
.bb-placeholder {
  border-style: dashed;
}
.bb-title {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.bb-hint {
  font-size: 13px;
  font-weight: 400;
  color: var(--vp-c-text-2);
}
.bb-rows {
  display: grid;
  gap: 10px;
}
.bb-row {
  display: grid;
  grid-template-columns: minmax(80px, 14rem) minmax(0, 1fr) minmax(64px, auto);
  gap: 12px;
  align-items: center;
  font-size: 14px;
}
/* On a phone the name goes above its bar, so the bar keeps the width. */
@media (max-width: 639px) {
  .bb {
    padding: 16px;
  }
  .bb-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 12px;
  }
  .bb-name {
    grid-column: 1 / -1;
  }
}
.bb-name {
  color: var(--vp-c-text-1);
  overflow-wrap: anywhere;
}
.bb-me .bb-name {
  font-weight: 700;
}
.bb-track {
  height: 14px;
}
.bb-bar {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--vp-c-text-3);
}
.bb-me .bb-bar {
  background: var(--vp-c-brand-1);
}
.bb-placeholder .bb-bar {
  background: repeating-linear-gradient(45deg, var(--vp-c-default-2) 0 6px, transparent 6px 12px);
}
.bb-value {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--vp-c-text-1);
}
.bb-conditions {
  margin: 16px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
</style>
