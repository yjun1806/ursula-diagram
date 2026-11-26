// The picture grids next to the speed numbers, read by PicGrid.vue. One grid: { columns, rows, minColumn }, where a
// row is { label, href, height, cells, note } and a cell is { src, facts } or { none }. Words are { en, ko }.
// Where the pictures come from:
// - skill: the first of two runs per text of the skill experiment (the time and tokens are the mean of both runs),
//   measured on 26 November 2026 in Claude Code with claude-opus-5-5. The skill's pages were saved as 2× PNG with
//   headless Chrome and scaled to 1600 px wide; ursula's are the SVGs that run wrote. ursula's time and tokens are
//   from the runs measured again later that day with the skill at commit 8c8222c, which wrote byte-identical SVGs.
// - mermaid: ursula's from this site's engine at build time (scripts/render-examples.mjs); Mermaid's from Mermaid.js
//   12.3.0 in headless Chrome, the page the home-page timing ran in, saved as SVG with a width and height added.
// - tools: TOOLS_EXAMPLE drawn by every tool with a bar in the speed chart, the versions of the Compared page, at
//   their defaults and at TOOLS_WIDTH columns; the terminal texts are drawn as text-svg by scripts/render-compare.mjs.
// - side: the six examples of the Compared page (public/compare/<tool>-<type>-<example>.svg).

export const TOOLS_EXAMPLE = '101-flowcharts';
export const TOOLS_WIDTH = 100;

const INPUTS = 'https://github.com/yjun1806/ursula-diagram/blob/main/examples/';

const w = (en, ko) => ({ en, ko });

const skillRow = (id, label, skill, ursula, note) => ({
  label,
  href: `${INPUTS}${id}.mmd`,
  height: 640,
  cells: [
    { src: `/compare/skill/${id}-skill.png`, facts: skill },
    { src: `/compare/skill/${id}-ursula.svg`, facts: ursula },
  ],
  note,
});

const BOTH_COMPLETE = w('Both kept every box, line and label of the input.', '두 그림 모두 입력의 상자·선·라벨을 하나도 빼지 않았습니다.');
const SAME_TWICE = w('The two runs gave byte-identical SVGs.', '두 번 그린 SVG가 바이트 단위까지 같았습니다.');

