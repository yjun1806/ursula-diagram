// Mermaid text on the site is shown as a `mermaid` code block, which wraps long lines instead of scrolling sideways
// (custom.css). A fence without a language whose first line is a Mermaid header becomes a `mermaid` fence, so a page
// does not have to say so; scripts/check-playground.mjs uses the same test on the built pages.

const HEADER = new RegExp(
  `^(${[
    'flowchart', 'graph', 'sequenceDiagram', 'classDiagram(-v2)?', 'stateDiagram(-v2)?', 'erDiagram', 'gantt', 'pie',
    'journey', 'gitGraph', 'mindmap', 'timeline', 'C4(Context|Container|Component|Dynamic|Deployment)', 'quadrantChart',
    'xychart', 'sankey', 'block', 'packet', 'kanban', 'architecture', 'requirementDiagram', 'zenuml', 'radar', 'treemap',
    'treeView', 'venn', 'wardley', 'cynefin', 'ishikawa', 'eventmodeling', 'swimlane', 'usecase',
    'railroad(-abnf|-ebnf|-peg)?',
  ].join('|')})(-beta)?(\\s|$)`,
);

/** True when `text` starts like a Mermaid diagram: front matter and %% comments skipped, then a known header. */
export function isMermaid(text) {
  const body = text.replace(/^\s*---\n[\s\S]*?\n---[ \t]*(\n|$)/, '');
  const first = body.split('\n').map((l) => l.trim()).find((l) => l !== '' && !l.startsWith('%%'));
  return first !== undefined && HEADER.test(first);
}

/** A markdown-it plugin: an untagged fence of Mermaid text gets the `mermaid` language. */
export function mermaidFences(md) {
  md.core.ruler.after('block', 'ursula-mermaid-fence', (state) => {
    for (const token of state.tokens) {
      if (token.type === 'fence' && token.info.trim() === '' && isMermaid(token.content)) token.info = 'mermaid';
    }
  });
}
