// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { parseSequence, render, renderText } from '../src/index.ts';

const critical = `sequenceDiagram
    participant Service
    participant DB

    critical Establish a connection to the DB
        Service-->DB: connect
    option Network timeout
        Service-->Service: Log error
    option Credentials rejected
        Service-->Service: Log different error
    end`;

const criticalPlain = `sequenceDiagram
    critical Establish a connection to the DB
        Service-->DB: connect
    end`;

const breakBlock = `sequenceDiagram
    Consumer-->API: Book the Hotel
    API->>Booking: Check availability
    break when the booking process fails
        API-->Consumer: show failure
    end
    API-->BookingSystem: Book the room`;

function text(src: string): string {
  const r = renderText(src, 100);
  if ('error' in r) throw new Error(r.error);
  return r.lines.join('\n');
}

describe('critical and break blocks', () => {
  it('draws a critical block with its tag', () => {
    expect(text(critical)).toContain('CRITICAL');
    expect(text(criticalPlain)).toContain('CRITICAL');
  });

  it('splits critical branches at option', () => {
    const seq = parseSequence(critical);
    const branches = seq.statements.filter((s) => s.kind === 'branch');
    expect(branches).toHaveLength(2);
    const out = text(critical);
    expect(out).toContain('Network timeout');
    expect(out).toContain('Credentials rejected');
  });

  it('draws a break block with its tag', () => {
    const out = text(breakBlock);
    expect(out).toContain('BREAK');
    expect(out).toContain('when the booking process fails');
  });

  it('draws both blocks as svg', () => {
    for (const src of [critical, breakBlock]) expect(render(src)).toContain('<svg');
  });

  it('rejects option outside critical', () => {
    expect(() => parseSequence('sequenceDiagram\n  alt a\n  option b\n  end')).toThrow();
  });
});
