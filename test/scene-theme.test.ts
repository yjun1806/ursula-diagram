import { describe, expect, it } from 'vitest';
import { renderThemedScene } from '../src/render/scene-svg.ts';
import { SCENE_THEME_SPECS } from '../src/render/scene-theme.ts';
import { THEMES } from '../src/render/theme.ts';
import type { Scene } from '../src/types.ts';

const scene: Scene = {
  width: 400,
  height: 200,
  title: 'Sample',
  items: [
    { kind: 'box', style: 'box', x: 10, y: 10, w: 100, h: 48, role: ['box'] },
    { kind: 'box', style: 'box', x: 130, y: 10, w: 100, h: 48, role: ['box', 'box--start'] },
    { kind: 'box', style: 'box', x: 250, y: 10, w: 100, h: 48, role: ['tile'] },
    { kind: 'path', d: 'M10 100L60 100L60 150Z', role: ['series-2', 'tint'] },
    { kind: 'circle', cx: 200, cy: 130, r: 12, role: ['series-1', 'dot'] },
    {
      kind: 'line',
      points: [{ x: 60, y: 58 }, { x: 60, y: 90 }, { x: 160, y: 90 }],
      role: ['edge', 'edge--arrow'],
    },
    { kind: 'text', x: 60, y: 34, text: 'a < b', role: ['name'] },
  ],
};

const luminance = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

