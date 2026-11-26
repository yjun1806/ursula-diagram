<script setup>
// Every bar chart on the site: horizontal bars on one shared axis, with the conditions in a caption under them.
//
// Usage in Markdown: <BenchmarkBars name="speed" />  (reads charts.speed from ./benchmark.json)
// Data: { charts: { [name]: { placeholder, title: {en, ko}, conditions: {en, ko}, unit, decimals, lowerIsBetter,
//         ticks: [number], parts: [{ key, name: {en, ko} }],
//         bars: [{ name: string | {en, ko}, value, highlight, range: [low, high], parts: { [key]: number },
//                  sub: {en, ko}, detail: {en, ko} }] } } }
// - value is the bar's length; range, when given, is drawn as a thin line from the fastest to the slowest run.
// - parts splits the bar into segments in the order of the chart's parts, each with its own colour and a legend entry.
// - sub is a second, muted line under the value; detail is the hover text and what a screen reader hears.
// - ticks are the labelled axis values; without them the chart picks round ones that reach past every value.
// While "placeholder" is true the chart renders only in the dev server, marked as placeholder, and nothing in a build,
// so no made-up number reaches the published site.
import { computed } from 'vue';
import { useData } from 'vitepress';
import DATA from './benchmark.json';
import { langOf } from '../playground/strings.js';

const props = defineProps({ name: { type: String, default: null }, data: { type: Object, default: null } });

const WORDS = {
  en: { faster: 'lower is faster', range: 'fastest to slowest run' },
  ko: { faster: '짧을수록 빠름', range: '가장 빠른 판부터 느린 판까지' },
};

const { lang } = useData();
const code = langOf(lang.value);
const w = WORDS[code];
const data = computed(() => props.data ?? DATA.charts[props.name]);
const shown = computed(() => !data.value.placeholder || import.meta.env.DEV);
const pick = (v) => (v && typeof v === 'object' ? v[code] ?? v.en : v);

// Round axis values: the step is 1, 2, 2.5 or 5 times a power of ten, the axis ends at the first tick past the
// largest value, and of the steps that give 2 to 4 intervals the one that leaves the least empty space wins.
function roundTicks(top) {
  let best = null;
  const power = 10 ** Math.floor(Math.log10(top));
  for (const scale of [power / 10, power, power * 10]) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * scale;
      const n = Math.ceil(top / step);
      if (n < 2 || n > 4) continue;
      if (!best || n * step < best.n * best.step) best = { step, n };
    }
  }
  return Array.from({ length: best.n + 1 }, (_, i) => i * best.step);
}

const ticks = computed(() => {
  const highs = data.value.bars.flatMap((b) => [b.value ?? 0, b.range?.[1] ?? 0]);
  return data.value.ticks ?? roundTicks(Math.max(1, ...highs));
});
const axisMax = computed(() => ticks.value[ticks.value.length - 1]);
const pct = (v) => `${Math.min(100, (v / axisMax.value) * 100)}%`;
const number = (v, decimals) =>
  v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const parts = computed(() => (data.value.parts ?? []).map((p) => ({ ...p, name: pick(p.name) })));
const hasRange = computed(() => data.value.bars.some((b) => b.range));

const rows = computed(() => {
  const d = data.value;
  const decimals = d.decimals ?? 0;
  return d.bars.map((b) => {
    const total = b.value ?? 0;
    const segments = b.parts
      ? parts.value.map((p) => ({ key: p.key, width: `${((b.parts[p.key] ?? 0) / total) * 100}%` }))
      : [{ key: 'whole', width: '100%' }];
    const range = b.range ? ` (${number(b.range[0], decimals)}–${number(b.range[1], decimals)})` : '';
    return {
      name: pick(b.name),
      highlight: b.highlight,
      width: b.value == null ? '0%' : pct(total),
      segments,
      range: b.range && { left: pct(b.range[0]), width: `calc(${pct(b.range[1])} - ${pct(b.range[0])})` },
      label: b.value == null ? '—' : `${number(b.value, decimals)} ${d.unit}${range}`,
      sub: pick(b.sub),
      detail: pick(b.detail),
    };
  });
});