const SKILL = {
  minColumn: 150,
  columns: [w('A skill that has the model lay out the drawing', '모델이 배치를 정하는 스킬'), w('ursula skill', 'ursula 스킬')],
  named: [w('diagram-design', 'diagram-design'), w('ursula', 'ursula')],
  rows: [
    skillRow(
      'order-flow',
      w('Flowchart: order-flow, 9 nodes, 8 edges, 2 groups', 'Flowchart: order-flow, 노드 9·간선 8·구역 2'),
      [
        w('71 s · 387k tokens', '71초 · 토큰 387k'),
        w('0 bends, 0 crossings (counted by eye)', '꺾임 0·교차 0(눈으로 셈)'),
        w('Added text not in the input: the title “Order fulfilment flow”, the line “SWIMLANE · DIAGRAM DESIGN”, the legend “Focal step (payment gate)” and “Paid handoff to warehouse”.', '입력에 없는 글을 더했습니다: 제목 「Order fulfilment flow」, 윗줄 「SWIMLANE · DIAGRAM DESIGN」, 범례 「Focal step (payment gate)」·「Paid handoff to warehouse」.'),
        w('The two runs differ: lanes here, group boxes in the other run.', '두 번 그린 그림이 다릅니다: 이 판은 가로 띠, 다른 판은 구역 상자입니다.'),
      ],
      [
        w('13 s · 51k tokens', '13초 · 토큰 51k'),
        w('0 bends, 0 crossings (engine check)', '꺾임 0·교차 0(엔진 점검)'),
        SAME_TWICE,
        w('Flaw: the thick “paid” line (==>) is drawn as thin as the others, and the legend shows Flow and Request alike.', '결함: 굵은 「paid」 선(==>)이 다른 선과 같은 굵기로 그려지고, 범례의 Flow와 Request가 같은 모양입니다.'),
      ],
      BOTH_COMPLETE,
    ),
    skillRow(
      'c4-container',
      w('C4 container: c4-container, 7 elements, 10 relations, 1 boundary', 'C4 container: c4-container, 요소 7·관계 10·경계 1'),
      [
        w('164 s · 525k tokens', '164초 · 토큰 525k'),
        w('8 bends, 0 crossings (counted by eye)', '꺾임 8·교차 0(눈으로 셈)'),
        w('Added text not in the input: the line “ARCHITECTURE · C4 CONTAINER” and the legend “Focal: API hub”; it chose API Application to highlight.', '입력에 없는 글을 더했습니다: 윗줄 「ARCHITECTURE · C4 CONTAINER」, 범례 「Focal: API hub」. 강조할 상자로 API Application을 골랐습니다.'),
        w('The two runs differ: the other run has 4 bends.', '두 번 그린 그림이 다릅니다: 다른 판은 꺾임이 4입니다.'),
      ],
      [
        w('20 s · 57k tokens', '20초 · 토큰 57k'),
        w('7 bends, 0 crossings (engine check)', '꺾임 7·교차 0(엔진 점검)'),
        SAME_TWICE,
        w('Flaw: macro names such as Container_Boundary and ContainerDb_Ext show as box tags.', '결함: Container_Boundary, ContainerDb_Ext 같은 매크로 이름이 상자 꼬리표에 그대로 나옵니다.'),
      ],
      BOTH_COMPLETE,
    ),
    skillRow(
      'checkout-sequence',
      w('Sequence: checkout-sequence, 4 participants, 10 messages, 4 blocks', 'Sequence: checkout-sequence, 참여자 4·메시지 10·블록 4'),
      [
        w('152 s · 529k tokens', '152초 · 토큰 529k'),
        w('Added text not in the input: the title “Checkout: stock and payment in parallel”, the line “SEQUENCE · DIAGRAM DESIGN”, the tags APP, EXT and STORE, the legend “Headline success”.', '입력에 없는 글을 더했습니다: 제목 「Checkout: stock and payment in parallel」, 윗줄 「SEQUENCE · DIAGRAM DESIGN」, 꼬리표 APP·EXT·STORE, 범례 「Headline success」.'),
        w('Message 8 is a dashed reply (-->>) in the input; this run draws it solid.', '입력에서 메시지 8은 점선 응답(-->>)인데, 이 판은 실선으로 그렸습니다.'),
        w('The two runs differ: the other run draws message 8 dashed.', '두 번 그린 그림이 다릅니다: 다른 판은 메시지 8을 점선으로 그렸습니다.'),
      ],
      [w('14 s · 46k tokens', '14초 · 토큰 46k'), SAME_TWICE],
      BOTH_COMPLETE,
    ),
  ],
};

/** The three flowcharts with the most edges among the 116 (7, 6, 5; ties to the lower file number; 08 repeats 07). */
const MERMAID_EXAMPLES = [
  ['101-flowcharts', 340],
  ['07-with-the-defaults', 200],
  ['90-step-by-step-flow-animation', 120],
];

const MERMAID = {
  minColumn: 150,
  columns: [w('ursula-diagram', 'ursula-diagram'), w('Mermaid.js 12.3.0', 'Mermaid.js 12.3.0')],
  rows: MERMAID_EXAMPLES.map(([name, height]) => ({
    label: w(`Flowchart: ${name}`, `Flowchart: ${name}`),
    href: `/examples/flowchart#${name}`,
    height,
    cells: [{ src: `/example-svg/flowchart/${name}.svg` }, { src: `/compare/home/mermaid-${name}.svg` }],
  })),
};

