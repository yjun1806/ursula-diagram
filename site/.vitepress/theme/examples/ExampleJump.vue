<script setup>
// A select of the example headings on a type page; picking one scrolls to it. Built from the page itself.
import { onMounted, ref } from 'vue';

defineProps({ label: { type: String, required: true } });
const ids = ref([]);
onMounted(() => {
  ids.value = [...document.querySelectorAll('.vp-doc h2[id]')].map((h) => h.id);
});
function go(event) {
  const id = event.target.value;
  if (!id) return;
  location.hash = `#${encodeURIComponent(id)}`;
  event.target.value = '';
}
</script>

<template>
  <p class="ex-jump">
    <select :aria-label="label" @change="go">
      <option value="">{{ label }}…</option>
      <option v-for="id in ids" :key="id" :value="id">{{ id }}</option>
    </select>
  </p>
</template>
