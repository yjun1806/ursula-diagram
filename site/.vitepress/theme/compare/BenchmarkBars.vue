<script setup>
// Every bar chart on the site: thick horizontal bars on one shared axis, the value in bold at the end of each bar, and
// the conditions in a caption under them.
//
// Usage in Markdown: <BenchmarkBars name="speed" />  (reads charts.speed from ./benchmark.json)
// Data: { charts: { [name]: { placeholder, title: {en, ko}, conditions: {en, ko}, decimals, lowerIsBetter,
//         unit: string | {en, ko}, ticks: [number], headline: { slower, faster, text: {en, ko} }, runs: {en, ko},
//         bars: [{ id, name: string | {en, ko}, value, text, highlight, range: [low, high],
//                  sub: {en, ko}, detail: {en, ko} }] } } }
// - value is the bar's length; text, when given, is printed at the end of the bar instead of the value.
// - headline is one big line above the chart: {n} in its text becomes the value of the bar whose id is slower divided
//   by the value of the bar whose id is faster, rounded.
// - runs is one plain line under the chart: {0}, {1}, … become the ranges of the bars that have one, in bar order.
// - sub is a second, muted line under the name; detail is the hover text and what a screen reader hears.
// - ticks are the labelled axis values; without them the chart picks round ones that reach past every value.
// While "placeholder" is true the chart renders only in the dev server, marked as placeholder, and nothing in a build,
// so no made-up number reaches the published site.
import { computed } from 'vue';
import { useData } from 'vitepress';
import DATA from './benchmark.json';
import { langOf } from '../playground/strings.js';

const props = defineProps({ name: { type: String, default: null }, data: { type: Object, default: null } });

const WORDS = {
  en: { faster: 'lower is faster', dash: '–' },
  ko: { faster: '짧을수록 빠름', dash: '~' },
};

const { lang } = useData();
const code = langOf(lang.value);
const w = WORDS[code];
const data = computed(() => props.data ?? DATA.charts[props.name]);
const shown = computed(() => !data.value.placeholder || import.meta.env.DEV);
const pick = (v) => (v && typeof v === 'object' ? v[code] ?? v.en : v);
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');

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

const ticks = computed(() => data.value.ticks ?? roundTicks(Math.max(1, ...data.value.bars.map((b) => b.value ?? 0))));
const axisMax = computed(() => ticks.value[ticks.value.length - 1]);
const pct = (v) => `${Math.min(100, (v / axisMax.value) * 100)}%`;
const decimals = computed(() => data.value.decimals ?? 0);
const number = (v, places = decimals.value) =>
  v.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places });
// "130 s" and "103 ms", but "130초": a unit in letters takes a space, one in Hangul does not.
const unit = computed(() => pick(data.value.unit));
const withUnit = (text) => `${text}${/^[a-z]/i.test(unit.value) ? ' ' : ''}${unit.value}`;

const headline = computed(() => {
  const h = data.value.headline;
  if (!h) return null;
  const by = (id) => data.value.bars.find((b) => b.id === id).value;
  return fill(pick(h.text), { n: Math.round(by(h.slower) / by(h.faster)) });
});

const runs = computed(() => {
  const d = data.value;
  if (!d.runs) return null;
  const ranges = d.bars.filter((b) => b.range).map((b) => withUnit(`${number(b.range[0])}${w.dash}${number(b.range[1])}`));
  return fill(pick(d.runs), ranges);
});

const rows = computed(() =>
  data.value.bars.map((b) => ({
    name: pick(b.name),
    highlight: b.highlight,
    width: b.value == null ? '0%' : pct(b.value),
    value: b.value == null ? '—' : withUnit(pick(b.text) ?? number(b.value)),
    sub: pick(b.sub),
    detail: pick(b.detail),
  })),
);

const tickLabels = computed(() =>
  ticks.value.map((t, i) => ({
    left: pct(t),
    text: i === ticks.value.length - 1 ? withUnit(number(t, 0)) : number(t, 0),
    edge: i === 0 ? 'first' : i === ticks.value.length - 1 ? 'last' : '',
  })),
);
</script>

