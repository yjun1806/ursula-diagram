<script setup>
// The home page's case for agents: what the command does for an agent, each with the command and what it prints.
// The measured time per drawing next to another skill is in SkillBlock.vue.
import { computed } from 'vue';
import { withBase } from 'vitepress';
import { HOME_STRINGS } from './strings.js';
import { CARDS } from './agents.js';
import OUTPUTS from './outputs.json';
import { localPath, useLang, useWords } from '../locale.js';
import CopyButton from './CopyButton.vue';
import CodeBlock from './CodeBlock.vue';

const code = useLang();
const t = useWords(HOME_STRINGS, code);
const skillPage = computed(() => localPath(code.value, '/guide/agent-skill'));

const cards = computed(() =>
  CARDS.map((c, i) => ({ ...c, output: OUTPUTS.cards[c.id] ?? '', step: i + 1, title: t.value.cards[c.id][0], body: t.value.cards[c.id][1] })),
);
const loopSrc = computed(() => withBase(`/assets/${code.value === 'ko' ? 'ko-' : ''}loop.svg`));
</script>

<template>
  <section class="ag">
    <h2 id="agents" class="ag-title" tabindex="-1">{{ t.agentsTitle }} <a class="header-anchor" href="#agents">&#8203;</a></h2>
    <p class="ag-lead">{{ t.agentsLead }}</p>
    <div class="ag-loop ursula-frame">
      <img :src="loopSrc" :alt="t.loopAlt" loading="lazy" />
    </div>

    <div class="ag-grid">
      <article v-for="c in cards" :key="c.id" class="ag-card">
        <h3><span class="ag-step">{{ c.step }}.</span> {{ c.title }}</h3>
        <p>{{ c.body }}</p>
        <div class="ag-code">
          <div v-for="cmd in c.commands" :key="cmd" class="ag-cmd">
            <code><span class="ag-prompt" aria-hidden="true">$ </span><template v-for="(word, i) in cmd.split(' ')" :key="i">{{ i > 0 ? ' ' : '' }}<span class="cmd-word">{{ word }}</span></template></code>
            <CopyButton :text="cmd" />
          </div>
          <CodeBlock v-if="c.output" class="ag-out" :text="c.output" />
          <p v-if="c.exit" class="ag-exit">{{ t.exitCode }} {{ c.exit }}</p>
        </div>
      </article>
    </div>
    <p class="ag-more"><a :href="skillPage">{{ t.agentsMore }} →</a></p>

  </section>
</template>

<style scoped>
.ag {
  padding-top: 8px;
}
.ag-title {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
  margin-bottom: 8px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--vp-c-text-1);
}
.ag-lead {
  max-width: 72ch;
  margin: 0 0 20px;
  font-size: 16px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}
.ag-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}
@media (min-width: 768px) {
  .ag-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
}
.ag-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 18px 18px 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg);
}
.ag-loop {
  margin: 0 0 20px;
  padding: 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--ursula-surface);
}
.ag-loop img {
  display: block;
  width: 100%;
  max-width: 760px;
  height: auto;
  margin: 0 auto;
}
.ag-step {
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}
.ag-cmd + .ag-cmd {
  border-top: 1px solid var(--vp-c-divider);
}
.ag-card h3 {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--vp-c-text-1);
}
.ag-card > p {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.ag-code {
  margin-top: auto;
  min-width: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  background: var(--vp-c-bg-alt);
}
.ag-cmd {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 6px 6px 12px;
}
/* A command wraps instead of running under the copy button, which sits beside it in the flex row. */
.ag-cmd code {
  flex: 1;
  min-width: 0;
  padding: 3px 0;
  border-radius: 0;
  background: transparent;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  color: var(--vp-c-text-1);
}
.ag-prompt {
  color: var(--vp-c-text-3);
  user-select: none;
}
.ag-out {
  border-top: 1px solid var(--vp-c-divider);
  font-size: 12px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
.ag-exit {
  margin: 0;
  padding: 0 12px 10px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.ag-more {
  margin: 16px 0 0;
  font-size: 15px;
}
.ag-more a {
  font-weight: 600;
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
