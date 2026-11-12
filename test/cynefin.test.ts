// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { cellWidth, render, renderText, selectFrontEnd, UrsulaError } from '../src/index.ts';
import { layoutCynefin } from '../src/cynefin/layout.ts';
import { parseCynefin } from '../src/cynefin/parse.ts';
import { pixelRuler } from '../src/metrics.ts';
import type { Point, SceneLine, SceneText } from '../src/types.ts';

const basic = `cynefin-beta
  title Incident Response

  complex
    "Investigate root cause"
    "Run chaos experiment"

  complicated
    "Analyze performance data"
    "Expert review needed"

  clear
    "Restart service"
    "Apply known fix"

  chaotic
    "Page on-call immediately"

  confusion
    "Unknown failure mode"`;

const withTransitions = `cynefin-beta
  title Strategy Categorization

  complex
    "Market research"

  complicated
    "Competitive analysis"

  clear
    "Standard pricing"

  chaotic
    "Crisis management"

  complex --> complicated : "Pattern identified"
  complicated --> clear : "Best practice codified"
  clear --> chaotic : "Complacency"
  chaotic --> complex : "Stabilized"`;

const empty = `cynefin-beta
  title Cynefin Framework

  complex
  complicated
  clear
  chaotic`;

const accessible = `cynefin-beta
  accTitle: Cynefin framework for software delivery decisions
  accDescr: A Cynefin map categorizing software tasks by complexity domain

  complex
    "New feature discovery"`;

// The same shape the drawing is checked against: two transitions, one on the top edge and one on the bottom edge.
const crossing = `cynefin-beta
  title Incident Response
  complex
    "Investigate root cause"
    "Run chaos experiment"
  complicated
    "Analyze performance data"
    "Expert review needed"
  clear
    "Restart service"
    "Apply known fix"
  chaotic
    "Page on-call immediately"
  confusion
    "Unknown failure mode"
  complex --> complicated : "Pattern identified"
  clear --> chaotic : "Complacency"`;

// Corner-to-corner transitions, a tall Confusion zone, a wide item and a second arrow on one edge.
const crowded = `cynefin-beta
  title Crowded
  complex
    "One"
    "Two"
    "A very long item label that widens every column of the framework"
  clear
    "Three"
  confusion
    "u1"
    "u2"
    "u3"
  complex --> clear : "Corner route"
  chaotic --> complicated : "Other corner"
  complex --> complicated : "Top row"
  complicated --> complex : "Back again"
  chaotic --> clear : "Bottom"
  complex --> chaotic : "Left side"
  clear --> complicated`;

const examples = { basic, withTransitions, empty, accessible, crossing, crowded };
const themes = ['solid', 'outline', 'card'] as const;
const ruler = pixelRuler();

describe('cynefin svg', () => {
  for (const [name, src] of Object.entries(examples)) {
    for (const theme of themes) {
      it(`${name} draws in ${theme}`, () => {
        const svg = render(src, { theme });
        expect(svg).toContain(`data-theme="${theme}"`);
        expect(svg).toContain('ursula-zone');
      });
    }
  }

  it('is picked by render() when the source starts with the header', () => {
    expect(selectFrontEnd(basic).name).toBe('cynefin');
  });

  it('reads a settings block and a heading without failing', () => {
    const svg = render(`---\nconfig:\n  cynefin:\n    width: 1000\n---\n${empty.replace(/title .*\n/u, '')}`, {});
    expect(svg).toContain('ursula-zone');
  });

  it('uses the heading as the title when the body has none', () => {
    const layout = layoutCynefin(parseCynefin('cynefin-beta\n complex\n  "a"', 'From heading'), ruler);
    expect(layout.scene.items.some((i) => i.kind === 'text' && i.text === 'From heading')).toBe(true);
  });

  it('uses accTitle as the SVG title', () => {
    expect(render(accessible)).toContain('<title>Cynefin framework for software delivery decisions</title>');
  });
});

describe('cynefin reading', () => {
  it('reads domains, items and the title', () => {
    const model = parseCynefin(basic);
    expect(model.title).toBe('Incident Response');
    expect(model.items.complex).toEqual(['Investigate root cause', 'Run chaos experiment']);
    expect(model.items.complicated).toEqual(['Analyze performance data', 'Expert review needed']);
    expect(model.items.clear).toEqual(['Restart service', 'Apply known fix']);
    expect(model.items.chaotic).toEqual(['Page on-call immediately']);
    expect(model.items.confusion).toEqual(['Unknown failure mode']);
    expect(model.transitions).toEqual([]);
  });

  it('reads transitions with their labels in source order', () => {
    const model = parseCynefin(withTransitions);
    expect(model.transitions.map((t) => [t.from, t.to, t.label])).toEqual([
      ['complex', 'complicated', 'Pattern identified'],
      ['complicated', 'clear', 'Best practice codified'],
      ['clear', 'chaotic', 'Complacency'],
      ['chaotic', 'complex', 'Stabilized'],
    ]);
  });

  it('keeps empty domains empty', () => {
    const model = parseCynefin(empty);
    expect(Object.values(model.items).every((items) => items.length === 0)).toBe(true);
  });

  it('drops a transition from a domain to itself and accepts a bare label', () => {
    const model = parseCynefin('cynefin-beta\ncomplex --> complex : "loop"\nclear --> chaotic : drop');
    expect(model.transitions.map((t) => [t.from, t.to, t.label])).toEqual([['clear', 'chaotic', 'drop']]);
  });
});

