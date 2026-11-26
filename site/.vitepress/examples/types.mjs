// The 35 folders of site/examples/official/: one per diagram type, each holding the code blocks of one page of the
// Mermaid documentation (MIT, see THIRD_PARTY_NOTICES.md), one example per file.

export const MERMAID_DOCS = 'https://mermaid.js.org/syntax/';

/** id: the folder name and the page path. doc: the Mermaid documentation page the examples come from. */
export const TYPES = [
  { id: 'architecture', en: 'Architecture', ko: '아키텍처', doc: 'architecture' },
  { id: 'block', en: 'Block', ko: '블록', doc: 'block' },
  { id: 'c4', en: 'C4', ko: 'C4', doc: 'c4' },
  { id: 'class', en: 'Class', ko: '클래스', doc: 'classDiagram' },
  { id: 'cynefin', en: 'Cynefin', ko: 'Cynefin', doc: 'cynefin' },
  { id: 'er', en: 'Entity relationship', ko: 'ER', doc: 'entityRelationshipDiagram' },
  { id: 'eventmodeling', en: 'Event Modeling', ko: '이벤트 모델링', doc: 'eventmodeling' },
  { id: 'flowchart', en: 'Flowchart', ko: '흐름도', doc: 'flowchart' },
  { id: 'gantt', en: 'Gantt', ko: '간트', doc: 'gantt' },
  { id: 'git', en: 'Git graph', ko: 'Git 그래프', doc: 'gitgraph' },
  { id: 'ishikawa', en: 'Ishikawa', ko: '이시카와', doc: 'ishikawa' },
  { id: 'kanban', en: 'Kanban', ko: '칸반', doc: 'kanban' },
  { id: 'mindmap', en: 'Mindmap', ko: '마인드맵', doc: 'mindmap' },
  { id: 'packet', en: 'Packet', ko: '패킷', doc: 'packet' },
  { id: 'pie', en: 'Pie', ko: '파이', doc: 'pie' },
  { id: 'quadrant-chart', en: 'Quadrant chart', ko: '사분면 차트', doc: 'quadrantChart' },
  { id: 'radar', en: 'Radar', ko: '레이더', doc: 'radar' },
  { id: 'railroad', en: 'Railroad', ko: '레일로드', doc: 'railroad' },
  { id: 'railroad-abnf', en: 'Railroad (ABNF)', ko: '레일로드(ABNF)', doc: 'railroad' },
  { id: 'railroad-ebnf', en: 'Railroad (EBNF)', ko: '레일로드(EBNF)', doc: 'railroad' },
  { id: 'railroad-peg', en: 'Railroad (PEG)', ko: '레일로드(PEG)', doc: 'railroad' },
  { id: 'requirement', en: 'Requirement', ko: '요구사항', doc: 'requirementDiagram' },
  { id: 'sankey', en: 'Sankey', ko: '생키', doc: 'sankey' },
  { id: 'sequence', en: 'Sequence', ko: '시퀀스', doc: 'sequenceDiagram' },
  { id: 'state', en: 'State', ko: '상태', doc: 'stateDiagram' },
  { id: 'swimlane', en: 'Swimlanes', ko: '스윔레인', doc: 'swimlanes' },
  { id: 'timeline', en: 'Timeline', ko: '타임라인', doc: 'timeline' },
  { id: 'tree-view', en: 'TreeView', ko: '트리 뷰', doc: 'treeView' },
  { id: 'treemap', en: 'Treemap', ko: '트리맵', doc: 'treemap' },
  { id: 'usecase', en: 'Use case', ko: '유스케이스', doc: 'usecase' },
  { id: 'user-journey', en: 'User journey', ko: '사용자 여정', doc: 'userJourney' },
  { id: 'venn', en: 'Venn', ko: '벤', doc: 'venn' },
  { id: 'wardley', en: 'Wardley map', ko: '워들리 맵', doc: 'wardley' },
  { id: 'xychart', en: 'XY chart', ko: 'XY 차트', doc: 'xyChart' },
  { id: 'zenuml', en: 'ZenUML', ko: 'ZenUML', doc: 'zenuml' },
];
