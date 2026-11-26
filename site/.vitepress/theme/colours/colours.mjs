// The colour variables of a drawing, read from the engine's one colour table (src/render/colors.ts), each with what it
// colours in English and Korean. The Colours pages and `npm run check` both read colourRows(), so a colour the engine
// adds, drops or changes cannot go unlisted or listed wrong.
import { COLORS } from '../../../../src/render/colors.ts';

const SERIES = Array.from({ length: 8 }, (_, i) => i + 1);

/** What each variable colours, keyed by the name after `--ursula-`. */
export const DESCRIPTIONS = {
  fg: { en: 'Names and body text', ko: '이름과 본문 글자' },
  muted: { en: 'Second lines and labels', ko: '둘째 줄과 라벨' },
  faint: { en: 'Text and marks that stand back', ko: '흐리게 보이는 글자와 표시' },
  line: { en: 'A line between boxes', ko: '상자 사이의 선' },
  border: { en: 'The outline of a box', ko: '상자 테두리' },
  hair: { en: 'Zone outlines, rules and grid lines', ko: '구역 테두리, 구분선, 격자선' },
  surface: { en: 'The face of a box and of the page', ko: '상자와 바탕의 면' },
  lane: { en: 'Filled bands: lanes, zones, head bands, tags', ko: '칠한 띠: 레인, 구역, 머리 띠, 태그' },
  'chip-fill': { en: 'Label chips and notes', ko: '라벨 칩과 노트' },
  accent: { en: 'The accent as a stroke or a text', ko: '강조 선과 글자' },
  'start-fill': { en: 'The face of a start box and of the highest bar', ko: '시작 상자와 가장 높은 막대의 면' },
  'accent-tint': { en: 'A pale accent face', ko: '옅은 강조 면' },
  'on-accent': { en: 'Text on the face of a start box', ko: '시작 상자 위의 글자' },
  bg: {
    en: 'The background of flowchart, class, state, ER, requirement, C4 and use case drawings',
    ko: 'flowchart, class, state, ER, requirement, C4, use case 그림의 배경',
  },
  panel: { en: 'The panel behind a chart', ko: '차트 뒤의 판' },
  bar: { en: 'A neutral bar of a chart', ko: '차트의 중립 막대' },
  'tint-outer': { en: 'The outermost boundary of a C4 drawing', ko: 'C4 그림의 가장 바깥 경계' },
  'tint-inner': { en: 'The innermost boundary of a C4 drawing', ko: 'C4 그림의 가장 안쪽 경계' },
  'tint-chip': { en: 'A label chip on a boundary fill', ko: '경계 면 위의 라벨 칩' },
  ...Object.fromEntries(
    SERIES.flatMap((n) => [
      [`s${n}`, { en: `Series ${n} of a chart`, ko: `차트의 계열 ${n}` }],
      [`s${n}-tint`, { en: `The pale area fill of series ${n}`, ko: `계열 ${n}의 옅은 면` }],
    ]),
  ),
};

/**
 * Every colour variable in the engine's order: `{ name, variable, light, dark, en, ko }`. Throws when a colour has no
 * description or a description names a colour the engine does not have.
 */
export function colourRows() {
  const names = Object.keys(COLORS);
  const undescribed = names.filter((n) => !DESCRIPTIONS[n]);
  const unknown = Object.keys(DESCRIPTIONS).filter((n) => !(n in COLORS));
  const problems = [
    ...(undescribed.length ? [`no description for ${undescribed.map((n) => `--ursula-${n}`).join(', ')}`] : []),
    ...(unknown.length ? [`described but not in src/render/colors.ts: ${unknown.map((n) => `--ursula-${n}`).join(', ')}`] : []),
  ];
  if (problems.length) throw new Error(`site/.vitepress/theme/colours/colours.mjs: ${problems.join('; ')}`);
  return names.map((name) => {
    const [light, dark] = COLORS[name];
    return { name, variable: `--ursula-${name}`, light, dark, ...DESCRIPTIONS[name] };
  });
}
