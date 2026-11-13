// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { cellRuler, pixelRuler, render, renderText, UrsulaError } from '../src/index.ts';
import type { Scene, SceneText } from '../src/index.ts';
import { layoutTreeView } from '../src/treeview/layout.ts';
import { parseTreeView } from '../src/treeview/parse.ts';

const EXAMPLES: Array<[string, string]> = [
  ["01-box-drawing-input", `treeView-beta
├── src/
│   ├── index.ts
│   └── utils.ts
├── package.json
└── README.md`],
  ["02-box-drawing-input", `treeView-beta
├── src/
│   ├── App.tsx :::highlight icon(logos:react) ## main component
│   └── index.ts ## entry point
├── .env ## environment variables
├── Dockerfile
└── package.json`],
  ["03-box-drawing-input", `treeView-beta
├── packages/
│   ├── mermaid/
│   │   ├── src/
│   │   │   ├── parser.ts
│   │   │   └── renderer.ts
│   │   └── package.json
│   └── parser/
│       └── src/
└── README.md`],
  ["04-highlighting-with-class", `treeView-beta
    src/
        App.tsx :::highlight
        index.js
    package.json`],
  ["05-inline-descriptions-with", `treeView-beta
    src/
        index.js ## app entry point
        config.ts ## runtime configuration
    package.json ## project manifest`],
  ["06-icons", `---
config:
  treeView:
    showIcons: true
---
treeView-beta
    src/
        index.js
    package.json`],
  ["07-file-type-icons-via-config-maps", `---
config:
  treeView:
    showIcons: true
    defaultIconPack: material-icon-theme
    filenameIcons:
      Dockerfile: docker
    extensionIcons:
      .ts: typescript
      .tsx: react-ts
      .txt: none
---
treeView-beta
    src/
        App.tsx
        utils.ts
    Dockerfile
    notes.txt
    README.md`],
  ["08-icon-overrides-with-icon", `treeView-beta
    src/
        App.tsx icon(logos:react)
        index.js
    package.json`],
  ["09-hiding-icons", `---
config:
  treeView:
    showIcons: true
---
treeView-beta
    src/
        index.js icon(none)
    package.json`],
  ["10-combined-annotations", `treeView-beta
    my-project/
        src/
            App.tsx :::highlight icon(logos:react) ## main component
            index.js ## entry point
        .env ## environment variables
        Dockerfile
        package.json`],
  ["11-examples", `treeView-beta
    "packages"
        "mermaid"
            "src"
        "parser"`],
  ["12-examples", `treeView-beta
    🚀 rocket-app/
        📦 packages/
            🎨 ui/
            🛠️ utils/
        🧪 tests/
        📝 README.md
        ⚙️ config.yaml`],
  ["13-examples", `---
config:
    treeView:
        rowIndent: 80
        lineThickness: 3
    themeVariables:
        treeView:
            labelFontSize: '20px'
            labelColor: '#FF0000'
            lineColor: '#00FF00'
---
treeView-beta
    "packages"
        "mermaid"
            "src"
        "parser"`],
];
const THEMES = ['solid', 'outline', 'card'] as const;
const example = (n: string): string => EXAMPLES.find(([name]) => name.startsWith(n))?.[1] ?? '';
/** The example without its configuration header, as the registry hands it to a front-end. */
const body = (n: string): string => example(n).replace(/^---[\s\S]*?---\n/, '');

const sample = `treeView-beta
    my-project/
        src/
            components/
                Button.tsx
                Header.tsx
            App.tsx
            index.js
        .gitignore
        package.json
        README.md`;

describe('tree view svg', () => {
  for (const [name, src] of EXAMPLES) {
    it(`draws ${name} in three themes`, () => {
      for (const theme of THEMES) {
        const svg = render(src, { theme });
        expect(svg).toContain(`data-theme="${theme}"`);
        expect(svg).toContain('<svg');
      }
    });
  }

  it('draws a source with a configuration header as a tree view', () => {
    expect(render(example('06'))).toContain('package.json');
  });

  it('indents by the configured row indent', () => {
    const svg = render(example('13'));
    expect(svg).toContain('x="104"');
    expect(svg).toContain('x="184"');
  });
});

