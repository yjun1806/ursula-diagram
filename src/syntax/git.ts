import type { SyntaxEntry } from './entry.ts';

export const git: SyntaxEntry = {
  name: "git",
  headers: ["gitGraph"],
  aliases: ["gitGraph:", "gitgraph", "gitgraph:", "GitGraph", "GitGraph:"],
  summary: "branches, commits and merges",
  example: `gitGraph
  commit
  branch feature
  checkout feature
  commit id: "parser"
  commit
  checkout main
  merge feature tag: "v1.0"
  commit`,
  rules: [
    "commit adds a commit to the current branch; id: \"x\", tag: \"v1\", type: HIGHLIGHT name it.",
    "branch name starts a branch and moves to it; checkout (or switch) moves.",
    "merge name merges that branch into the current one.",
    "cherry-pick id: \"x\" copies a commit.",
    "The first branch is main.",
  ],
  keywords: ["commit", "branch", "checkout", "switch", "merge", "cherry-pick"],
};
