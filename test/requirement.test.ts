// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { layout, pixelRuler, render, renderText, UrsulaError } from '../src/index.ts';
import { requirementGraph } from '../src/requirement/graph.ts';
import { parseRequirement, stripMarkdown } from '../src/requirement/parse.ts';
import { geometryViolations } from './helpers.ts';

const OFFICIAL = `requirementDiagram

requirement test_req {
id: 1
text: the test text.
risk: high
verifymethod: test
}

element test_entity {
type: simulation
}

test_entity - satisfies -> test_req`;

const RICH = `requirementDiagram
direction LR
requirement "rider safety" {
  id: 1
  text: "The bicycle shall **protect** the rider in a braking emergency."
  risk: high
  verifymethod: test
}
functionalRequirement brake_response:::important {
  id: 1.1
  text: Brake pads engage within 200 ms.
  risk: medium
  verifymethod: demonstration
}
interfaceRequirement i {
  id: 2
}
performanceRequirement p {
  id: 3
}
physicalRequirement ph {
  id: 4
}
designConstraint dc {
  id: 5
}
element brake_assembly {
  type: hardware
  docRef: docs/brakes.md
}
"rider safety" - contains -> brake_response
brake_assembly - satisfies -> brake_response
brake_response <- derives - dc
p - copies -> ph
i - refines -> p
brake_assembly - verifies -> p
dc - traces -> ph
style brake_assembly fill:#f9f
classDef important fill:#f96
class brake_response important
accTitle: Brakes
accDescr: how the brakes are required
`;

const THEMES = ['solid', 'outline', 'card'] as const;

describe('requirement parse', () => {
  it('reads the official example', () => {
    const m = parseRequirement(OFFICIAL);
    expect(m.nodes).toEqual([
      { kind: 'requirement', name: 'test_req', type: 'requirement', id: '1', text: 'the test text.', risk: 'high', verifymethod: 'test', line: 3 },
      { kind: 'element', name: 'test_entity', type: 'simulation', line: 10 },
    ]);
    expect(m.relations).toEqual([{ from: 'test_entity', to: 'test_req', type: 'satisfies', line: 14 }]);
  });

  it('reads every kind, both arrow directions, quoted names and a direction', () => {
    const m = parseRequirement(RICH);
    expect(m.direction).toBe('LR');
    expect(m.nodes.map((n) => n.name)).toEqual(['rider safety', 'brake_response', 'i', 'p', 'ph', 'dc', 'brake_assembly']);
    expect(m.nodes.slice(0, 6).map((n) => (n.kind === 'requirement' ? n.type : ''))).toEqual([
      'requirement',
      'functionalRequirement',
      'interfaceRequirement',
      'performanceRequirement',
      'physicalRequirement',
      'designConstraint',
    ]);
    expect(m.relations.map((r) => `${r.from}>${r.type}>${r.to}`)).toEqual([
      'rider safety>contains>brake_response',
      'brake_assembly>satisfies>brake_response',
      'dc>derives>brake_response',
      'p>copies>ph',
      'i>refines>p',
      'brake_assembly>verifies>p',
      'dc>traces>ph',
    ]);
    expect(m.ignored).toHaveLength(3);
    expect(m.accTitle).toBe('Brakes');
  });

  it('removes the marks of markdown from a quoted text only', () => {
    const m = parseRequirement(RICH);
    const first = m.nodes[0];
    expect(first?.kind === 'requirement' && first.text).toBe('The bicycle shall protect the rider in a braking emergency.');
    expect(stripMarkdown('*a* and __b__ and `c` and snake_case')).toBe('a and b and c and snake_case');
  });

  it('accepts a relation written before the names it uses', () => {
    const m = parseRequirement('requirementDiagram\na - traces -> b\nelement a {\n}\nelement b {\n}');
    expect(m.relations).toHaveLength(1);
  });
});