describe('tree view reading', () => {
  it('reads box-drawing input by column', () => {
    const tree = parseTreeView(example('03'));
    expect(tree.items.map((i) => [i.depth, i.label])).toEqual([
      [0, 'packages/'],
      [1, 'mermaid/'],
      [2, 'src/'],
      [3, 'parser.ts'],
      [3, 'renderer.ts'],
      [2, 'package.json'],
      [1, 'parser/'],
      [2, 'src/'],
      [0, 'README.md'],
    ]);
  });

  it('reads annotations in any order', () => {
    const [first, second] = parseTreeView(example('10')).items.slice(2, 4);
    expect(first).toMatchObject({ label: 'App.tsx', highlight: true, icon: 'logos:react', description: 'main component', depth: 2 });
    expect(second).toMatchObject({ label: 'index.js', description: 'entry point', highlight: false });
  });

  it('reads quoted names and emoji', () => {
    expect(parseTreeView(example('11')).items.map((i) => [i.depth, i.label])).toEqual([[0, 'packages'], [1, 'mermaid'], [2, 'src'], [1, 'parser']]);
    expect(parseTreeView(example('12')).items.map((i) => i.label)).toContain('🚀 rocket-app/');
  });

  it('marks a trailing slash as a folder', () => {
    const items = parseTreeView(example('01')).items;
    expect(items.map((i) => i.folder)).toEqual([true, false, false, false, false]);
  });

  it('ignores comments', () => {
    const tree = parseTreeView('%%{init: {}}%%\ntreeView-beta\n  a/\n    %% skipped\n    b');
    expect(tree.items.map((i) => i.label)).toEqual(['a/', 'b']);
  });
});

function texts(scene: Scene): SceneText[] {
  return scene.items.filter((i): i is SceneText => i.kind === 'text');
}

describe('tree view layout', () => {
  const ruler = pixelRuler();
  const model = parseTreeView(sample);

  for (const theme of THEMES) {
    it(`puts one item on each 28 px row and indents 28 per level (${theme})`, () => {
      const { scene, columns, centres } = layoutTreeView(model, ruler, theme);
      expect(scene.height).toBe(48 + 28 * model.items.length);
      model.items.forEach((item, i) => {
        expect(columns[i]).toBe(24 + 28 * item.depth);
        expect(centres[i]).toBe(38 + 28 * i);
      });
    });
  }

  it('bends a guide by half the theme bend radius (the whole radius when it is 8 or less), at the last child only', () => {
    for (const [theme, half] of [['solid', 8], ['outline', 6], ['card', 7], ['band', 8]] as const) {
      const guides = layoutTreeView(model, ruler, theme).scene.items.filter((i) => i.kind === 'path');
      const bent = guides.filter((g) => g.kind === 'path' && g.d.includes('Q'));
      expect(bent).toHaveLength(3);
      expect(bent.map((g) => (g.kind === 'path' ? g.d : ''))).toContain(`M28 50 V${38 + 28 * 9 - half} Q28 ${38 + 28 * 9} ${28 + half} ${38 + 28 * 9} H44`);
    }
  });

  it('keeps the guides of a deeper indent clear of the text', () => {
    const { scene } = layoutTreeView({ ...parseTreeView(body('13')), rowIndent: 80 }, ruler);
    expect(scene.items.some((i) => i.kind === 'path' && i.d.includes('H'))).toBe(true);
    expect(texts(scene).map((t) => t.x)).toEqual([24, 104, 184, 104]);
  });

  it('keeps every text inside the drawing and clear of the others', () => {
    for (const [, src] of EXAMPLES) {
      const { scene } = layoutTreeView(parseTreeView(src.replace(/^---[\s\S]*?---\n/, '')), ruler);
      const boxes = texts(scene).map((t) => {
        const role = t.role?.includes('name') ? 'title' : 'line';
        return { x: t.x, y: t.y, w: ruler.textWidth(t.text, role) };
      });
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(scene.width);
        expect(b.y + 8).toBeLessThanOrEqual(scene.height);
      }
      boxes.forEach((a, i) =>
        boxes.slice(i + 1).forEach((b) => {
          if (a.y !== b.y) return;
          expect(a.x + a.w <= b.x || b.x + b.w <= a.x).toBe(true);
        }),
      );
    }
  });

  it('draws every label and description', () => {
    const { scene } = layoutTreeView(parseTreeView(example('10')), ruler);
    const all = texts(scene).map((t) => t.text);
    expect(all).toContain('main component');
    expect(all).toContain('.env');
  });

  it('makes the drawing width a multiple of four', () => {
    for (const [, src] of EXAMPLES) expect(layoutTreeView(parseTreeView(src.replace(/^---[\s\S]*?---\n/, '')), ruler).scene.width % 4).toBe(0);
  });

  it('sets folders in the name role and files in the body role', () => {
    const [folder, file] = texts(layoutTreeView(model, ruler).scene);
    expect(folder?.role).toEqual(['name']);
    expect(layoutTreeView(model, ruler).scene.items.find((i) => i.kind === 'text' && i.text === 'README.md')).toMatchObject({ role: ['body'] });
    expect(file?.role).toEqual(['name']);
  });
});

