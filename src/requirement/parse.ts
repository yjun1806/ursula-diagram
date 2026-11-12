import { createAccessibilityReader } from '../front/accessibility.ts';
import { UrsulaError } from '../types.ts';

export type RequirementKind = 'requirement' | 'functionalRequirement' | 'interfaceRequirement' | 'performanceRequirement' | 'physicalRequirement' | 'designConstraint';

export type RelationKind = 'contains' | 'copies' | 'derives' | 'satisfies' | 'verifies' | 'refines' | 'traces';

/** The tag a kind is drawn with, as the Mermaid renderer words it. */
export const KIND_TAGS: Record<RequirementKind, string> = {
  requirement: 'Requirement',
  functionalRequirement: 'Functional Requirement',
  interfaceRequirement: 'Interface Requirement',
  performanceRequirement: 'Performance Requirement',
  physicalRequirement: 'Physical Requirement',
  designConstraint: 'Design Constraint',
};

const RELATIONS: readonly RelationKind[] = ['contains', 'copies', 'derives', 'satisfies', 'verifies', 'refines', 'traces'];

export interface RequirementNode {
  kind: 'requirement';
  name: string;
  type: RequirementKind;
  id?: string;
  text?: string;
  risk?: string;
  verifymethod?: string;
  line: number;
}

export interface ElementNode {
  kind: 'element';
  name: string;
  type?: string;
  docref?: string;
  line: number;
}

export interface Relation {
  from: string;
  to: string;
  type: RelationKind;
  line: number;
}

export interface RequirementModel {
  direction: 'TB' | 'BT' | 'LR' | 'RL';
  nodes: Array<RequirementNode | ElementNode>;
  relations: Relation[];
  /** Statements that were read and left out of the drawing (`style`, `classDef`, `class`). */
  ignored: string[];
  accTitle?: string;
}

/** Removes the marks of markdown emphasis (`**bold**`, `__bold__`, `*italic*`, `_italic_`, `` `code` ``) from a quoted text. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^\w])__([^_]+)__(?=$|[^\w])/g, '$1$2')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/(^|[^\w])_([^_]+)_(?=$|[^\w])/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
}

/** A value as written: surrounded quotes come off and a quoted text loses its markdown marks. */
function value(raw: string): string {
  const t = raw.trim();
  const quoted = /^"(.*)"$/.exec(t);
  return quoted ? stripMarkdown(quoted[1] ?? '') : t;
}

const NAME = String.raw`"[^"]*"|[^\s"{}]+`;
const STRICT_FORWARD = new RegExp(String.raw`^(${NAME})\s+-\s+(\w+)\s+->\s+(${NAME})$`);
const STRICT_BACKWARD = new RegExp(String.raw`^(${NAME})\s+<-\s+(\w+)\s+-\s+(${NAME})$`);
const LOOSE_FORWARD = /^(\w+)\s*-\s*(\w+)\s*->\s*(\w+)$/;
const LOOSE_BACKWARD = /^(\w+)\s*<-\s*(\w+)\s*-\s*(\w+)$/;
const REQUIREMENT_HEAD = /^(requirement|functionalRequirement|interfaceRequirement|performanceRequirement|physicalRequirement|designConstraint)\s+("[^"]*"|[^\s"{:]+)(?::::\w+)?\s*\{\s*$/;
const ELEMENT_HEAD = /^element\s+("[^"]*"|[^\s"{:]+)(?::::\w+)?\s*\{\s*$/;

const isRelation = (t: string): t is RelationKind => (RELATIONS as readonly string[]).includes(t);

/** Reads a requirement diagram into its requirements, elements and relations. */
export function parseRequirement(src: string): RequirementModel {
  const acc = createAccessibilityReader();
  const model: RequirementModel = { direction: 'TB', nodes: [], relations: [], ignored: [] };
  const known = new Map<string, number>();
  let header = false;
  const st: { open?: RequirementNode | ElementNode } = {};

  const fail = (message: string, line: number): never => {
    throw new UrsulaError(message, 'requirement-syntax', line);
  };
  const add = (node: RequirementNode | ElementNode): void => {
    if (known.has(node.name)) fail(`"${node.name}" is defined twice`, node.line);
    known.set(node.name, node.line);
    model.nodes.push(node);
  };

  src.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const text = raw.trim();
    if (acc.insideBlock(text)) return;
    if (text === '' || text.startsWith('%%')) return;
    if (!header) {
      if (text.split(/[\s;]+/)[0] !== 'requirementDiagram') fail('a requirement diagram starts with "requirementDiagram"', line);
      header = true;
      return;
    }
    if (st.open) {
      const open = st.open;
      if (text === '}') {
        st.open = undefined;
        return;
      }
      const field = /^(\w+)\s*:\s*(.*)$/.exec(text);
      if (!field) return fail(`cannot read "${text}" inside "${open.name}"`, line);
      const key = (field[1] ?? '').toLowerCase();
      const v = value(field[2] ?? '');
      if (open.kind === 'requirement') {
        if (key === 'id') open.id = v;
        else if (key === 'text') open.text = v;
        else if (key === 'risk') open.risk = v;
        else if (key === 'verifymethod') open.verifymethod = v;
        else fail(`"${field[1]}" is not a field of a requirement`, line);
      } else if (key === 'type') open.type = v;
      else if (key === 'docref') open.docref = v;
      else fail(`"${field[1]}" is not a field of an element`, line);
      return;
    }
    if (acc.read(text)) return;
    const direction = /^direction\s+(TB|TD|BT|LR|RL)$/.exec(text);
    if (direction) {
      const d = direction[1] === 'TD' ? 'TB' : (direction[1] as RequirementModel['direction']);
      model.direction = d;
      return;
    }
    if (/^(style|classDef|class)\s/.test(text)) {
      model.ignored.push(text);
      return;
    }
    const req = REQUIREMENT_HEAD.exec(text);
    if (req) {
      const node: RequirementNode = { kind: 'requirement', name: value(req[2] ?? ''), type: req[1] as RequirementKind, line };
      add(node);
      st.open = node;
      return;
    }
    const el = ELEMENT_HEAD.exec(text);
    if (el) {
      const node: ElementNode = { kind: 'element', name: value(el[1] ?? ''), line };
      add(node);
      st.open = node;
      return;
    }
    const cleaned = text.replace(/:::\w+/g, '');
    const forward = STRICT_FORWARD.exec(cleaned) ?? LOOSE_FORWARD.exec(cleaned);
    const backward = forward ? null : (STRICT_BACKWARD.exec(cleaned) ?? LOOSE_BACKWARD.exec(cleaned));
    const found = forward ?? backward;
    if (!found) return fail(`cannot read "${text}"`, line);
    const [a, type, b] = [value(found[1] ?? ''), found[2] ?? '', value(found[3] ?? '')];
    if (!isRelation(type)) return fail(`"${type}" is not a relation (${RELATIONS.join(', ')})`, line);
    const [from, to] = forward ? [a, b] : [b, a];
    model.relations.push({ from, to, type, line });
  });
  if (!header) throw new UrsulaError('a requirement diagram starts with "requirementDiagram"', 'requirement-syntax', 1);
  if (st.open) throw new UrsulaError(`"${st.open.name}" is not closed`, 'requirement-syntax', st.open.line);
  for (const r of model.relations) for (const name of [r.from, r.to]) if (!known.has(name)) throw new UrsulaError(`"${name}" is not defined`, 'requirement-syntax', r.line);
  if (acc.title !== undefined && acc.title !== '') model.accTitle = acc.title;
  return model;
}
