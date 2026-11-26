<script setup>
// The first thing under the hero: the time per drawing of the ursula skill next to a skill that has the model lay out
// the drawing and next to the engine alone, and the drawings both skills made from the same three texts, so the speed
// is never shown without the result. The chart's numbers are charts.skillMean in ../compare/benchmark.json.
import { useData, withBase } from 'vitepress';
import { HOME_STRINGS } from './strings.js';
import { langOf } from '../playground/strings.js';
import PicGrid from '../compare/PicGrid.vue';
import BenchmarkBars from '../compare/BenchmarkBars.vue';

const { lang } = useData();
const code = langOf(lang.value);
const t = HOME_STRINGS[code];
const comparePage = withBase(`${code === 'ko' ? '/ko' : ''}/guide/compared`);
</script>

<template>
  <section class="sk">
    <h2>{{ t.measureTitle }}</h2>
    <p class="sk-lead">{{ t.measureHeadline }}</p>
    <BenchmarkBars class="sk-chart" name="skillMean" />
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
.sk > .sk-chart {
  margin: 0 auto 16px;
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
</style>
