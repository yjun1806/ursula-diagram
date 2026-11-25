import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, renderText, renderTextLayout } from '../src/index.ts';

const lines = (src: string, width = 100): string[] => {
  const r = renderText(src, width);
  if ('error' in r) throw new Error(r.error);
  return r.lines;
};

describe('labels of a terminal drawing', () => {
  it('leave a cell of line before the label and a cell of line and the arrowhead after it', () => {
    const text = lines('flowchart LR\nA -->|no way| C').join('\n');
    expect(text).toContain('│─ no way ─▶│');
    // A line on the side of a box in a flow drawn downward, as the drawing by layers sets it.
    const side = renderTextLayout(layout(parse('flowchart TD\nA --> B\nA -->|no way| C'), cellRuler(), { maxWidth: 100, ranked: false })).join('\n');
    expect(side).toContain('│─ no way ─▶│');
  });

  it('keep the marks of a relation on both sides of the label', () => {
    const text = lines('erDiagram\nA ||--|| B : links').join('\n');
    expect(text).toContain('||─ links ─||');
  });

  it('are cut with an ellipsis when the width has no room for them', () => {
    const text = lines('flowchart LR\nA[A box with a long name] -->|a label that is far too long for the width of this drawing| B[Another box with a long name]', 70);
    expect(text.some((row) => row.includes('…'))).toBe(true);
    expect(Math.max(...text.map((row) => [...row].length))).toBeLessThanOrEqual(70);
  });

  it('are written beside an upright line in full', () => {
    const text = lines('flowchart TD\nA -->|a long label here| B').join('\n');
    expect(text).toContain('│  a long label here');
  });
});

describe('marks of a relation on an upright line', () => {
  it('stand apart with a cell of line between them', () => {
    const text = lines('erDiagram\nA ||--|| B : owns\nA ||--o{ C : has', 30);
    const width = Math.max(...text.map((row) => [...row].length));
    const columns = Array.from({ length: width }, (_, x) => text.map((row) => [...row][x] ?? ' ').join(''));
    expect(columns.some((col) => /┼┼[│┆]+(┼┼|o[v^])/.test(col))).toBe(true);
  });
});

describe('rows of a terminal drawing', () => {
  it('holds no compartment without text', () => {
    const text = lines('classDiagram\nclass A {\n+int x\n}\nclass B\nA <|-- B');
    expect(text.filter((row) => /^│\s+│$/.test(row.trim()))).toEqual([]);
    expect(text.join('\n')).toContain('│   B    │');
  });

  it('gives every box only the rows its text needs when nothing else stands beside it', () => {
    const text = lines('classDiagram\nclass A {\n+int one\n+int two\n+int three\n+int four\n}\nclass B {\n+int x\n}\nA --> B');
    const blank = text.filter((row) => /^│ +│$/.test(row.trim()));
    expect(blank).toEqual([]);
  });

  it('keeps one row between parts of a drawing that are not joined', () => {
    const text = lines('classDiagram\nA <|-- B\nC *-- D');
    let run = 0;
    for (const row of text) {
      run = row === '' ? run + 1 : 0;
      expect(run).toBeLessThan(2);
    }
  });
});

describe('the dots of a state diagram in a terminal', () => {
  it('are one cell each, joined to their lines', () => {
    const text = lines('stateDiagram-v2\n[*] --> A\nA --> [*]');
    const drawn = text.filter((row) => row.trim() !== '');
    expect(drawn[0]?.trim()).toBe('●');
    expect(drawn[drawn.length - 1]?.trim()).toBe('◉');
    expect(text.join('\n')).not.toContain('│ ● │');
  });
});

describe('composite states in a terminal', () => {
  const src = 'stateDiagram-v2\n[*] --> Draft\nstate Review {\n[*] --> Screening\nScreening --> Decision\n}\nDraft --> Review\nReview --> Published : approved';

  it('names the composite state as a band', () => {
    expect(lines(src).some((row) => row.includes('Review'))).toBe(true);
  });

  it('keeps the line into and the line out of the composite state', () => {
    const text = lines(src).join('\n');
    expect(text).toContain('approved');
    expect(text).toContain('Published');
  });
});