const rects = (svg: string): string[] => svg.match(/<rect class="ursula-(?!bg)[^>]*>/g) ?? [];

describe('themed scene', () => {
  for (const theme of THEMES) {
    describe(theme, () => {
      const svg = renderThemedScene(scene, { theme });

      it('names its theme and carries the root class', () => {
        expect(svg).toContain(`data-theme="${theme}"`);
        expect(svg).toContain('class="ursula"');
      });

      it('gives boxes the radius of their role and theme', () => {
        const spec = SCENE_THEME_SPECS[theme];
        const [box, start, tile] = rects(svg);
        expect(box).toContain(`rx="${spec.boxRadius}"`);
        expect(start).toContain(`rx="${spec.boxRadius}"`);
        expect(tile).toContain('rx="8"');
      });

      it('writes class names that start with ursula- and leaves no id- in the style sheet', () => {
        const classes = [...svg.matchAll(/class="([^"]+)"/g)].flatMap((m) => (m[1] ?? '').split(' '));
        for (const c of classes) expect(c.startsWith('ursula')).toBe(true);
        const css = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
        expect(css).not.toMatch(/\.id-|--id-|url\(#id-/);
        expect(css).toContain('@media (prefers-color-scheme: dark)');
        expect(css).toMatch(/var\(--ursula-box-fill,#/);
      });

      it('uses no context-stroke and ends the arrow line short of the tip', () => {
        expect(svg).not.toContain('context-stroke');
        expect(svg).toContain('marker-end="url(#ursula-arrow-edge-end)"');
        const d = svg.match(/<path class="ursula-edge ursula-edge--arrow" d="([^"]+)"/)?.[1] ?? '';
        const last = d.trim().split(/[ L]+/).slice(-2).map(Number);
        expect(last[0]).toBeCloseTo(160 - SCENE_THEME_SPECS[theme].arrow.length, 1);
      });

      it('escapes text', () => {
        expect(svg).toContain('a &lt; b');
      });
    });
  }

  it('hangs a shadow filter on the card theme only', () => {
    for (const theme of THEMES) {
      const svg = renderThemedScene(scene, { theme });
      if (theme === 'card') {
        expect(svg).toContain('<filter id="ursula-shadow"');
        expect(svg).toContain('filter="url(#ursula-shadow)"');
      } else {
        expect(svg).not.toContain('filter');
      }
    }
  });

  it('takes the theme from the option, then the scene, then band', () => {
    expect(renderThemedScene(scene)).toContain('data-theme="band"');
    expect(renderThemedScene({ ...scene, theme: 'outline' })).toContain('data-theme="outline"');
    expect(renderThemedScene({ ...scene, theme: 'outline' }, { theme: 'card' })).toContain('data-theme="card"');
  });

  it('lets a box radius override the role', () => {
    const svg = renderThemedScene({ ...scene, items: [{ kind: 'box', style: 'box', x: 0, y: 0, w: 10, h: 10, role: ['box'], radius: 3 }] });
    expect(svg).toContain('rx="3"');
  });

  it('draws a start arrow short of its tip and mirrors the head', () => {
    const svg = renderThemedScene({
      ...scene,
      items: [{ kind: 'line', points: [{ x: 10, y: 10 }, { x: 110, y: 10 }], role: ['edge', 'edge--arrow-start'] }],
    });
    expect(svg).toContain('marker-start="url(#ursula-arrow-edge-start)"');
    expect(svg).toMatch(/d="M(19\.5|18|19) 10 L110 10"/);
  });

  it('styles a series tint written as two roles and as one', () => {
    const css = renderThemedScene(scene, { theme: 'solid' }).match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(css).toMatch(/\.ursula-series-2--tint,\.ursula-series-2\.ursula-tint\{fill:var\(--ursula-s2-tint,#d7f1ef\)/);
  });

  it('writes text spans as tspans of one text, with weight, slant and role', () => {
    const svg = renderThemedScene({
      ...scene,
      items: [
        {
          kind: 'text',
          x: 10,
          y: 20,
          text: 'Root with a < b',
          role: ['body'],
          spans: [{ text: 'Root', weight: 'bold' }, { text: ' with ' }, { text: 'a < b', italic: true, role: ['value'] }],
        },
      ],
    });
    expect(svg.match(/<text /g)).toHaveLength(1);
    expect(svg).toContain(
      '<text class="ursula-body" x="10" y="20" dominant-baseline="central"><tspan font-weight="bold">Root</tspan><tspan> with </tspan><tspan font-style="italic" class="ursula-value">a &lt; b</tspan></text>',
    );
  });

  it('turns a rotated text about its anchor', () => {
    const svg = renderThemedScene({ ...scene, items: [{ kind: 'text', x: 40, y: 50, text: 'c1', rotate: -45 }] });
    expect(svg).toContain('<text class="ursula-body" x="40" y="50" dominant-baseline="central" transform="rotate(-45 40 50)">c1</text>');
  });

  it('draws the rule of a box in a filled zone as a hairline that shows on that box in every theme and scheme', () => {
    for (const theme of THEMES) {
      const spec = SCENE_THEME_SPECS[theme];
      for (const mode of [0, 1] as const) {
        const rule = spec.colors['rule-in-zone']?.[mode] ?? '';
        const face = spec.colors['box-in-zone']?.[mode] ?? '';
        expect(contrast(rule, face), `${theme} ${mode}`).toBeGreaterThan(1.15);
      }
      const css = renderThemedScene(scene, { theme }).match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
      const light = css.split('@media')[0] ?? '';
      expect(light.indexOf('.ursula-rule--in-zone{')).toBeGreaterThan(light.indexOf('.ursula-rule{'));
      expect(light).toMatch(/\.ursula-rule--in-zone\{stroke:var\(--ursula-rule-in-zone,#[0-9a-f]{6}\);stroke-width:1\}/);
    }
  });

  it('fills the head of a call message in card, where every other head is two open strokes', () => {
    const svg = renderThemedScene(
      {
        ...scene,
        items: [
          { kind: 'line', points: [{ x: 10, y: 10 }, { x: 110, y: 10 }], role: ['edge', 'edge--arrow'] },
          { kind: 'line', points: [{ x: 10, y: 40 }, { x: 110, y: 40 }], role: ['edge', 'edge--msg', 'edge--arrow'] },
        ],
      },
      { theme: 'card' },
    );
    const head = (variant: string): string => svg.match(new RegExp(`<marker id="ursula-arrow-${variant}-end"[^>]*><path [^>]*d="([^"]+)"`))?.[1] ?? '';
    expect(head('edge')).not.toContain('Z');
    expect(head('msg')).toMatch(/Z$/);
    const light = (svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '').split('@media')[0] ?? '';
    expect(light).toMatch(/\.ursula-head\.ursula-head--msg\{fill:var\(--ursula-edge-msg,#[0-9a-f]{6}\);stroke:var\(--ursula-edge-msg/);
  });

  it('has a zone face role that paints the zone colour without its outline', () => {
    for (const theme of THEMES) {
      const light = (renderThemedScene(scene, { theme }).match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '').split('@media')[0] ?? '';
      expect(light).toContain('.ursula-zone-face{fill:var(--ursula-zone-fill,');
      expect(light).not.toMatch(/\.ursula-zone-face\{[^}]*stroke:var/);
    }
  });

  it('paints a note inside a zone apart from the zone in every theme and scheme', () => {
    for (const theme of THEMES) {
      const spec = SCENE_THEME_SPECS[theme];
      for (const mode of [0, 1] as const) {
        const note = spec.colors['note-in-zone']?.[mode] ?? '';
        const zone = spec.colors['zone-fill']?.[mode] ?? '';
        expect(contrast(note, zone), `${theme} ${mode}`).toBeGreaterThanOrEqual(1.05);
      }
      const light = (renderThemedScene(scene, { theme }).match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '').split('@media')[0] ?? '';
      expect(light.indexOf('.ursula-note--in-zone{fill:var(--ursula-note-in-zone,')).toBeGreaterThan(light.indexOf('.ursula-note{'));
    }
  });

  it('draws a round box rounder than a plain box in every theme', () => {
    for (const spec of Object.values(SCENE_THEME_SPECS)) expect(spec.roundRadius).toBeGreaterThan(spec.boxRadius);
  });
});

