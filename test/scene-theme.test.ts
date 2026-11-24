import { describe, expect, it } from 'vitest';
import { renderThemedScene, sceneStyleSheet } from '../src/render/scene-svg.ts';
import { SCENE_THEME } from '../src/render/scene-theme.ts';
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

describe('scene drawing', () => {
  const svg = renderThemedScene(scene);

  it('names its look and carries the root class', () => {
    expect(svg).toContain('data-theme="band"');
    expect(svg).toContain('class="ursula"');
  });

  it('gives boxes the radius of their role', () => {
    const [box, start, tile] = rects(svg);
    expect(box).toContain(`rx="${SCENE_THEME.boxRadius}"`);
    expect(start).toContain(`rx="${SCENE_THEME.boxRadius}"`);
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
    expect(last[0]).toBeCloseTo(160 - SCENE_THEME.arrow.length, 1);
  });

  it('escapes text', () => {
    expect(svg).toContain('a &lt; b');
  });

  it('casts no shadow', () => {
    expect(svg).not.toContain('filter');
  });

  it('fills the head of every line, a message line too', () => {
    const drawn = renderThemedScene({
      ...scene,
      items: [
        { kind: 'line', points: [{ x: 10, y: 10 }, { x: 110, y: 10 }], role: ['edge', 'edge--arrow'] },
        { kind: 'line', points: [{ x: 10, y: 40 }, { x: 110, y: 40 }], role: ['edge', 'edge--msg', 'edge--arrow'] },
      ],
    });
    const head = (variant: string): string => drawn.match(new RegExp(`<marker id="ursula-arrow-${variant}-end"[^>]*><path [^>]*d="([^"]+)"`))?.[1] ?? '';
    expect(head('edge')).toMatch(/Z$/);
    expect(head('msg')).toBe(head('edge'));
  });

  it('lets a box radius override the role', () => {
    const svg = renderThemedScene({ ...scene, items: [{ kind: 'box', style: 'box', x: 0, y: 0, w: 10, h: 10, role: ['box'], radius: 3 }] });
    expect(svg).toContain('rx="3"');
  });

  it('draws a start arrow short of its tip and mirrors the head', () => {
    const drawn = renderThemedScene({
      ...scene,
      items: [{ kind: 'line', points: [{ x: 10, y: 10 }, { x: 110, y: 10 }], role: ['edge', 'edge--arrow-start'] }],
    });
    expect(drawn).toContain('marker-start="url(#ursula-arrow-edge-start)"');
    expect(drawn).toContain('d="M19 10 L110 10"');
  });

  it('styles a series tint written as two roles and as one', () => {
    expect(sceneStyleSheet()).toMatch(/\.ursula-series-2--tint,\.ursula-series-2\.ursula-tint\{fill:var\(--ursula-s2-tint,#d2eef1\)/);
    // The sample writes it as two roles, so its own sheet keeps that selector alone.
    const css = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(css).toMatch(/\n\.ursula-series-2\.ursula-tint\{fill:var\(--ursula-s2-tint,#d2eef1\)/);
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

  it('draws the rule of a box in a filled zone as a hairline that shows on that box in both schemes', () => {
    for (const mode of [0, 1] as const) {
      const rule = SCENE_THEME.colors['rule-in-zone']?.[mode] ?? '';
      const face = SCENE_THEME.colors['box-in-zone']?.[mode] ?? '';
      expect(contrast(rule, face), `${mode}`).toBeGreaterThan(1.15);
    }
    const light = sceneStyleSheet().split('@media')[0] ?? '';
    expect(light.indexOf('.ursula-rule--in-zone{')).toBeGreaterThan(light.indexOf('.ursula-rule{'));
    expect(light).toMatch(/\.ursula-rule--in-zone\{stroke:var\(--ursula-rule-in-zone,#[0-9a-f]{6}\);stroke-width:1\}/);
  });

  it('has a zone face role that paints the zone colour without its outline', () => {
    const light = sceneStyleSheet().split('@media')[0] ?? '';
    expect(light).toContain('.ursula-zone-face{fill:var(--ursula-zone-fill,');
    expect(light).not.toMatch(/\.ursula-zone-face\{[^}]*stroke:var/);
  });

  it('paints a note inside a zone apart from the zone in both schemes', () => {
    for (const mode of [0, 1] as const) {
      const note = SCENE_THEME.colors['note-in-zone']?.[mode] ?? '';
      const zone = SCENE_THEME.colors['zone-fill']?.[mode] ?? '';
      expect(contrast(note, zone), `${mode}`).toBeGreaterThanOrEqual(1.05);
    }
    const light = sceneStyleSheet().split('@media')[0] ?? '';
    expect(light.indexOf('.ursula-note--in-zone{fill:var(--ursula-note-in-zone,')).toBeGreaterThan(light.indexOf('.ursula-note{'));
  });

  it('draws a round box rounder than a plain box', () => {
    expect(SCENE_THEME.roundRadius).toBeGreaterThan(SCENE_THEME.boxRadius);
  });
});
