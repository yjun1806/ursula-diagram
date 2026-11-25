<script setup>
// A feature comparison table: ✓ for yes, — for no, and a short note where a yes or no would mislead.
//
// Usage in Markdown: <FeatureTable />  (reads ./features.json)
// Data: { placeholder, tools: [name], rows: [{ feature: {en, ko}, values: [true | false | null | {en, ko} | string] }],
//         note: {en, ko} }. null means not checked.
// While "placeholder" is true the table renders only in the dev server, marked as placeholder, and nothing in a build.
import { computed } from 'vue';
import { useData } from 'vitepress';
import DATA from './features.json';
import { langOf } from '../playground/strings.js';

const props = defineProps({ data: { type: Object, default: null } });

const { lang } = useData();
const code = langOf(lang.value);
const data = computed(() => props.data ?? DATA);
const shown = computed(() => !data.value.placeholder || import.meta.env.DEV);
const pick = (v) => (v && typeof v === 'object' ? v[code] ?? v.en : v);

const WORDS = {
  en: { yes: 'Yes', no: 'No', unknown: 'Not checked', feature: 'Feature' },
  ko: { yes: '예', no: '아니요', unknown: '확인하지 않음', feature: '기능' },
};
const w = WORDS[code];

function cell(v) {
  if (v === true) return { kind: 'yes', text: '✓', label: w.yes };
  if (v === false) return { kind: 'no', text: '—', label: w.no };
  if (v == null) return { kind: 'unknown', text: '?', label: w.unknown };
  return { kind: 'text', text: pick(v), label: '' };
}
</script>

<template>
  <div v-if="shown" class="ft" :class="{ 'ft-placeholder': data.placeholder }">
    <table>
      <thead>
        <tr>
          <th scope="col">{{ w.feature }}</th>
          <th v-for="(tool, i) in data.tools" :key="tool" scope="col" :class="{ 'ft-me': i === 0 }">{{ tool }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, r) in data.rows" :key="r">
          <th scope="row">{{ pick(row.feature) }}</th>
          <td v-for="(v, i) in row.values" :key="i" :class="[`ft-${cell(v).kind}`, { 'ft-me': i === 0 }]">
            <span :aria-hidden="cell(v).label ? 'true' : undefined">{{ cell(v).text }}</span>
            <span v-if="cell(v).label" class="visually-hidden">{{ cell(v).label }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="data.note" class="ft-note">{{ pick(data.note) }}</p>
  </div>
</template>

<style scoped>
.ft {
  margin: 24px 0;
  overflow-x: auto;
}
.ft-placeholder table {
  outline: 1px dashed var(--vp-c-border);
}
.ft table {
  display: table;
  width: 100%;
  margin: 0;
  border-collapse: collapse;
  font-size: 15px;
}
.ft th,
.ft td {
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--vp-c-divider);
  background: transparent;
}
.ft thead th {
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  border-bottom: 2px solid var(--vp-c-border);
}
.ft tbody th {
  font-weight: 500;
  text-align: left;
  color: var(--vp-c-text-1);
}
.ft td,
.ft thead th:not(:first-child) {
  text-align: center;
}
.ft .ft-me {
  background: var(--vp-c-brand-soft);
}
.ft-yes {
  font-weight: 700;
  color: var(--vp-c-text-1);
}
.ft-no,
.ft-unknown {
  color: var(--vp-c-text-2);
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
