// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { pixelRuler, render, renderText, selectFrontEnd, UrsulaError } from '../src/index.ts';
import type { Packet } from '../src/packet/model.ts';
import type { PacketLayout } from '../src/packet/layout.ts';
import type { SceneBox, SceneText } from '../src/types.ts';

const tcp = `---
title: "TCP Packet"
---
packet
0-15: "Source Port"
16-31: "Destination Port"
32-63: "Sequence Number"
64-95: "Acknowledgment Number"
96-99: "Data Offset"
100-105: "Reserved"
106: "URG"
107: "ACK"
108: "PSH"
109: "RST"
110: "SYN"
111: "FIN"
112-127: "Window"
128-143: "Checksum"
144-159: "Urgent Pointer"
160-191: "(Options and Padding)"
192-255: "Data (variable length)"`;

const udp = `packet
title UDP Packet
+16: "Source Port"
+16: "Destination Port"
32-47: "Length"
48-63: "Checksum"
64-95: "Data (variable length)"`;

const register = `---
config:
  packet:
    showBits: true
    bitOrder: descending
    bitsPerRow: 16
---
packet
0-7: "DATA"
8-11: "TYPE"
12: "EN"
13-15: "RESERVED"`;

const themed = `---
config:
  packet:
    showBits: true
  themeVariables:
    packet:
      startByteColor: red
---
packet
0-15: "Source Port"
16-31: "Destination Port"
32-63: "Sequence Number"`;

const examples = { tcp, udp, register, themed };

function drawn(src: string, mode: 'svg' | 'text' = 'svg'): { packet: Packet; layout: PacketLayout } {
  return selectFrontEnd(src).json(src, mode, {}) as { packet: Packet; layout: PacketLayout };
}
const parsePacket = (src: string): Packet => drawn(src).packet;
const scene = (src: string) => drawn(src).layout.scene;

describe('packet render', () => {
  for (const [name, src] of Object.entries(examples)) {
    it(`${name} draws`, () => {
      expect(render(src)).toContain('data-theme="band"');
    });
    it(`${name} draws as text`, () => {
      const r = renderText(src, 100);
      expect('lines' in r).toBe(true);
    });
  }

  it('accepts the packet-beta header', () => {
    expect(render('packet-beta\n0-7: "A"')).toContain('data-theme="band"');
  });
});

