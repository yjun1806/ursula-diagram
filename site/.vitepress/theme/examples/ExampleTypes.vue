<script setup>
// The table of the 35 types on the Examples index page, each with its number of examples and a link to its page.
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import { TYPES } from '../../examples/types.mjs';
import { data as counts } from './counts.data.mjs';
import { langOf } from '../playground/strings.js';

const { lang } = useData();
const code = computed(() => langOf(lang.value));
const T = {
  en: { type: 'Type', count: 'Examples', failed: (n) => `${n} not drawn`, total: 'Total' },
  ko: { type: '유형', count: '예시', failed: (n) => `${n}개 못 그림`, total: '합계' },
};
const t = computed(() => T[code.value]);
const rows = computed(() =>
  TYPES.map((type) => ({
    id: type.id,
    name: type.name,
    href: withBase(`${code.value === 'ko' ? '/ko' : ''}/examples/${type.id}`),
    ...counts[type.id],
  })),
);
const total = computed(() => rows.value.reduce((n, r) => n + r.count, 0));
</script>

<template>
  <div class="ex-types">
    <a v-for="r in rows" :key="r.id" class="ex-type" :href="r.href">
      <span class="ex-type-name">{{ r.name }}</span>
      <span class="ex-type-count">{{ r.count }}<template v-if="r.errors"> · {{ t.failed(r.errors) }}</template></span>
    </a>
  </div>
  <p class="ex-total">{{ t.total }}: {{ total }}</p>
</template>
