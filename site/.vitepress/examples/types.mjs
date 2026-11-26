// The 35 folders of site/examples/official/: one per diagram type, each holding the code blocks of one page of the
// Mermaid documentation (MIT, see THIRD_PARTY_NOTICES.md), one example per file.

export const MERMAID_DOCS = 'https://mermaid.js.org/syntax/';

/**
 * id: the folder name and the page path. name: the Mermaid name of the type, shown in both languages so readers see the
 * name they type. doc: the Mermaid documentation page the examples come from. term: what the terminal drawing is when
 * it is not a picture ('table', 'list' or 'rules').
 */
export const TYPES = [
  { id: 'architecture', name: 'Architecture', doc: 'architecture' },
  { id: 'block', name: 'Block', doc: 'block' },
  { id: 'c4', name: 'C4', doc: 'c4' },
  { id: 'class', name: 'Class', doc: 'classDiagram' },
  { id: 'cynefin', name: 'Cynefin', doc: 'cynefin', term: 'table' },
  { id: 'er', name: 'Entity relationship', doc: 'entityRelationshipDiagram' },
  { id: 'eventmodeling', name: 'Event Modeling', doc: 'eventmodeling' },
  { id: 'flowchart', name: 'Flowchart', doc: 'flowchart' },
  { id: 'gantt', name: 'Gantt', doc: 'gantt' },
  { id: 'git', name: 'Git graph', doc: 'gitgraph' },
  { id: 'ishikawa', name: 'Ishikawa', doc: 'ishikawa' },
  { id: 'kanban', name: 'Kanban', doc: 'kanban' },
  { id: 'mindmap', name: 'Mindmap', doc: 'mindmap' },
  { id: 'packet', name: 'Packet', doc: 'packet' },
  { id: 'pie', name: 'Pie', doc: 'pie', term: 'table' },
  { id: 'quadrant-chart', name: 'Quadrant chart', doc: 'quadrantChart', term: 'table' },
  { id: 'radar', name: 'Radar', doc: 'radar', term: 'table' },
  { id: 'railroad', name: 'Railroad', doc: 'railroad', term: 'rules' },
  { id: 'railroad-abnf', name: 'Railroad (ABNF)', doc: 'railroad', term: 'rules' },
  { id: 'railroad-ebnf', name: 'Railroad (EBNF)', doc: 'railroad', term: 'rules' },
  { id: 'railroad-peg', name: 'Railroad (PEG)', doc: 'railroad', term: 'rules' },
  { id: 'requirement', name: 'Requirement', doc: 'requirementDiagram' },
  { id: 'sankey', name: 'Sankey', doc: 'sankey', term: 'table' },
  { id: 'sequence', name: 'Sequence', doc: 'sequenceDiagram' },
  { id: 'state', name: 'State', doc: 'stateDiagram' },
  { id: 'swimlane', name: 'Swimlanes', doc: 'swimlanes' },
  { id: 'timeline', name: 'Timeline', doc: 'timeline', term: 'list' },
  { id: 'tree-view', name: 'TreeView', doc: 'treeView' },
  { id: 'treemap', name: 'Treemap', doc: 'treemap' },
  { id: 'usecase', name: 'Use case', doc: 'usecase' },
  { id: 'user-journey', name: 'User journey', doc: 'userJourney', term: 'table' },
  { id: 'venn', name: 'Venn', doc: 'venn', term: 'list' },
  { id: 'wardley', name: 'Wardley map', doc: 'wardley', term: 'table' },
  { id: 'xychart', name: 'XY chart', doc: 'xyChart', term: 'table' },
  { id: 'zenuml', name: 'ZenUML', doc: 'zenuml' },
];