describe('parts of a terminal drawing that no line joins', () => {
  it('stand side by side while the width holds them', () => {
    const text = lines('classDiagram\nA <|-- B\nC *-- D\nE o-- F');
    expect(text[1]).toMatch(/│ A │\s+│ C │\s+│ E │/);
  });

  it('go on a new row when the width is used up', () => {
    const text = lines('classDiagram\nA <|-- B\nC *-- D\nE o-- F', 14);
    expect(text.some((row) => /│ A │\s+│ C │/.test(row))).toBe(true);
    expect(text.some((row) => /│ C │\s+│ E │/.test(row))).toBe(false);
    expect(Math.max(...text.map((row) => [...row].length))).toBeLessThanOrEqual(14);
  });
});

describe('a terminal drawing that is too wide', () => {
  const requirement = 'requirementDiagram\nrequirement first_requirement {\nid: 1\ntext: the first text of the drawing.\nrisk: high\nverifymethod: demonstration\n}\nfunctionalRequirement second_requirement {\nid: 1.1\ntext: the second text of the drawing.\nrisk: low\nverifymethod: inspection\n}\nelement an_element {\ntype: simulation\n}\nfirst_requirement - traces -> second_requirement\nan_element - satisfies -> second_requirement';

  it('is pushed together until it fits, with every text whole', () => {
    const wide = lines(requirement, 300);
    const text = lines(requirement, 100);
    expect(Math.max(...text.map((row) => [...row].length))).toBeLessThanOrEqual(100);
    expect(text.join('\n')).not.toContain('…');
    for (const word of ['verifymethod', 'demonstration', 'inspection', 'simulation']) expect(text.join('\n')).toContain(word);
    expect(wide.length).toBeGreaterThan(0);
  });

  it('wraps the notes beside its boxes narrower', () => {
    const src = 'stateDiagram-v2\nState1: The state with a note\nnote right of State1\nImportant information! You can write notes.\nend note\nState1 --> State2\nnote left of State2 : This is the note to the left.';
    const text = lines(src, 100);
    expect(Math.max(...text.map((row) => [...row].length))).toBeLessThanOrEqual(100);
    expect(text.join(' ').replace(/[│┄\s]+/g, ' ')).toContain('Important information! You');
  });

  it('cuts the label of a level line when pushing together is not enough', () => {
    const src = 'flowchart LR\nA[A box with a long name] -->|a label that is far too long for the width of this drawing| B[Another box with a long name]';
    const r = renderText(src, 70);
    expect('error' in r).toBe(false);
  });
});

describe('columns of a terminal drawing', () => {
  it('keep a cell of line next to the marks of a relation', () => {
    const text = lines('erDiagram\nMANUFACTURER ||--o{ CAR : makes\nCAR ||--o{ DRIVER : allows', 200).join('\n');
    expect(text).toContain('||─ makes ─o<');
    expect(text).toContain('||─ allows ─o<');
  });
});

describe('a label beside an upright line of a terminal drawing', () => {
  it('stands on a row where no other line runs under its text', () => {
    const text = lines('flowchart TD\nA{Within 14 days?} -->|yes| B[Item used?]\nA -->|no| D[Decline]\nB --> C[Refund]\nC --> D');
    const row = text.find((r) => r.includes('yes')) ?? '';
    const after = row.slice(row.indexOf('yes') + 3);
    expect(row).toMatch(/[│▼]\s+yes/);
    expect(after).not.toMatch(/^\s?[─┐┘└┌]/);
  });
});

describe('a C4 drawing in a narrow terminal', () => {
  it('wraps the names of its elements as well as their descriptions', () => {
    const src = 'C4Container\nPerson(customer, "Customer", "A customer of the bank, with personal bank accounts")\nSystem_Ext(mainframe, "Mainframe Banking System", "Stores all of the core banking information about customers")\nSystem_Ext(mail, "E-Mail System Of The Bank", "The internal e-mail system of the bank")\nRel(customer, mainframe, "Uses")\nRel(mainframe, mail, "Sends e-mails using")';
    const r = renderText(src, 50);
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.lines.join('\n')).toContain('Mainframe');
  });
});
