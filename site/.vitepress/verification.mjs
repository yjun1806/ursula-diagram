// Search console ownership tokens. Each is the content of the meta tag the console asks for; an empty one adds no tag.
// These tokens are public by design (they sit in every page's head), so they are not secrets.

/** Google Search Console: the content of <meta name="google-site-verification">. */
export const GOOGLE_SITE_VERIFICATION = '';

/** Naver Search Advisor: the content of <meta name="naver-site-verification">. */
export const NAVER_SITE_VERIFICATION = '';

/** The verification meta tags for the site head: one per token that is set. */
export function verificationHead() {
  return [
    ['google-site-verification', GOOGLE_SITE_VERIFICATION],
    ['naver-site-verification', NAVER_SITE_VERIFICATION],
  ]
    .filter(([, content]) => content.trim() !== '')
    .map(([name, content]) => ['meta', { name, content: content.trim() }]);
}
