<script setup>
// Pictures in a grid: one column per tool, one row per example, every cell the same width and the same light panel,
// so drawings by different tools can be compared at a glance. A click on a picture opens it large (../zoom/ZoomLayer.vue).
//
// Usage: <PicGrid name="side" />  (reads GRIDS.side from ./pictures.js); `named` shows the grid's `named` column
// headers instead of `columns` (the Compared page names the skill; the home page describes it).
// Wide screens: the header row stays under the top bar while the rows scroll past. At 768 px and below the grid keeps
// its columns and scrolls sideways inside its own box, ursula's column first; each cell then shows its tool's name,
// because the sticky header cannot follow a box that scrolls sideways.
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import { GRIDS } from './pictures.js';
import SIZES from './sizes.json';
import { langOf } from '../playground/strings.js';

const props = defineProps({ name: { type: String, required: true }, named: { type: Boolean, default: false } });

const { lang } = useData();
const code = langOf(lang.value);
const pick = (v) => (v && typeof v === 'object' ? v[code] ?? v.en : v);
const link = (href) => (href.startsWith('/') ? withBase(`${code === 'ko' ? '/ko' : ''}${href}`) : href);

const grid = computed(() => GRIDS[props.name]);
const columns = computed(() => (props.named && grid.value.named ? grid.value.named : grid.value.columns).map(pick));
const rows = computed(() =>
  grid.value.rows.map((r, i) => ({
    key: `${props.name}-${i}`,
    label: pick(r.label),
    href: link(r.href),
    external: !r.href.startsWith('/'),
    height: r.height,
    // The panels take the shape of the row's tallest picture, at most `height` high, so wide pictures leave no empty band.
    ratio: Math.min(4, ...r.cells.filter((c) => c.src && SIZES[c.src]).map((c) => SIZES[c.src].width / SIZES[c.src].height)),
    note: pick(r.note),
    cells: r.cells.map((c, j) => ({
      column: columns.value[j],
      none: pick(c.none),
      src: c.src && withBase(c.src),
      size: c.src ? SIZES[c.src] : null,
      alt: c.src ? `${pick(r.label)} (${columns.value[j]})` : '',
      facts: (c.facts ?? []).map(pick),
    })),
  })),
);
const enlarge = code === 'ko' ? '그림 크게 보기' : 'Enlarge picture';
</script>

<template>
  <div class="pg" :style="{ '--pg-cols': columns.length, '--pg-min': `${grid.minColumn ?? 200}px` }">
    <div class="pg-scroll">
      <div class="pg-grid">
        <div v-for="c in columns" :key="c" class="pg-head">{{ c }}</div>
        <template v-for="r in rows" :key="r.key">
          <div class="pg-label">
            <a :href="r.href" :target="r.external ? '_blank' : null" :rel="r.external ? 'noreferrer' : null">{{ r.label }}</a>
          </div>
          <div v-for="c in r.cells" :key="c.column" class="pg-cell">
            <span class="pg-cell-name" aria-hidden="true">{{ c.column }}</span>
            <div class="pg-panel" :class="{ 'pg-empty': c.none }" :style="{ '--pg-h': `${r.height}px`, '--pg-ratio': r.ratio }">
              <span v-if="c.none" class="pg-none">{{ c.none }}</span>
              <button v-else type="button" class="ex-zoom pg-zoom" data-light :aria-label="`${enlarge}: ${c.alt}`">
                <img :src="c.src" :alt="c.alt" :width="c.size?.width" :height="c.size?.height" loading="lazy" decoding="async" />
              </button>
            </div>
            <ul v-if="c.facts.length" class="pg-facts">
              <li v-for="f in c.facts" :key="f">{{ f }}</li>
            </ul>
          </div>
          <p v-if="r.note" class="pg-note">{{ r.note }}</p>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pg {
  margin: 16px 0 28px;
}
.pg-grid {
  display: grid;
  grid-template-columns: repeat(var(--pg-cols), minmax(0, 1fr));
  column-gap: 12px;
}
.pg-head {
  position: sticky;
  top: var(--vp-nav-height, 64px);
  z-index: 2;
  padding: 8px 2px;
  border-bottom: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--vp-c-text-1);
  overflow-wrap: anywhere;
}
.pg-label {
  grid-column: 1 / -1;
  padding: 16px 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.pg-label a {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.pg-cell {
  min-width: 0;
  container-type: inline-size;
}
.pg-cell-name {
  display: none;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}
/* The same light panel in both themes, as the pictures of other tools were drawn for a light page. */
.pg-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  /* As tall as the row's tallest picture needs at this column width, at most --pg-h. */
  height: max(90px, min(var(--pg-h), calc(100cqw / var(--pg-ratio, 1))));
  padding: 10px;
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  background: #ffffff;
  color-scheme: light;
}
.pg-empty {
  border-style: dashed;
  background: var(--vp-c-bg-alt);
  color-scheme: normal;
}
.pg-none {
  font-size: 13px;
  color: var(--vp-c-text-3);
  text-align: center;
}
.pg-zoom {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  cursor: zoom-in;
}
.pg-zoom img {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  color-scheme: light;
}
.pg-facts {
  margin: 8px 0 0;
  padding: 0 0 0 16px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}
.pg-facts li + li {
  margin-top: 2px;
}
.pg-facts li:first-child {
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.pg-note {
  grid-column: 1 / -1;
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}
@media (max-width: 768px) {
  .pg-scroll {
    overflow-x: auto;
    overscroll-behavior-x: contain;
  }
  .pg-grid {
    grid-template-columns: repeat(var(--pg-cols), minmax(var(--pg-min), 1fr));
    padding-bottom: 6px;
  }
  .pg-head {
    display: none;
  }
  .pg-cell-name {
    display: block;
  }
  .pg-label {
    position: sticky;
    left: 0;
    max-width: calc(100vw - 48px);
  }
  .pg-panel {
    height: max(90px, min(calc(var(--pg-h) * 0.7), calc(100cqw / var(--pg-ratio, 1))));
  }
}
</style>