<template>
  <figure v-if="shown" class="bb" :class="{ 'bb-placeholder': data.placeholder }">
    <p v-if="headline" class="bb-headline">{{ headline }}</p>
    <div v-if="data.title" class="bb-title">
      {{ pick(data.title) }}
      <span v-if="data.lowerIsBetter" class="bb-hint">{{ w.faster }}</span>
    </div>
    <div class="bb-rows">
      <div
        v-for="r in rows"
        :key="r.name"
        class="bb-row"
        :class="{ 'bb-me': r.highlight }"
        :tabindex="r.detail ? 0 : undefined"
      >
        <span class="bb-label">
          <span class="bb-name">{{ r.name }}</span>
          <span v-if="r.sub" class="bb-sub">{{ r.sub }}</span>
        </span>
        <span class="bb-plot">
          <span v-for="t in tickLabels" :key="t.left" class="bb-gridline" :style="{ left: t.left }" aria-hidden="true"></span>
          <span class="bb-bar" :style="{ width: r.width }" aria-hidden="true"></span>
          <span class="bb-value">{{ r.value }}</span>
          <span v-if="r.detail" class="visually-hidden">{{ r.detail }}</span>
          <span v-if="r.detail" class="bb-tip" aria-hidden="true">{{ r.detail }}</span>
        </span>
      </div>
      <div class="bb-row bb-axis" aria-hidden="true">
        <span class="bb-label"></span>
        <span class="bb-plot">
          <span v-for="t in tickLabels" :key="t.left" class="bb-tick" :class="t.edge" :style="{ left: t.left }">{{ t.text }}</span>
        </span>
      </div>
    </div>
    <figcaption class="bb-caption">
      <span v-if="runs" class="bb-runs">{{ runs }}</span>
      <span v-if="data.conditions">{{ pick(data.conditions) }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
/* ursula's bars wear the site accent, the others a neutral grey; both keep at least 3:1 against the page in light and
   dark, and they stay apart for colour-blind readers too (checked with an OKLab colour-difference test). */
.bb {
  --bb-ours: #82641c;
  --bb-other: #868990;
  --bb-label-width: 15rem;
  --bb-value-room: 5.5rem;
  margin: 24px 0;
  padding: 24px;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
}
.dark .bb {
  --bb-ours: #dab975;
  --bb-other: #99968f;
}
.bb-placeholder {
  border-style: dashed;
}
.bb-headline {
  margin: 0 0 4px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--vp-c-text-1);
}
.bb-title {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.bb-headline + .bb-title {
  font-size: 14px;
  font-weight: 400;
  color: var(--vp-c-text-2);
}
.bb-hint {
  font-size: 13px;
  font-weight: 400;
  color: var(--vp-c-text-2);
}
.bb-rows {
  margin-top: 16px;
}
/* A row is the name with its muted second line, then the plot. Every plot leaves the same room on its right for the
   longest value, so the axis lines up across rows and a value always fits just past the end of its bar. */
.bb-row {
  position: relative;
  display: grid;
  grid-template-columns: var(--bb-label-width) minmax(0, 1fr);
  column-gap: 16px;
  outline: none;
}
.bb-label {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 8px 0;
}
.bb-name {
  font-size: 14px;
  line-height: 1.35;
  color: var(--vp-c-text-1);
}
.bb-me .bb-name {
  font-weight: 700;
}
.bb-sub {
  font-size: 12px;
  line-height: 1.4;
  color: var(--vp-c-text-2);
}
.bb-plot {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 48px;
  margin-right: var(--bb-value-room);
}
.bb-gridline {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--vp-c-divider);
  opacity: 0.6;
}
/* Square at the axis, 4px round at the data end; a bar too short to see still shows 2px. */
.bb-bar {
  position: relative;
  flex: none;
  min-width: 2px;
  height: 28px;
  border-radius: 0 4px 4px 0;
  background: var(--bb-other);
}
.bb-me .bb-bar {
  background: var(--bb-ours);
}
.bb-placeholder .bb-bar {
  background: repeating-linear-gradient(45deg, var(--vp-c-default-2) 0 6px, transparent 6px 12px);
}
.bb-value {
  position: relative;
  flex: none;
  margin-left: 8px;
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--vp-c-text-1);
}
/* Where the time went, shown above the bar on hover or keyboard focus. */
.bb-tip {
  position: absolute;
  bottom: calc(100% - 6px);
  left: 0;
  z-index: 2;
  width: max-content;
  max-width: min(28rem, 100%);
  padding: 6px 10px;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-2);
  font-size: 13px;
  line-height: 1.45;
  color: var(--vp-c-text-1);
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s;
}
.bb-row:hover .bb-tip,
.bb-row:focus-visible .bb-tip {
  visibility: visible;
  opacity: 1;
}
.bb-row:focus-visible .bb-bar {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
.bb-axis .bb-plot {
  min-height: 24px;
  align-items: flex-start;
  border-top: 1px solid var(--vp-c-divider);
}
.bb-axis .bb-label {
  padding: 0;
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
.bb-caption {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.bb-runs {
  color: var(--vp-c-text-1);
}
/* On a phone the name and its second line sit above the bar, and the bar runs the full width under them. */
@media (max-width: 639px) {
  .bb {
    --bb-value-room: 4.5rem;
    padding: 16px;
  }
  .bb-headline {
    font-size: 22px;
  }
  .bb-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .bb-label {
    display: block;
    padding: 10px 0 2px;
  }
  .bb-sub::before {
    content: ' · ';
  }
  .bb-plot {
    min-height: 32px;
  }
  .bb-bar {
    height: 24px;
  }
  .bb-axis .bb-label {
    display: none;
  }
  .bb-axis .bb-plot {
    margin-top: 8px;
  }
}
</style>