describe('packet parse', () => {
  it('reads ranges, single bits, title and front matter', () => {
    const p = parsePacket(tcp);
    expect(p.title).toBe('TCP Packet');
    expect(p.fields).toHaveLength(17);
    expect(p.fields[0]).toMatchObject({ start: 0, end: 15, label: 'Source Port' });
    expect(p.fields[6]).toMatchObject({ start: 106, end: 106, label: 'URG' });
    expect(p.fields.at(-1)).toMatchObject({ start: 192, end: 255, label: 'Data (variable length)' });
  });

  it('reads +N as bits after the previous field', () => {
    const p = parsePacket(udp);
    expect(p.title).toBe('UDP Packet');
    expect(p.fields.map((f) => [f.start, f.end])).toEqual([[0, 15], [16, 31], [32, 47], [48, 63], [64, 95]]);
  });

  it('lets an init directive win over the front matter', () => {
    const p = parsePacket(`---\nconfig:\n  packet:\n    bitsPerRow: 16\n---\n%%{init: {'packet': {'bitsPerRow': 8}}}%%\npacket\n0-7: "A"`);
    expect(p.bitsPerRow).toBe(8);
  });

  it('ignores a config value of the wrong type', () => {
    expect(parsePacket('---\nconfig:\n  packet:\n    bitsPerRow: wide\n---\npacket\n0-7: "A"').bitsPerRow).toBe(32);
  });

  it('prefers the title line of the body over the front matter', () => {
    expect(parsePacket('---\ntitle: A\n---\npacket\ntitle B\n0-7: "X"').title).toBe('B');
  });

  it('reads the packet config', () => {
    const p = parsePacket(register);
    expect(p).toMatchObject({ bitsPerRow: 16, bitOrder: 'descending', showBits: true });
    expect(parsePacket(themed)).toMatchObject({ bitsPerRow: 32, bitOrder: 'ascending' });
  });

  it('rejects a gap, an overlap, a reversed range, a zero count and a missing header with a line number', () => {
    const cases: [string, number][] = [
      ['packet\n0-7: "A"\n9-15: "B"', 3],
      ['packet\n0-7: "A"\n7-15: "B"', 3],
      ['packet\n0-7: "A"\n15-8: "B"', 3],
      ['packet\n0-7: "A"\n+0: "B"', 3],
      ['packet\n1-7: "A"', 2],
      ['packet\nhello', 2],
      ['0-7: "A"', 1],
    ];
    for (const [src, line] of cases) {
      let caught: unknown;
      try {
        render(src);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(UrsulaError);
      expect((caught as UrsulaError).line).toBe(line);
    }
  });
});

describe('packet layout', () => {
  const s = scene(tcp);
  const boxes = s.items.filter((i): i is SceneBox => i.kind === 'box');
  const texts = s.items.filter((i): i is SceneText => i.kind === 'text');

  it('gives a field a width of 36 per bit less the 4 gap', () => {
    const widths = boxes.map((b) => [b.data?.bits, b.w]);
    expect(widths).toContainEqual(['0-15', 16 * 36 - 4]);
    expect(widths).toContainEqual(['106', 32]);
    expect(widths).toContainEqual(['32-63', 32 * 36 - 4]);
  });

  it('merges a field that fills whole rows into one tall box', () => {
    const tall = boxes.find((b) => b.data?.bits === '192-255');
    expect(tall?.h).toBe(96);
  });

  it('keeps the drawing 1200 wide for 32 bits', () => {
    expect(s.width).toBe(1200);
  });

  it('draws every name and no text overlaps another or leaves the drawing', () => {
    const ruler = pixelRuler();
    const rect = (t: SceneText) => {
      const w = ruler.textWidth(t.text, 'line') * (t.font === 'title' || t.role?.includes('title') ? 15 / 12 : 1);
      const x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
      return { x0, x1: x0 + w, y0: t.y - 6, y1: t.y + 6 };
    };
    for (const t of texts) {
      const r = rect(t);
      expect(r.x0).toBeGreaterThanOrEqual(0);
      expect(r.x1).toBeLessThanOrEqual(s.width);
      expect(r.y0).toBeGreaterThanOrEqual(0);
      expect(r.y1).toBeLessThanOrEqual(s.height);
    }
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++) {
        const a = rect(texts[i] as SceneText);
        const b = rect(texts[j] as SceneText);
        const hit = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        expect(hit, `${texts[i]?.text} / ${texts[j]?.text}`).toBe(false);
      }
    for (const f of parsePacket(tcp).fields) expect(texts.some((t) => t.text === f.label)).toBe(true);
  });

  it('mirrors every row when the order is descending', () => {
    const d = scene(register);
    const data = d.items.find((i): i is SceneBox => i.kind === 'box' && i.data?.bits === '0-7');
    const reserved = d.items.find((i): i is SceneBox => i.kind === 'box' && i.data?.bits === '13-15');
    expect(data && reserved && data.x > reserved.x).toBe(true);
    expect(d.width).toBe(16 * 36 + 48);
  });

  it('splits a field that crosses a row and names both parts', () => {
    const s2 = scene('packet\n0-27: "A"\n28-35: "Across"\n36-63: "B"');
    const names = s2.items.filter((i): i is SceneText => i.kind === 'text' && i.text === 'Across');
    expect(names).toHaveLength(2);
  });

  it('widens every bit alike until a long name fits its box whole', () => {
    const ruler = pixelRuler();
    const s3 = scene('packet\n0: "Longname"\n1-31: "R"');
    const box = s3.items.find((i): i is SceneBox => i.kind === 'box' && i.data?.bits === '0');
    const rest = s3.items.find((i): i is SceneBox => i.kind === 'box' && i.data?.bits === '1-31');
    const name = s3.items.find((i): i is SceneText => i.kind === 'text' && i.role?.includes('name') === true && i.data?.bits === '0');
    expect(name?.text).toBe('Longname');
    expect(s3.items.some((i) => i.kind === 'text' && i.text.includes('…'))).toBe(false);
    expect(ruler.textWidth('Longname', 'line') * (13 / 12) + 4).toBeLessThanOrEqual(box?.w ?? 0);
    const bit = (box?.w ?? 0) + 4;
    expect(bit).toBeGreaterThan(36);
    expect(rest?.w).toBe(31 * bit - 4);
  });

  it('breaks a name at a space into two lines before it widens the bits', () => {
    const s4 = scene('packet\n0-2: "Traffic Class Value"\n3-31: "R"');
    const lines = s4.items.filter((i): i is SceneText => i.kind === 'text' && i.role?.includes('name') === true && i.data?.bits === '0-2');
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.text).join(' ')).toBe('Traffic Class Value');
    expect((lines[1]?.y ?? 0) - (lines[0]?.y ?? 0)).toBe(16);
    expect(s4.width).toBe(1200);
  });
});

describe('packet text', () => {
  it('draws box characters with the start number above and the name inside', () => {
    const r = renderText(udp, 140);
    if (!('lines' in r)) throw new Error(r.error);
    const out = r.lines.join('\n');
    expect(out).toContain('UDP Packet');
    expect(out).toContain('┌');
    expect(out).toContain('Source Port');
    expect(out).toMatch(/^32 {4,}48/m);
  });

  it('folds a row to 16 bits when the width is narrow', () => {
    const r = renderText(udp, 40);
    if (!('lines' in r)) throw new Error(r.error);
    expect(Math.max(...r.lines.map((l) => l.length))).toBeLessThanOrEqual(40);
    expect(r.lines.join('\n')).toContain('Source Port');
  });
});
