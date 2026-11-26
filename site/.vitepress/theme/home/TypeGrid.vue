<script setup>
// Thumbnails of the Examples page with their type names, each linking to its type's examples, and the names of all 35 types the engine reads.
import { useData, withBase } from 'vitepress';
import { HOME_STRINGS } from './strings.js';
import { langOf } from '../playground/strings.js';

const { lang } = useData();
const code = langOf(lang.value);
const t = HOME_STRINGS[code];
const prefix = code === 'ko' ? '/ko' : '';
const examples = withBase(`${prefix}/examples/`);

const SHOWN = {
  en: [
    ['flowchart', 'Flowchart'], ['sequence', 'Sequence'], ['class', 'Class'], ['state', 'State'],
    ['er', 'Entity relationship'], ['c4', 'C4 context'], ['mindmap', 'Mindmap'], ['gantt', 'Gantt'],
  ],
  ko: [
    ['flowchart', 'Flowchart'], ['sequence', 'Sequence'], ['class', 'Class'], ['state', 'State'],
    ['er', 'Entity relationship'], ['c4', 'C4 context'], ['mindmap', 'Mindmap'], ['gantt', 'Gantt'],
  ],
};
const cards = SHOWN[code].map(([id, name]) => ({
  id,
  name,
  src: withBase(`/assets/${code === 'ko' ? 'ko-' : ''}${id}.svg`),
  href: withBase(`${prefix}/examples/${id}`),
}));

// The README's list, in its order.
const ALL = [
  'Architecture', 'Block', 'C4', 'Class', 'Cynefin', 'Entity Relationship', 'Event Modeling', 'Flowchart', 'Gantt',
  'Git Graph', 'Ishikawa', 'Kanban', 'Mindmap', 'Packet', 'Pie', 'Quadrant', 'Radar', 'Railroad (IR, ABNF, EBNF, PEG)',
  'Requirement', 'Sankey', 'Sequence', 'State', 'Swimlanes', 'Timeline', 'TreeView', 'Treemap', 'Use Case', 'User Journey', 'Venn',
  'Wardley Map', 'XY Chart', 'ZenUML',
];
</script>

<template>
  <section class="tg">
    <h2 class="tg-title">{{ t.types }}</h2>
    <div class="tg-grid">
      <a v-for="c in cards" :key="c.id" class="tg-card" :href="c.href">
        <span class="tg-thumb ursula-frame"><img :src="c.src" :alt="c.name" loading="lazy" /></span>
        <span class="tg-name">{{ c.name }}</span>
      </a>
    </div>
    <p class="tg-lead">{{ t.typesLead }}</p>
    <ul class="tg-chips">
      <li v-for="name in ALL" :key="name">{{ name }}</li>
    </ul>
    <p class="tg-more"><a :href="examples">{{ t.examples }} →</a></p>
  </section>
</template>

<style scoped>
.tg {
  padding-top: 48px;
}
@media (min-width: 640px) {
  .tg {
    padding-top: 64px;
  }
}
.tg-title {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
  margin-bottom: 20px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--vp-c-text-1);
}
.tg-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (min-width: 768px) {
  .tg-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
  .tg-thumb {
    height: 140px;
  }
}
.tg-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg);
  text-decoration: none;
  transition: border-color 0.2s;
}
.tg-card:hover {
  border-color: var(--vp-c-brand-1);
}
.tg-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 112px;
  padding: 12px;
  background: var(--ursula-surface);
}
.tg-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.tg-name {
  padding: 10px 14px;
  border-top: 1px solid var(--vp-c-divider);
  font-size: 15px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.tg-lead {
  margin-top: 28px;
  margin-bottom: 12px;
  font-size: 16px;
  line-height: 1.7;
  color: var(--vp-c-text-1);
}
.tg-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 0;
  margin-bottom: 0;
  padding: 0;
  list-style: none;
}
.tg-chips li {
  margin: 0;
  padding: 3px 10px;
  border: 1px solid var(--vp-c-border);
  border-radius: 999px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--vp-c-text-1);
}
.tg-more {
  margin-top: 16px;
  margin-bottom: 0;
  font-size: 15px;
}
.tg-more a {
  font-weight: 600;
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
