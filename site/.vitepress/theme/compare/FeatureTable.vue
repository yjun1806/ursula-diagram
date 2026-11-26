<script setup>
// One small comparison table: a row per tool, ✓ for yes, — for no, numbers and short notes as they are.
//
// Usage in Markdown: <FeatureTable name="coverage" />  (reads tables.coverage from ./features.json)
// Data: { tables: { [name]: { placeholder, columns: [string | {en, ko}],
//         rows: [{ name: string | {en, ko}, highlight, values: [true | false | null | number | string | {en, ko}] }],
//         note: {en, ko} } } }. The first column is the row name; null means not checked.
// While "placeholder" is true the table renders only in the dev server, marked as placeholder, and nothing in a build.
// The table keeps its width and scrolls inside its own box on a narrow screen instead of squeezing its cells.
import { computed } from 'vue';
import { useData } from 'vitepress';
import DATA from './features.json';
import { langOf } from '../playground/strings.js';

const props = defineProps({ name: { type: String, required: true }, data: { type: Object, default: null } });

const { lang } = useData();
const code = langOf(lang.value);
const data = computed(() => props.data ?? DATA.tables[props.name]);
const shown = computed(() => !data.value.placeholder || import.meta.env.DEV);
const pick = (v) => (v && typeof v === 'object' ? v[code] ?? v.en : v);

const WORDS = {
  en: { yes: 'Yes', no: 'No', unknown: 'Not checked' },
  ko: { yes: '예', no: '아니요', unknown: '확인하지 않음' },
};
const w = WORDS[code];

function cell(v) {
  if (v === true) return { kind: 'yes', text: '✓', label: w.yes };
  if (v === false) return { kind: 'no', text: '—', label: w.no };
  if (v == null) return { kind: 'unknown', text: '?', label: w.unknown };
  if (typeof v === 'number') return { kind: 'num', text: v.toLocaleString('en-US', { maximumFractionDigits: 3 }), label: '' };
  return { kind: 'text', text: pick(v), label: '' };
}
</script>

<template>
  <div v-if="shown" class="ft" :class="{ 'ft-placeholder': data.placeholder }">
    <div class="ft-scroll" tabindex="0">
      <table>
        <thead>
          <tr>
            <th v-for="(col, i) in data.columns" :key="i" scope="col">{{ pick(col) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, r) in data.rows" :key="r" :class="{ 'ft-me': row.highlight }">
            <th scope="row">{{ pick(row.name) }}</th>
            <td v-for="(v, i) in row.values" :key="i" :class="`ft-${cell(v).kind}`">
              <span :aria-hidden="cell(v).label ? 'true' : undefined">{{ cell(v).text }}</span>
              <span v-if="cell(v).label" class="visually-hidden">{{ cell(v).label }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="data.note" class="ft-note">{{ pick(data.note) }}</p>
  </div>
</template>

<style scoped>
.ft {
  margin: 20px 0 28px;
}
.ft-scroll {
  /* Holds the visually hidden ✓ / — labels, which would otherwise widen the page from their absolute position. */
  position: relative;
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
}
.ft-placeholder .ft-scroll {
  border-style: dashed;
}
.ft table {
  display: table;
  width: 100%;
  margin: 0;
  border: 0;
  border-collapse: collapse;
  font-size: 15px;
}
.ft tr {
  border: 0;
  background: transparent;
}
.ft th,
.ft td {
  padding: 9px 14px;
  border: 0;
  border-bottom: 1px solid var(--vp-c-divider);
  background: transparent;
  white-space: nowrap;
}
.ft tbody tr:last-child th,
.ft tbody tr:last-child td {
  border-bottom: 0;
}
.ft thead th {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
}
.ft tbody th {
  font-weight: 500;
  text-align: left;
  color: var(--vp-c-text-1);
}
.ft thead th:first-child {
  text-align: left;
}
.ft td,
.ft thead th:not(:first-child) {
  text-align: center;
}
.ft .ft-me th,
.ft .ft-me td {
  background: var(--vp-c-brand-soft);
}
.ft .ft-me th {
  font-weight: 700;
}
.ft-num {
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}
.ft-yes {
  font-weight: 700;
  color: var(--vp-c-text-1);
}
.ft-no,
.ft-unknown {
  color: var(--vp-c-text-3);
}
.ft-text {
  font-size: 14px;
  color: var(--vp-c-text-1);
}
.ft-note {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
</style>
