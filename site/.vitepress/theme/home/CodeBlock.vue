<script setup>
// A code block of the home page with a copy button: Mermaid text, a terminal drawing or what a command prints. It is
// marked like a VitePress code block (language-*), and Mermaid text wraps as it does in every Mermaid block of the site.
// The button sits in a span, so VitePress's own handler for `language-* > button.copy` leaves it to CopyButton.
import CopyButton from './CopyButton.vue';

defineProps({
  text: { type: String, required: true },
  lang: { type: String, default: 'text' },
  dark: { type: Boolean, default: false },
});
</script>

<template>
  <div class="cblock" :class="[`language-${lang}`, { 'cblock-dark': dark }]">
    <span class="cblock-copy"><CopyButton class="copy" :text="text" :dark="dark" /></span>
    <pre><code>{{ text }}</code></pre>
  </div>
</template>

<style scoped>
/* Doubled classes: the home page's Markdown part is .vp-doc, whose code block rules would otherwise win. */
.cblock.cblock {
  position: relative;
  margin: 0;
  border-radius: 0;
  background: var(--cblock-bg, transparent);
  overflow: visible;
}
.cblock-copy {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
}
.cblock.cblock pre {
  position: static;
  margin: 0;
  padding: 12px 76px 12px 16px;
  overflow-x: auto;
  background: transparent;
}
.cblock.cblock pre code {
  display: block;
  width: auto;
  min-width: 0;
  padding: 0;
  font-family: var(--vp-font-family-mono);
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  white-space: pre;
}
.cblock.language-mermaid pre code {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
