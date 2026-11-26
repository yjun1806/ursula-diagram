<script setup>
// Every colour variable of a drawing with its light and dark value, read from the engine at build time
// (./colours.data.mjs). Above the table, the eight series colours in both schemes.
//
// Usage in Markdown: <ColourTable />
// Each value shows a swatch and the value in monospace; the swatch is hidden from screen readers, which read the value.
// On a narrow screen the description moves under the variable name, so the swatches stay in view, and the table
// scrolls inside its own box when it is still wider than the screen.
import { useData } from 'vitepress';
import { data as rows } from './colours.data.mjs';
import { langOf } from '../playground/strings.js';

const { lang } = useData();
const code = langOf(lang.value);

const WORDS = {
  en: { variable: 'Variable', colours: 'What it colours', light: 'Light', dark: 'Dark', series: 'Chart series' },
  ko: { variable: '변수', colours: '칠하는 것', light: '밝은 값', dark: '어두운 값', series: '차트 계열' },
};
const w = WORDS[code];

const series = rows.filter((r) => /^s\d+$/.test(r.name));

/** The kind of swatch a value takes: a colour, a see-through checkerboard, or an empty dashed square. */
const kind = (value) => (value === 'transparent' ? 'clear' : value === 'none' ? 'none' : 'colour');
</script>

<template>
  <div class="ct">
    <div class="ct-strip" aria-hidden="true">
      <span class="ct-strip-title">{{ w.series }}</span>
      <div v-for="mode in ['light', 'dark']" :key="mode" class="ct-strip-row">
        <span class="ct-strip-label">{{ w[mode] }}</span>
        <span class="ct-strip-cells" :class="`ct-strip-${mode}`">
          <span v-for="r in series" :key="r.name" class="ct-strip-cell">
            <span class="ct-chip" :style="{ background: r[mode] }" />
            <span class="ct-strip-name">{{ r.name }}</span>
          </span>
        </span>
      </div>
    </div>
    <div class="ct-scroll" tabindex="0">
      <table>
        <thead>
          <tr>
            <th scope="col">{{ w.variable }}</th>
            <th scope="col" class="ct-what">{{ w.colours }}</th>
            <th scope="col">{{ w.light }}</th>
            <th scope="col">{{ w.dark }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.name" class="ct-row">
            <th scope="row">
              <code>{{ r.variable }}</code>
              <span class="ct-what-under">{{ r[code] }}</span>
            </th>
            <td class="ct-what">{{ r[code] }}</td>
            <td v-for="mode in ['light', 'dark']" :key="mode" class="ct-value">
              <span
                class="ct-swatch"
                :class="`ct-swatch-${kind(r[mode])}`"
                :style="kind(r[mode]) === 'colour' ? { background: r[mode] } : undefined"
                aria-hidden="true"
              />
              <code>{{ r[mode] }}</code>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.ct {
  --ct-edge: color-mix(in srgb, var(--vp-c-text-1) 35%, transparent);
  margin: 20px 0 28px;
}
.ct-strip {
  display: grid;
  gap: 6px;
  margin-bottom: 16px;
}
.ct-strip-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}
.ct-strip-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ct-strip-label {
  flex: 0 0 4.5em;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.ct-strip-cells {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 40px));
  gap: 4px;
  min-width: 0;
}
.ct-strip-cell {
  display: grid;
  justify-items: center;
  gap: 2px;
}
.ct-chip {
  width: 100%;
  aspect-ratio: 1;
  max-width: 40px;
  border: 1px solid var(--ct-edge);
  border-radius: 4px;
}
.ct-strip-name {
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  color: var(--vp-c-text-3);
}
.ct-scroll {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
}
.ct table {
  display: table;
  width: 100%;
  margin: 0;
  border: 0;
  border-collapse: collapse;
  font-size: 14px;
}
.ct tr {
  border: 0;
  background: transparent;
}
.ct th,
.ct td {
  padding: 8px 12px;
  border: 0;
  border-bottom: 1px solid var(--vp-c-divider);
  background: transparent;
  text-align: left;
  vertical-align: middle;
}
.ct tbody tr:last-child th,
.ct tbody tr:last-child td {
  border-bottom: 0;
}
.ct thead th {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  white-space: nowrap;
}
.ct tbody th {
  font-weight: 500;
  white-space: nowrap;
}
.ct-what {
  min-width: 14em;
  color: var(--vp-c-text-1);
}
.ct-value {
  white-space: nowrap;
}
.ct-value code {
  font-size: 13px;
}
.ct-swatch {
  display: inline-block;
  width: 16px;
  height: 16px;
  margin-right: 8px;
  vertical-align: -3px;
  border: 1px solid var(--ct-edge);
  border-radius: 3px;
}
.ct-swatch-clear {
  background: repeating-conic-gradient(var(--vp-c-text-3) 0 25%, transparent 0 50%) 0 0 / 8px 8px;
}
.ct-swatch-none {
  border-style: dashed;
}
.ct-what-under {
  display: none;
}
@media (max-width: 639px) {
  .ct th,
  .ct td {
    padding: 8px 8px;
  }
  .ct .ct-what {
    display: none;
  }
  .ct-what-under {
    display: block;
    margin-top: 4px;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    white-space: normal;
    color: var(--vp-c-text-2);
  }
  .ct-swatch {
    margin-right: 6px;
  }
}
</style>
