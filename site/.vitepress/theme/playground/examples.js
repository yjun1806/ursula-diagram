// The texts the playground offers: the home page's flowchart, the files in examples/ and the README gallery texts.
import { GALLERY_EN, GALLERY_KO } from './gallery-texts.js';
import { SOURCE as HOME_SOURCE } from '../home/sample.js';

const files = import.meta.glob('../../../../examples/*.mmd', { query: '?raw', import: 'default', eager: true });

function fromFile(name) {
  const entry = Object.entries(files).find(([path]) => path.endsWith(`/${name}`));
  return entry ? entry[1] : '';
}

const FILES = ['order-flow', 'login-sequence', 'checkout-sequence', 'c4-container', 'c4-deployment'];

const LABELS = {
  en: {
    home: 'Home page flowchart',
    'order-flow': 'Order flow', 'login-sequence': 'Login sequence', 'checkout-sequence': 'Checkout sequence',
    'c4-container': 'C4 container', 'c4-deployment': 'C4 deployment',
    flowchart: 'At a glance: flowchart', sequence: 'At a glance: sequence', class: 'At a glance: class',
    state: 'At a glance: state', er: 'At a glance: entity relationship', c4: 'At a glance: C4 context',
    gantt: 'At a glance: Gantt', mindmap: 'At a glance: mindmap',
    pie: 'Pie',
  },
  ko: {
    home: '첫 화면 flowchart',
    'order-flow': '주문 흐름', 'login-sequence': '로그인 sequence', 'checkout-sequence': '결제 sequence',
    'c4-container': 'C4 container', 'c4-deployment': 'C4 deployment',
    flowchart: '한눈에 보기: flowchart', sequence: '한눈에 보기: sequence', class: '한눈에 보기: class', state: '한눈에 보기: state',
    er: '한눈에 보기: ER', c4: '한눈에 보기: C4 context', gantt: '한눈에 보기: Gantt', mindmap: '한눈에 보기: mindmap',
    pie: 'pie',
  },
};

/**
 * The example list for a language ('en' or 'ko'); the Korean list uses the Korean gallery texts. The first entry is
 * the one the playground opens with: the home page's flowchart, whose Latin labels keep their columns in the terminal
 * tabs with any browser font.
 */
export function examplesFor(lang) {
  const labels = LABELS[lang] ?? LABELS.en;
  const gallery = lang === 'ko' ? GALLERY_KO : GALLERY_EN;
  return [
    { id: 'home', label: labels.home, src: HOME_SOURCE },
    ...FILES.map((id) => ({ id, label: `${labels[id]} (examples/${id}.mmd)`, src: fromFile(`${id}.mmd`) })),
    ...Object.keys(gallery).map((id) => ({ id, label: labels[id], src: gallery[id] })),
  ];
}
