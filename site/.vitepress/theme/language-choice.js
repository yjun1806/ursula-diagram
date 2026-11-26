// Remembers the language a visitor picks in the language menu, so the redirect in the page head stops for good,
// and carries the playground's hash (its drawing) over to the other language. The listener runs in the capture phase
// on the document, before VitePress's router (a bubbling listener on window) reads the link, so the choice is stored
// before the switch starts. The redirect runs only on a full page load, never on the router's switch.

const MENUS = '.VPNavBarTranslations a, .VPNavScreenTranslations a, .VPNavBarExtra .translations a';

export function watchLanguageChoice(base) {
  document.addEventListener(
    'click',
    (event) => {
      const link = event.target instanceof Element ? event.target.closest(MENUS) : null;
      if (!link) return;
      const url = new URL(link.href, location.href);
      const lang = url.pathname.startsWith(`${base}ko/`) || url.pathname === `${base}ko` ? 'ko' : 'en';
      try {
        localStorage.setItem('ursula-lang', lang);
      } catch {
        // No storage: the choice holds for this visit only.
      }
      if (location.hash && /\/playground$/.test(location.pathname) && /\/playground$/.test(url.pathname)) {
        link.href = url.pathname + location.hash;
        try {
          // The router may have read the link already; the playground picks the drawing up from here then.
          sessionStorage.setItem('ursula-carry-hash', location.hash);
        } catch {
          // Without storage the other language opens on its first example.
        }
      }
    },
    true,
  );
}