const NO_SVG = w('No SVG output', 'SVG 출력 없음');
const NO_TEXT = w('No terminal output', '터미널 출력 없음');
const TOOLS = {
  minColumn: 200,
  columns: ['ursula', 'mermaid-cli', 'Pele', 'beautiful-mermaid', 'mmdflux', 'mermaid-ascii', 'termaid'].map((n) => w(n, n)),
  rows: [
    {
      label: w(`SVG: ${TOOLS_EXAMPLE}`, `SVG: ${TOOLS_EXAMPLE}`),
      href: `/examples/flowchart#${TOOLS_EXAMPLE}`,
      height: 340,
      cells: [
        { src: `/example-svg/flowchart/${TOOLS_EXAMPLE}.svg` },
        { src: `/compare/tools/${TOOLS_EXAMPLE}-mermaid-cli.svg` },
        { src: `/compare/tools/${TOOLS_EXAMPLE}-pele.svg` },
        { src: `/compare/tools/${TOOLS_EXAMPLE}-beautiful-mermaid.svg` },
        { src: `/compare/tools/${TOOLS_EXAMPLE}-mmdflux.svg` },
        { none: NO_SVG },
        { none: NO_SVG },
      ],
    },
    {
      label: w(`Terminal text at ${TOOLS_WIDTH} columns: ${TOOLS_EXAMPLE}`, `터미널 글자 그림, ${TOOLS_WIDTH}열: ${TOOLS_EXAMPLE}`),
      href: `/examples/flowchart#${TOOLS_EXAMPLE}`,
      height: 340,
      cells: [
        { src: `/compare-term/${TOOLS_EXAMPLE}-ursula.svg` },
        { none: NO_TEXT },
        { none: NO_TEXT },
        { src: `/compare-term/${TOOLS_EXAMPLE}-beautiful-mermaid.svg` },
        { src: `/compare-term/${TOOLS_EXAMPLE}-mmdflux.svg` },
        { src: `/compare-term/${TOOLS_EXAMPLE}-mermaid-ascii.svg` },
        { src: `/compare-term/${TOOLS_EXAMPLE}-termaid.svg` },
      ],
    },
  ],
};

const SIDE_EXAMPLES = [
  ['flowchart', w('Flowchart', 'flowchart'), '100-subgraphs-2', 300],
  ['sequence', w('Sequence', 'sequence'), '02-with-the-defaults', 420],
  ['class', w('Class', 'class'), '02-with-the-defaults', 360],
  ['er', w('Entity relationship', 'ER'), '02-entity-relationship-diagrams-2', 420],
  ['c4', w('C4 system context', 'C4 system context'), '02-c4-system-context-diagram', 460],
  ['pie', w('Pie', 'pie'), '02-example', 300],
];
const NOT_DRAWN = w('Does not draw this type', '이 유형은 그리지 않습니다');
const SIDE = {
  minColumn: 220,
  columns: ['ursula', 'Mermaid', 'Pele', 'beautiful-mermaid'].map((n) => w(n, n)),
  rows: SIDE_EXAMPLES.map(([type, name, example, height]) => ({
    label: w(`${name.en}: ${example}`, `${name.ko}: ${example}`),
    href: `/examples/${type}#${example}`,
    height,
    cells: ['ursula', 'mermaid', 'pele', 'beautiful-mermaid'].map((tool) =>
      tool === 'beautiful-mermaid' && (type === 'c4' || type === 'pie')
        ? { none: NOT_DRAWN }
        : { src: `/compare/${tool}-${type}-${example}.svg` },
    ),
  })),
};

export const GRIDS = { skill: SKILL, mermaid: MERMAID, tools: TOOLS, side: SIDE };

/** Every picture the grids show, for scripts/render-compare.mjs to size. */
export const PICTURE_PATHS = [
  ...new Set(
    Object.values(GRIDS)
      .flatMap((g) => g.rows.flatMap((r) => r.cells))
      .filter((c) => c.src)
      .map((c) => c.src),
  ),
];
