<script setup>
// A button that copies `text` and says so for a moment. Used by every code block of the home page.
import { ref } from 'vue';
import { useData } from 'vitepress';
import { HOME_STRINGS } from './strings.js';
import { langOf } from '../playground/strings.js';

const props = defineProps({ text: { type: String, required: true }, dark: { type: Boolean, default: false } });
const { lang } = useData();
const t = HOME_STRINGS[langOf(lang.value)];

const copied = ref(false);
let timer = 0;

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text);
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied.value = false), 1500);
  } catch {
    // Clipboard refused: the text stays selectable on the page.
  }
}
</script>

<template>
  <button type="button" class="cb" :class="{ 'cb-dark': dark }" :aria-label="t.copy" @click="copy">
    {{ copied ? t.copied : t.copy }}
  </button>
</template>

<style scoped>
.cb {
  flex: none;
  padding: 3px 10px;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  font-family: var(--vp-font-family-base);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
}
.cb:hover {
  border-color: var(--vp-c-text-2);
}
/* On the terminal panel, which stays dark in both themes. */
.cb-dark {
  border-color: #3a3937;
  color: #efeeec;
  background: #262523;
}
.cb-dark:hover {
  border-color: #8a8987;
}
</style>
