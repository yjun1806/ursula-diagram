import { describe, expect, it } from 'vitest';
import { readFrontMatter } from '../src/front-matter.ts';

describe('readFrontMatter', () => {
  it('reads nested maps of scalars', () => {
    const src = '---\ntitle: "TCP Packet"\nconfig:\n  packet:\n    bitsPerRow: 16\n    showBits: false\n  theme: base # comment\n---\npacket\n';
    expect(readFrontMatter(src)).toEqual({ title: 'TCP Packet', config: { packet: { bitsPerRow: 16, showBits: false }, theme: 'base' } });
  });

  it('is empty without a leading block', () => {
    expect(readFrontMatter('pie\n---\na: 1\n---')).toEqual({});
  });

  it('keeps a url with a colon as one string', () => {
    expect(readFrontMatter("---\nconfig:\n  kanban:\n    ticketBaseUrl: 'https://example.com/#TICKET#'\n---\nkanban")).toEqual({
      config: { kanban: { ticketBaseUrl: 'https://example.com/#TICKET#' } },
    });
  });
});