const tickLabels = computed(() =>
  ticks.value.map((t, i) => ({
    left: pct(t),
    text: i === ticks.value.length - 1 ? `${number(t, 0)} ${data.value.unit}` : number(t, 0),
    edge: i === 0 ? 'first' : i === ticks.value.length - 1 ? 'last' : '',
  })),
);
</script>

<template>
  <figure v-if="shown" class="bb" :class="{ 'bb-placeholder': data.placeholder }">
    <div v-if="data.title" class="bb-title">
      {{ pick(data.title) }}
      <span v-if="data.lowerIsBetter" class="bb-hint">{{ w.faster }}</span>
    </div>
    <ul v-if="parts.length || hasRange" class="bb-legend">
      <li v-for="(p, i) in parts" :key="p.key">
        <span class="bb-swatch" aria-hidden="true">
          <span :class="['bb-seg', 'bb-ours', `bb-part-${i}`]"></span><span :class="['bb-seg', `bb-part-${i}`]"></span>
        </span>
        {{ p.name }}
      </li>
      <li v-if="hasRange"><span class="bb-key-range" aria-hidden="true"></span>{{ w.range }}</li>
    </ul>
    <div class="bb-grid">
      <div v-for="r in rows" :key="r.name" class="bb-row" :class="{ 'bb-me': r.highlight }">
        <span class="bb-name">{{ r.name }}</span>
        <span class="bb-value">
          <span class="bb-main">{{ r.label }}</span>
          <span v-if="r.sub" class="bb-sub">{{ r.sub }}</span>
          <span v-if="r.detail" class="visually-hidden">{{ r.detail }}</span>
        </span>
        <span class="bb-plot" :title="r.detail" aria-hidden="true">
          <span v-for="t in tickLabels" :key="t.left" class="bb-gridline" :style="{ left: t.left }"></span>
          <span class="bb-bar" :style="{ width: r.width }">
            <span
              v-for="(s, i) in r.segments"
              :key="s.key"
              :class="['bb-seg', `bb-part-${i}`, { 'bb-ours': r.highlight }]"
              :style="{ width: s.width }"
            ></span>
          </span>
          <span v-if="r.range" class="bb-range" :style="{ left: r.range.left, width: r.range.width }"></span>
        </span>
      </div>
      <div class="bb-row bb-axis" aria-hidden="true">
        <span class="bb-name"></span>
        <span class="bb-value"></span>
        <span class="bb-plot">
          <span v-for="t in tickLabels" :key="t.left" class="bb-tick" :class="t.edge" :style="{ left: t.left }">{{ t.text }}</span>
        </span>
      </div>
    </div>
    <figcaption class="bb-conditions">{{ pick(data.conditions) }}</figcaption>
  </figure>
</template>

<style scoped>
/* Two steps per row: the first part (or a whole bar) and the second part. ursula's rows wear the site accent, the
   others a grey; every step keeps 3:1 against the page, and each pair and the two first steps stay apart for
   colour-blind readers too (checked with an OKLab colour-difference test in light and dark). */
