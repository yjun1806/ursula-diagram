<script setup>
// The install command with one tab per package manager, the agent skill and the MCP server, and a copy button.
import { ref } from 'vue';
import { useData } from 'vitepress';
import { HOME_STRINGS } from './strings.js';
import { langOf } from '../playground/strings.js';
import CopyButton from './CopyButton.vue';
import { INSTALL as MANAGERS } from './install.js';

const { lang } = useData();
const t = HOME_STRINGS[langOf(lang.value)];

const picked = ref(MANAGERS[0].id);

const commandOf = (id) => MANAGERS.find((m) => m.id === id).command;
const noteOf = (id) => (id === 'skill' ? t.skillNote : id === 'mcp' ? t.mcpNote : t.needsNode);
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
      <CopyButton :text="commandOf(picked)" />
    </div>
    <p class="it-note">{{ noteOf(picked) }}</p>
  </div>
</template>

<style scoped>
.it {
  margin-top: 28px;
  max-width: 560px;
}
.it-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.it-tabs button {
  padding: 6px 12px;
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
  align-items: flex-start;
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
  padding: 3px 0;
  border-radius: 0;
  background: transparent;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  color: var(--vp-c-text-1);
}
.it-prompt {
  color: var(--vp-c-text-3);
  user-select: none;
}
.it-note {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
</style>
