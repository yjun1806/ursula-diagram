// The page's language for the site's own components. Every value here follows the route, so a component that stays
// mounted while the language menu switches pages (the home page's sections live in the layout and are not remounted)
// shows the new language at once. Read the language through these helpers, never once in setup().
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import { langOf } from './playground/strings.js';

/** 'ko' or 'en' for the page being shown, as a computed ref. */
export function useLang() {
  const { lang } = useData();
  return computed(() => langOf(lang.value));
}

/** The entry of a per-language table ({ en, ko }) for the page being shown, as a computed ref. */
export function useWords(table, code = useLang()) {
  return computed(() => table[code.value] ?? table.en);
}

/** A value that may be per-language ({ en, ko }) or the same in both, for the language `code`. */
export function pickLang(code, value) {
  return value && typeof value === 'object' ? value[code] ?? value.en : value;
}

/** A site path ('/guide/why') in the language `code`, with the site's base. */
export function localPath(code, path) {
  return withBase(`${code === 'ko' ? '/ko' : ''}${path}`);
}