.bb {
  --bb-ours-0: #82641c;
  --bb-ours-1: #4f3c0f;
  --bb-other-0: #868990;
  --bb-other-1: #46484d;
  margin: 24px 0;
  padding: 20px;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
}
.dark .bb {
  --bb-ours-0: #dab975;
  --bb-ours-1: #9a7a35;
  --bb-other-0: #99968f;
  --bb-other-1: #6a6864;
}
.bb-placeholder {
  border-style: dashed;
}
.bb-title {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
  margin-bottom: 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.bb-hint {
  font-size: 13px;
  font-weight: 400;
  color: var(--vp-c-text-2);
}
.bb-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.bb-legend li {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}
.bb-swatch {
  display: inline-flex;
  gap: 2px;
}
.bb-swatch .bb-seg {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
.bb-key-range {
  position: relative;
  box-sizing: border-box;
  width: 20px;
  height: 10px;
  border-left: 2px solid var(--vp-c-text-1);
  border-right: 2px solid var(--vp-c-text-1);
}
.bb-key-range::after {
  content: '';
  position: absolute;
  top: 4px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--vp-c-text-1);
}
/* One grid for every row, so the names, the plot and the values line up across rows; the rows touch, so the
   gridlines run through. The value comes before the plot in the page so that on a phone it can sit beside the name. */
.bb-grid {
  display: grid;
  grid-template-columns: max-content minmax(120px, 1fr) max-content;
  grid-auto-flow: row dense;
  column-gap: 16px;
}
.bb-row {
  display: contents;
}
.bb-name {
  grid-column: 1;
  align-self: center;
  padding: 8px 0;
  font-size: 14px;
  white-space: nowrap;
  color: var(--vp-c-text-1);
}
.bb-me .bb-name {
  font-weight: 700;
}
.bb-plot {
  grid-column: 2;
  position: relative;
  display: flex;
  align-items: center;
  min-height: 36px;
}
.bb-gridline {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--vp-c-divider);
}
.bb-bar {
  position: relative;
  display: flex;
  gap: 2px;
  height: 14px;
}
.bb-seg {
  display: block;
  min-width: 2px;
  height: 100%;
  background: var(--bb-other-0);
}
.bb-seg.bb-part-1 {
  background: var(--bb-other-1);
}
.bb-seg.bb-ours {
  background: var(--bb-ours-0);
}
.bb-seg.bb-ours.bb-part-1 {
  background: var(--bb-ours-1);
}
/* Square at the axis, 4px round at the data end. */
.bb-bar .bb-seg:last-child {
  border-radius: 0 4px 4px 0;
}
.bb-placeholder .bb-bar .bb-seg {
  background: repeating-linear-gradient(45deg, var(--vp-c-default-2) 0 6px, transparent 6px 12px);
}
/* The fastest-to-slowest line: 2px with end ticks, ringed in the page colour where it crosses a bar. */
.bb-range {
  position: absolute;
  top: 50%;
  box-sizing: border-box;
  height: 12px;
  margin-top: -6px;
  border-left: 2px solid var(--vp-c-text-1);
  border-right: 2px solid var(--vp-c-text-1);
}
.bb-range::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--vp-c-text-1);
  box-shadow: 0 0 0 1px var(--vp-c-bg);
}
.bb-value {
  grid-column: 3;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 6px 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.bb-main {
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.bb-sub {
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.bb-axis .bb-plot {
  min-height: 24px;
  align-items: flex-start;
  border-top: 1px solid var(--vp-c-text-3);
}
.bb-tick {
  position: absolute;
  top: 4px;
  transform: translateX(-50%);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--vp-c-text-2);
}
.bb-tick.first {
  transform: none;
}
.bb-tick.last {
  transform: translateX(-100%);
}
.bb-axis .bb-name,
.bb-axis .bb-value {
  padding: 0;
}
.bb-conditions {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
/* On a phone the name and the value share a line and the bar runs the full width under them. */
@media (max-width: 639px) {
  .bb {
    padding: 16px;
  }
  .bb-grid {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .bb-name {
    align-self: end;
    padding: 10px 0 2px;
    white-space: normal;
  }
  .bb-value {
    grid-column: 2;
    align-items: flex-end;
    padding: 10px 0 2px;
  }
  .bb-plot {
    grid-column: 1 / -1;
    min-height: 22px;
  }
  .bb-axis .bb-name,
  .bb-axis .bb-value {
    display: none;
  }
  .bb-axis .bb-plot {
    margin-top: 8px;
  }
}
</style>
