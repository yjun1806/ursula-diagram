import { describe, expect, it } from 'vitest';
import { renderThemedScene } from '../src/render/scene-svg.ts';
import { SCENE_THEME_SPECS } from '../src/render/scene-theme.ts';
import { renderSceneSvg } from '../src/render/svg.ts';
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

  it('takes the theme from the option, then the scene, then solid', () => {
    expect(renderThemedScene(scene)).toContain('data-theme="solid"');
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
    const css = renderThemedScene(scene).match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(css).toMatch(/\.ursula-series-2--tint,\.ursula-series-2\.ursula-tint\{fill:var\(--ursula-s2-tint,#d7f1ef\)/);
  });

  it('keeps the plain renderer untouched', () => {
    expect(renderSceneSvg(scene)).not.toContain('data-theme');
  });
});
