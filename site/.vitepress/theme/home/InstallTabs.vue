<script setup>
// The install command with one tab per package manager and a copy button.
import { ref } from 'vue';
import { useData } from 'vitepress';
import { HOME_STRINGS } from './strings.js';
import { langOf } from '../playground/strings.js';

const { lang } = useData();
const t = HOME_STRINGS[langOf(lang.value)];

const MANAGERS = [
  { id: 'npm', command: 'npm install -g ursula-diagram' },
  { id: 'pnpm', command: 'pnpm add -g ursula-diagram' },
  { id: 'bun', command: 'bun add -g ursula-diagram' },
  { id: 'npx', command: 'npx ursula-diagram order.mmd --format text' },
];

const picked = ref(MANAGERS[0].id);
const copied = ref(false);
let timer = 0;

const commandOf = (id) => MANAGERS.find((m) => m.id === id).command;

async function copy() {
  try {
    await navigator.clipboard.writeText(commandOf(picked.value));
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied.value = false), 1500);
  } catch {
    // Clipboard refused: the command stays selectable on the page.
  }
}
</script>

<template>
  <div class="it">
    <div class="it-tabs" role="tablist" :aria-label="t.install">
      <button
        v-for="m in MANAGERS"
        :key="m.id"
        type="button"
        role="tab"
        :aria-selected="picked === m.id"
        :class="{ active: picked === m.id }"
        @click="picked = m.id"
      >
        {{ m.id }}
      </button>
    </div>
    <div class="it-line" role="tabpanel">
      <code><span class="it-prompt" aria-hidden="true">$ </span>{{ commandOf(picked) }}</code>
      <button type="button" class="it-copy" :aria-label="t.copy" @click="copy">{{ copied ? t.copied : t.copy }}</button>
    </div>
    <p class="it-note">{{ t.needsNode }}</p>
  </div>
</template>

<style scoped>
.it {
  margin-top: 28px;
  max-width: 560px;
}
.it-tabs {
  display: flex;
  gap: 2px;
}
.it-tabs button {
  padding: 6px 14px;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.it-tabs button:hover {
  color: var(--vp-c-text-1);
}
.it-tabs button.active {
  border-color: var(--vp-c-border);
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text-1);
  font-weight: 600;
}
.it-line {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: -1px;
  padding: 10px 10px 10px 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 0 8px 8px 8px;
  background: var(--vp-c-bg-alt);
}
.it-line code {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  color: var(--vp-c-text-1);
}
.it-prompt {
  color: var(--vp-c-text-3);
  user-select: none;
}
.it-copy {
  flex: none;
  padding: 4px 12px;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
}
.it-copy:hover {
  border-color: var(--vp-c-text-2);
}
.it-note {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
</style>
