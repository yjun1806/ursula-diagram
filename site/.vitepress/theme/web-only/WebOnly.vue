<script setup>
// Words that only make sense on the web page, such as "click a picture to enlarge it". The page shows the slot as it
// is; the Markdown for AI agents (../../llms/markdown.mjs) drops it, or writes `agent` in its place.
//
// Usage in Markdown: <WebOnly>; click a picture to enlarge it</WebOnly>  or  <WebOnly agent="The name">…</WebOnly>
defineProps({ agent: { type: String, default: '' } });
</script>

<template><slot /></template>