describe('cynefin layout', () => {
  it('puts the domains in a 2 × 2 of equal zones with the Confusion zone over the middle', () => {
    const { zones, scene } = layoutCynefin(parseCynefin(basic), ruler);
    const zone = (d: string) => zones.find((z) => z.domain === d)!;
    const { complex, complicated, chaotic, clear, confusion } = { complex: zone('complex'), complicated: zone('complicated'), chaotic: zone('chaotic'), clear: zone('clear'), confusion: zone('confusion') };
    expect([complex.w, complicated.w, chaotic.w, clear.w]).toEqual([400, 400, 400, 400]);
    expect([complex.h, complicated.h, chaotic.h, clear.h]).toEqual([172, 172, 172, 172]);
    expect(complicated.x - (complex.x + complex.w)).toBe(8);
    expect(chaotic.y - (complex.y + complex.h)).toBe(8);
    expect(complicated.y).toBe(complex.y);
    expect(clear.x).toBe(complicated.x);
    expect(confusion.x + confusion.w / 2).toBe(428);
    expect(confusion.y + confusion.h / 2).toBe(complex.y + complex.h + 4);
    expect([scene.width, scene.height]).toEqual([856, 440]);
  });

  it('stacks items in the outer column from 44 below the zone top, 8 apart', () => {
    const { items, zones } = layoutCynefin(parseCynefin(basic), ruler);
    const complex = zones.find((z) => z.domain === 'complex')!;
    const complicated = zones.find((z) => z.domain === 'complicated')!;
    const left = items.filter((i) => i.domain === 'complex');
    expect(left.map((i) => [i.x, i.y - complex.y, i.w, i.h])).toEqual([
      [48, 44, 212, 48],
      [48, 100, 212, 48],
    ]);
    const right = items.filter((i) => i.domain === 'complicated');
    expect(right.every((i) => i.x + i.w === complicated.x + complicated.w - 24)).toBe(true);
  });

  it('draws a top arrow across the edge, as long as its chip plus 32, with the chip 12 above', () => {
    const { transitions } = layoutCynefin(parseCynefin(crossing), ruler);
    const top = transitions[0]!;
    const [a, b] = top.points as [Point, Point];
    expect(b.x - a.x).toBe(top.chip!.w + 32);
    expect((a.x + b.x) / 2).toBe(428);
    expect(a.y).toBe(132);
    expect(top.chip!.y + top.chip!.h).toBe(a.y - 12);
    const bottom = transitions[1]!;
    const [c, d] = bottom.points as [Point, Point];
    expect(c.x - d.x).toBe(bottom.chip!.w + 32);
    expect(c.y).toBe(368);
  });

  it('runs a corner-to-corner transition along the outside, not through the Confusion zone', () => {
    const layout = layoutCynefin(parseCynefin(crowded), ruler);
    const conf = layout.zones.find((z) => z.domain === 'confusion')!;
    const corners = layout.transitions.filter((t) => t.route === 'around');
    expect(corners).toHaveLength(2);
    for (const t of corners) {
      expect(t.points.length).toBe(4);
      for (let i = 1; i < t.points.length; i++) {
        const p = t.points[i - 1]!;
        const q = t.points[i]!;
        const crosses = Math.max(p.x, q.x) > conf.x && Math.min(p.x, q.x) < conf.x + conf.w && Math.max(p.y, q.y) > conf.y && Math.min(p.y, q.y) < conf.y + conf.h;
        expect(crosses).toBe(false);
      }
    }
  });

  it('keeps arrows off the item boxes and the Confusion zone', () => {
    for (const src of [crossing, withTransitions, crowded]) {
      const layout = layoutCynefin(parseCynefin(src), ruler);
      const avoid = [...layout.items, ...layout.zones.filter((z) => z.domain === 'confusion')];
      for (const t of layout.transitions) {
        for (let i = 1; i < t.points.length; i++) {
          const p = t.points[i - 1]!;
          const q = t.points[i]!;
          for (const r of avoid) {
            const hit = Math.max(p.x, q.x) > r.x && Math.min(p.x, q.x) < r.x + r.w && Math.max(p.y, q.y) > r.y && Math.min(p.y, q.y) < r.y + r.h;
            expect(hit).toBe(false);
          }
        }
      }
    }
  });

  it('reverses the arrow for the opposite direction', () => {
    const forward = layoutCynefin(parseCynefin('cynefin-beta\ncomplex --> complicated : "x"'), ruler).transitions[0]!;
    const back = layoutCynefin(parseCynefin('cynefin-beta\ncomplicated --> complex : "x"'), ruler).transitions[0]!;
    expect(forward.points[1]!.x).toBeGreaterThan(forward.points[0]!.x);
    expect(back.points[1]!.x).toBeLessThan(back.points[0]!.x);
  });

  for (const [name, src] of Object.entries(examples)) {
    describe(name, () => {
      const layout = layoutCynefin(parseCynefin(src), ruler);
      const texts = layout.scene.items.filter((i): i is SceneText => i.kind === 'text');
      const sizeOf = (t: SceneText): number => (t.role?.includes('title') ? 15 : t.role?.includes('label') ? 12 : 13);
      const boxOf = (t: SceneText) => {
        const w = (ruler.textWidth(t.text, t.role?.includes('label') ? 'line' : 'title') * sizeOf(t)) / (t.role?.includes('label') ? 12 : 13);
        const x0 = t.anchor === 'start' ? t.x : t.x - w / 2;
        return { x0, x1: x0 + w, y0: t.y - 8, y1: t.y + 8 };
      };

      it('has no overlapping text', () => {
        const boxes = texts.map(boxOf);
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]!;
            const b = boxes[j]!;
            const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
            expect(overlap, `${texts[i]!.text} / ${texts[j]!.text}`).toBe(false);
          }
        }
      });

      it('keeps text inside the drawing', () => {
        for (const t of texts) {
          const b = boxOf(t);
          expect(b.x0).toBeGreaterThanOrEqual(0);
          expect(b.x1).toBeLessThanOrEqual(layout.scene.width);
          expect(b.y0).toBeGreaterThanOrEqual(0);
          expect(b.y1).toBeLessThanOrEqual(layout.scene.height);
        }
      });

      it('keeps item text and chip text inside their boxes', () => {
        for (const item of layout.items) expect(ruler.textWidth(item.text, 'title') + 16).toBeLessThanOrEqual(item.w);
        for (const t of layout.transitions) if (t.chip !== undefined) expect(ruler.textWidth(t.chip.text, 'line') + 16).toBeLessThanOrEqual(t.chip.w);
      });

      it('writes every item and label', () => {
        const model = parseCynefin(src);
        const written = texts.map((t) => t.text);
        for (const text of Object.values(model.items).flat()) expect(written).toContain(text);
        for (const t of model.transitions) if (t.label !== undefined) expect(written).toContain(t.label);
      });

      it('keeps every arrow inside the drawing', () => {
        for (const line of layout.scene.items.filter((i): i is SceneLine => i.kind === 'line')) {
          for (const p of line.points) {
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.x).toBeLessThanOrEqual(layout.scene.width);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeLessThanOrEqual(layout.scene.height);
          }
        }
      });
    });
  }

  it('gives the three themes the same coordinates, apart from corner radii and shadows', () => {
    const geometry = (theme: (typeof themes)[number]): string[] => render(basic, { theme }).match(/<(?:rect|text|path|circle)[^>]*>/gu)?.filter((e) => !e.includes('ursula-bg')).map((e) => e.replace(/class="[^"]*"/u, '').replace(/ (?:rx|filter)="[^"]*"/gu, '')) ?? [];
    expect(geometry('outline')).toEqual(geometry('solid'));
    expect(geometry('card')).toEqual(geometry('solid'));
  });
});

