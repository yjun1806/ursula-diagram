export type CommitType = 'NORMAL' | 'REVERSE' | 'HIGHLIGHT';
export type Orientation = 'LR' | 'TB' | 'BT';

export interface Branch {
  name: string;
  /** Explicit `order:` of the branch, when given. */
  order?: number;
  /** Sequence number of the commit the branch forked from; absent when the branch started with no commit to fork from. */
  parent?: number;
  line: number;
}

export interface Commit {
  /** Position in the source order, starting at 0. */
  seq: number;
  id: string;
  branch: string;
  type: CommitType;
  tag?: string;
  kind: 'commit' | 'merge' | 'cherry-pick';
  /** Sequence numbers of the parents: the previous commit of the branch, and for a merge the head of the merged branch. */
  parents: number[];
  /** Merge commits: the merged branch. */
  mergedFrom?: string;
  /** Cherry-picks: the commit that was copied. */
  cherryOf?: number;
  line: number;
}

export interface GitConfig {
  showBranches: boolean;
  showCommitLabel: boolean;
  mainBranchName: string;
  mainBranchOrder: number;
  parallelCommits: boolean;
  rotateCommitLabel: boolean;
}

export interface GitGraph {
  orientation: Orientation;
  /** Branches in the order they were created; the first is the main branch. */
  branches: Branch[];
  commits: Commit[];
  config: GitConfig;
  title?: string;
  accTitle?: string;
}

/** Names of the branches in drawing order: first row (or column) first. */
export function displayOrder(graph: GitGraph): string[] {
  const { mainBranchName, mainBranchOrder } = graph.config;
  const mainFirst = mainBranchOrder === 0;
  const others = graph.branches.filter((b) => b.name !== mainBranchName);
  const plain = others.filter((b) => b.order === undefined);
  const ordered: { name: string; order: number; index: number }[] = others
    .filter((b) => b.order !== undefined)
    .map((b) => ({ name: b.name, order: b.order ?? 0, index: graph.branches.indexOf(b) }));
  if (!mainFirst) ordered.push({ name: mainBranchName, order: mainBranchOrder, index: -1 });
  ordered.sort((a, b) => a.order - b.order || a.index - b.index);
  return [...(mainFirst ? [mainBranchName] : []), ...plain.map((b) => b.name), ...ordered.map((o) => o.name)];
}

/** Sequence numbers of a commit and all its ancestors. */
export function ancestors(commits: readonly Commit[], seq: number): Set<number> {
  const seen = new Set<number>();
  const todo = [seq];
  while (todo.length > 0) {
    const next = todo.pop();
    if (next === undefined || seen.has(next)) continue;
    seen.add(next);
    for (const p of commits[next]?.parents ?? []) todo.push(p);
  }
  return seen;
}
