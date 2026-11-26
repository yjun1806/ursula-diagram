// The roadmap pages list the open GitHub issues labelled `roadmap` under Planned and In progress. This reads the issue
// numbers each page lists there (not under Done, which links closed issues) and asks GitHub which roadmap issues are open, so the check can say when they drift.
const REPO = 'yjun1806/ursula-diagram';
const LISTED = new Set(['Planned', 'In progress', '계획', '진행 중']);

/** Issue numbers linked under the Planned and In progress headings of a roadmap page. */
export function listedIssues(markdown) {
  const numbers = new Set();
  let inList = false;
  for (const line of markdown.split('\n')) {
    const heading = /^## (.+?)\s*$/.exec(line);
    if (heading) inList = LISTED.has(heading[1]);
    else if (inList) for (const m of line.matchAll(/github\.com\/yjun1806\/ursula-diagram\/issues\/(\d+)/g)) numbers.add(Number(m[1]));
  }
  return numbers;
}

/**
 * The numbers of the open issues labelled `roadmap`, or `{ skipped: reason }` when GitHub cannot be asked (no network,
 * a rate limit, a timeout). Uses GITHUB_TOKEN when it is set, which CI passes to stay clear of the anonymous rate limit.
 */
export async function openRoadmapIssues() {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'ursula-diagram-site-check' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const url = `https://api.github.com/repos/${REPO}/issues?labels=roadmap&state=open&per_page=100`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { skipped: `GitHub answered ${res.status}` };
    const issues = await res.json();
    return { open: new Set(issues.filter((i) => !i.pull_request).map((i) => i.number)) };
  } catch (error) {
    return { skipped: `GitHub could not be reached (${error.cause?.code ?? error.name})` };
  }
}