describe('cynefin errors', () => {
  it('rejects a wrong header with a line number', () => {
    expect(() => parseCynefin('\n\ncynefin\n complex')).toThrow(UrsulaError);
    try {
      parseCynefin('\n\ncynefin\n complex');
    } catch (err) {
      expect((err as UrsulaError).line).toBe(3);
    }
  });

  it('rejects an item outside a domain, with its line', () => {
    try {
      parseCynefin('cynefin-beta\n  "orphan"');
      throw new Error('did not throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UrsulaError);
      expect((err as UrsulaError).line).toBe(2);
    }
  });

  it('rejects an unknown domain in a transition and unreadable lines', () => {
    expect(() => parseCynefin('cynefin-beta\n  complex --> nowhere')).toThrow(/not a domain/u);
    expect(() => parseCynefin('cynefin-beta\n  complex\n  what is this')).toThrow(/line 3/u);
  });
});

describe('cynefin text', () => {
  it('lists the items by domain, then the transitions', () => {
    const out = renderText(withTransitions, 80);
    expect('lines' in out).toBe(true);
    if (!('lines' in out)) return;
    expect(out.lines).toEqual([
      'Strategy Categorization',
      'Complex      Market research',
      'Complicated  Competitive analysis',
      'Chaotic      Crisis management',
      'Clear        Standard pricing',
      'Confusion',
      '',
      'Complex → Complicated : Pattern identified',
      'Complicated → Clear : Best practice codified',
      'Clear → Chaotic : Complacency',
      'Chaotic → Complex : Stabilized',
    ]);
  });

  it('writes the domain name once for a domain with several items', () => {
    const out = renderText(basic, 80);
    if (!('lines' in out)) throw new Error('no lines');
    expect(out.lines.slice(1, 3)).toEqual(['Complex      Investigate root cause', '             Run chaos experiment']);
  });

  it('cuts items to the width', () => {
    const out = renderText(basic, 24);
    if (!('lines' in out)) throw new Error('no lines');
    expect(Math.max(...out.lines.map(cellWidth))).toBeLessThanOrEqual(24);
  });
});
