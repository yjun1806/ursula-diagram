// The texts the playground offers: the files in examples/ and the Mermaid text of the README gallery.
import { GALLERY_EN, GALLERY_KO } from './gallery-texts.js';

const files = import.meta.glob('../../../../examples/*.mmd', { query: '?raw', import: 'default', eager: true });

function fromFile(name) {
  const entry = Object.entries(files).find(([path]) => path.endsWith(`/${name}`));
  return entry ? entry[1] : '';
}

const FILES = ['order-flow', 'login-sequence', 'checkout-sequence', 'c4-container', 'c4-deployment'];

const LABELS = {
  en: {
    'order-flow': 'Order flow', 'login-sequence': 'Login sequence', 'checkout-sequence': 'Checkout sequence',
    'c4-container': 'C4 container', 'c4-deployment': 'C4 deployment',
    flowchart: 'Gallery: flowchart', sequence: 'Gallery: sequence', class: 'Gallery: class', state: 'Gallery: state',
    er: 'Gallery: entity relationship', c4: 'Gallery: C4 context', gantt: 'Gallery: Gantt', mindmap: 'Gallery: mindmap',
    pie: 'Pie',
  },
  ko: {
    'order-flow': '주문 흐름', 'login-sequence': '로그인 시퀀스', 'checkout-sequence': '결제 시퀀스',
    'c4-container': 'C4 컨테이너', 'c4-deployment': 'C4 배포',
    flowchart: '그림 모음: 흐름도', sequence: '그림 모음: 시퀀스', class: '그림 모음: 클래스', state: '그림 모음: 상태',
    er: '그림 모음: ER', c4: '그림 모음: C4 컨텍스트', gantt: '그림 모음: 간트', mindmap: '그림 모음: 마인드맵',
    pie: '파이',
  },
};

/** The example list for a language ('en' or 'ko'); the Korean list uses the Korean gallery texts. */
export function examplesFor(lang) {
  const labels = LABELS[lang] ?? LABELS.en;
  const gallery = lang === 'ko' ? GALLERY_KO : GALLERY_EN;
  return [
    ...FILES.map((id) => ({ id, label: `${labels[id]} (examples/${id}.mmd)`, src: fromFile(`${id}.mmd`) })),
    ...Object.keys(gallery).map((id) => ({ id, label: labels[id], src: gallery[id] })),
  ];
}