describe('requirement graph', () => {
  const g = requirementGraph(parseRequirement(RICH), pixelRuler());
  it('marks a contains line with a circle at its start and no arrowhead', () => {
    const e = g.edges[0];
    expect(e?.startEnd).toBe('circle');
    expect(e?.end).toBe('none');
    expect(e?.label).toBe('<<contains>>');
    expect(g.edges[1]?.end).toBe('arrow');
  });

  it('puts the kind tag, the name, the text and the facts in separate compartments', () => {
    const cells = g.nodes[1]?.compartments;
    expect(cells?.map((c) => c.emphasis)).toEqual(['tag', 'title', 'body', 'body']);
    expect(cells?.[0]?.lines).toEqual(['<<Functional Requirement>>']);
    expect(cells?.[3]?.lines).toEqual(['id: 1.1', 'risk: medium', 'verifymethod: demonstration']);
    expect(g.nodes[6]?.compartments?.[0]?.lines).toEqual(['<<Element>>']);
  });

  it('reads the direction: LR stays, BT and RL are mirrored', () => {
    expect(g.direction).toBe('LR');
    const bt = requirementGraph(parseRequirement('requirementDiagram\ndirection BT\nelement a {\n}'), pixelRuler());
    expect(bt.direction).toBe('TD');
    expect(bt.mirror).toBe('BT');
  });
});

describe('requirement render', () => {
  for (const [name, src] of [['official', OFFICIAL], ['rich', RICH]] as const) {
    it(`draws ${name} in three themes`, () => {
      for (const theme of THEMES) expect(render(src, { theme })).toContain(`data-theme="${theme}"`);
    });
  }

  it('draws every text of the source', () => {
    const svg = render(OFFICIAL);
    for (const t of ['&lt;&lt;Requirement&gt;&gt;', 'test_req', 'the test text.', 'id: 1', 'risk: high', 'verifymethod: test', '&lt;&lt;Element&gt;&gt;', 'type: simulation', '&lt;&lt;satisfies&gt;&gt;']) {
      expect(svg).toContain(t);
    }
  });

  it('uses the accessible title', () => {
    expect(render(RICH)).toContain('<title>Brakes</title>');
    expect(render(OFFICIAL)).toContain('<title>Requirement diagram: 1 requirements, 1 elements, 1 relations</title>');
  });

  it('keeps boxes apart, inside the drawing, and edges off other boxes', () => {
    for (const src of [OFFICIAL, RICH]) {
      const ruler = pixelRuler();
      expect(geometryViolations(layout(requirementGraph(parseRequirement(src), ruler), ruler))).toEqual([]);
    }
  });

  it('keeps every compartment text inside its box', () => {
    const ruler = pixelRuler();
    const laid = layout(requirementGraph(parseRequirement(RICH), ruler), ruler);
    for (const n of laid.nodes) {
      for (const c of n.compartments ?? []) for (const line of c.lines) expect(ruler.textWidth(line, 'line')).toBeLessThanOrEqual(n.w - 32);
    }
  });

  it('draws text for a terminal', () => {
    const out = renderText(OFFICIAL, 80);
    expect('lines' in out && out.lines.join('\n')).toContain('test_req');
  });
});

describe('requirement errors', () => {
  it('reports the line of an unknown relation', () => {
    const err = (() => {
      try {
        render('requirementDiagram\nelement a {\n}\na - eats -> a');
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(UrsulaError);
    expect((err as UrsulaError).line).toBe(4);
  });

  it('reports a field that a requirement does not have', () => {
    expect(() => parseRequirement('requirementDiagram\nrequirement r {\ncolour: red\n}')).toThrow(/line 3/);
  });

  it('reports a name that is never defined, and an unclosed block', () => {
    expect(() => parseRequirement('requirementDiagram\nelement a {\n}\na - traces -> z')).toThrow(/line 4.*"z" is not defined/);
    expect(() => parseRequirement('requirementDiagram\nelement a {\ntype: x')).toThrow(/line 2/);
  });
});
