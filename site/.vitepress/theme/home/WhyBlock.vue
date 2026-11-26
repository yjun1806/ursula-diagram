<script setup>
// Under the skill comparison: one sentence with the measured numbers, a short table against Mermaid.js, and three of
// the timed flowcharts drawn by both.
import { useData } from 'vitepress';
import { WHY } from './why.js';
import { langOf } from '../playground/strings.js';
import PicGrid from '../compare/PicGrid.vue';

const { lang } = useData();
const t = WHY[langOf(lang.value)];
</script>

<template>
  <section class="why">
    <h2 id="why" tabindex="-1">{{ t.title }} <a class="header-anchor" href="#why">&#8203;</a></h2>
    <p class="why-lead">{{ t.lead }}</p>
    <table class="why-table">
      <thead>
        <tr>
          <th scope="col"><span class="why-hidden">{{ t.what }}</span></th>
          <th scope="col" class="ours">ursula-diagram</th>
          <th scope="col">Mermaid.js 12.3.0</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in t.rows" :key="r[0]">
          <th scope="row">{{ r[0] }}</th>
          <td class="ours">{{ r[1] }}</td>
          <td>{{ r[2] }}</td>
        </tr>
      </tbody>
    </table>
    <p class="why-cap">{{ t.caption }}</p>
    <h3 class="why-strip">{{ t.strip }}</h3>
    <p class="why-cap">{{ t.stripNote }}</p>
    <PicGrid name="mermaid" />
  </section>
</template>

<style scoped>
.why {
  padding: 8px 24px 40px;
}
.why > * {
  max-width: 1152px;
  margin-left: auto;
  margin-right: auto;
}
@media (min-width: 640px) {
  .why {
    padding: 8px 48px 48px;
  }
}
@media (min-width: 960px) {
  .why {
    padding: 8px 64px 48px;
  }
}
.why h2 {
  margin-top: 0;
  margin-bottom: 8px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--vp-c-text-1);
}
.why-lead {
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 17px;
  line-height: 1.6;
  color: var(--vp-c-text-1);
}
.why-table {
  display: table;
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 15px;
  line-height: 1.5;
}
.why-table th,
.why-table td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--vp-c-divider);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.why-table thead th {
  border-bottom: 1px solid var(--vp-c-border);
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}
.why-table thead th.ours {
  color: var(--vp-c-brand-1);
}
.why-table tbody th {
  width: 34%;
  font-weight: 500;
  color: var(--vp-c-text-2);
}
.why-table td {
  color: var(--vp-c-text-2);
}
.why-table td.ours {
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.why-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.why-cap {
  margin-top: 10px;
  margin-bottom: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}
.why-strip {
  margin-top: 28px;
  margin-bottom: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}
@media (max-width: 639px) {
  .why-table {
    font-size: 13.5px;
  }
  .why-table th,
  .why-table td {
    padding: 8px 6px;
  }
}
</style>
