<script setup>
// The table of the 35 types on the Examples index page, each with its number of examples and a link to its page.
import { computed } from 'vue';
import { TYPES } from '../../examples/types.mjs';
import { data as counts } from './counts.data.mjs';
import { localPath, useLang, useWords } from '../locale.js';

const code = useLang();
const T = {
  en: { type: 'Type', count: 'Examples', failed: (n) => `${n} not drawn`, total: 'Total' },
  ko: { type: '유형', count: '예시', failed: (n) => `${n}개 못 그림`, total: '합계' },
};
const t = useWords(T, code);
const rows = computed(() =>
  TYPES.map((type) => ({
    id: type.id,
    name: type.name,
    href: localPath(code.value, `/examples/${type.id}`),
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