describe('tree view text', () => {
  const draw = (src: string, width = 80): string => {
    const r = renderText(src, width);
    if ('error' in r) throw new Error(r.error);
    return r.lines.join('\n');
  };

  it('draws a single root with branch characters', () => {
    expect(draw(sample)).toBe(
      [
        'my-project/',
        '├── src/',
        '│   ├── components/',
        '│   │   ├── Button.tsx',
        '│   │   └── Header.tsx',
        '│   ├── App.tsx',
        '│   └── index.js',
        '├── .gitignore',
        '├── package.json',
        '└── README.md',
      ].join('\n'),
    );
  });

  it('keeps the connectors of top-level items when there are several', () => {
    expect(draw(example('01'))).toBe(['├── src/', '│   ├── index.ts', '│   └── utils.ts', '├── package.json', '└── README.md'].join('\n'));
  });

  it('adds the description after the name', () => {
    expect(draw(example('05'))).toContain('index.js  # app entry point');
  });

  it('cuts to the width limit', () => {
    for (const line of draw(sample, 14).split('\n')) expect(cellRuler().textWidth(line, 'line')).toBeLessThanOrEqual(14);
  });
});

describe('tree view errors', () => {
  const lineOf = (src: string): number | undefined => {
    try {
      parseTreeView(src);
    } catch (err) {
      if (err instanceof UrsulaError) return err.line;
      throw err;
    }
    return undefined;
  };

  it('reports an item two levels deeper than the line above', () => {
    expect(lineOf('treeView-beta\n  a/\n    b/\n          c')).toBe(4);
  });

  it('reports an indent that matches no level', () => {
    expect(lineOf('treeView-beta\n  a/\n      b/\n    c')).toBe(4);
  });

  it('reports a wrong header and an empty tree', () => {
    expect(lineOf('graph TD\n  a')).toBe(1);
    expect(() => parseTreeView('treeView-beta')).toThrow(UrsulaError);
  });

  it('reports a box-drawing jump', () => {
    expect(lineOf('treeView-beta\n├── a/\n│   │   │   └── b')).toBe(3);
  });
});

describe('tree view icons', () => {
  /** The icon drawn on each line, by source line number; lines without an icon are left out. */
  const icons = (svg: string): Record<string, string> =>
    Object.fromEntries([...svg.matchAll(/<path class="ursula-faint"[^>]*data-icon="(\w+)" data-line="(\d+)"/g)].map((m) => [m[2] ?? '', m[1] ?? '']));

  it('draws the built-in folder and file icons when showIcons is set', () => {
    expect(icons(render(example('06')))).toEqual({ '7': 'folder', '8': 'file', '9': 'file' });
  });

  it('draws no icon when showIcons is off and no item asks for one', () => {
    expect(icons(render(example('01')))).toEqual({});
  });

  it('draws an icon an item asks for with icon() even when showIcons is off', () => {
    expect(icons(render(example('08')))).toEqual({ '3': 'file' });
  });

  it('hides the icon of an item marked icon(none)', () => {
    expect(icons(render(example('09')))).toEqual({ '7': 'folder', '9': 'file' });
  });

  it('hides the icon of a file whose extension maps to none', () => {
    const drawn = icons(render(example('07')));
    expect(Object.keys(drawn)).toHaveLength(5);
    expect(drawn['18']).toBeUndefined();
  });

  it('starts the text of an item with an icon past the icon', () => {
    const svg = render(example('06'));
    expect(svg).toMatch(/<text class="ursula-name ursula-start" x="44"[^>]*>src\/</);
  });
});

describe('tree view highlight', () => {
  it('stops a guide 8 before the highlight behind a child', () => {
    for (const n of ['02', '04', '10']) {
      const { scene } = layoutTreeView(parseTreeView(body(n)), pixelRuler());
      const marks = scene.items.filter((i) => i.kind === 'box' && i.role?.includes('active'));
      for (const m of marks) {
        if (m.kind !== 'box') continue;
        const line = m.data?.['line'];
        const guide = scene.items.find((i) => i.kind === 'path' && i.data?.['to'] === line);
        const end = Number(/H(-?[\d.]+)$/.exec(guide?.kind === 'path' ? guide.d : '')?.[1]);
        expect(m.x - end).toBeGreaterThanOrEqual(8);
      }
    }
  });
});
