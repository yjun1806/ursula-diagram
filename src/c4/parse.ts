import { createAccessibilityReader } from '../front/accessibility.ts';
import { UrsulaError } from '../types.ts';

export type C4Type = 'context' | 'container' | 'component' | 'dynamic' | 'deployment';

/** The four levels of the C4 model; an element of a deployment diagram is a container or a component. */
export type ElementRole = 'person' | 'system' | 'container' | 'component';

export interface C4Element {
  alias: string;
  label: string;
  /** Technology of a container or component; absent for a person and a system. */
  tech?: string;
  descr?: string;
  role: ElementRole;
  /** `db` and `queue` are the storage kinds (`SystemDb`, `ContainerQueue`). */
  store?: 'db' | 'queue';
  external: boolean;
  /** Macro name as written (`SystemDb_Ext`). */
  macro: string;
  /** Alias of the boundary the element stands in. */
  boundary?: string;
  line: number;
}

export interface C4Boundary {
  alias: string;
  label: string;
  /** What the boundary is: the macro name for the boundary macros, the type of a deployment node. */
  kind: string;
  descr?: string;
  deployment: boolean;
  parent?: string;
  line: number;
}

export interface C4Rel {
  from: string;
  to: string;
  label: string;
  tech?: string;
  /** Arrowheads: at the end only (`Rel`), at both (`BiRel`), at the start only (`Rel_Back`). */
  heads: 'end' | 'both' | 'start';
  /** Index of a step, from `RelIndex`; absent for the other relations. */
  index?: number;
  line: number;
}

export interface C4Model {
  type: C4Type;
  title?: string;
  accTitle?: string;
  elements: C4Element[];
  boundaries: C4Boundary[];
  rels: C4Rel[];
  /** Statements that were read and left out of the drawing. */
  ignored: string[];
}

const HEADERS: Readonly<Record<string, C4Type>> = {
  C4Context: 'context',
  C4Container: 'container',
  C4Component: 'component',
  C4Dynamic: 'dynamic',
  C4Deployment: 'deployment',
};

const ELEMENT = /^(Person|System|Container|Component)(Db|Queue)?(_Ext)?$/;
const BOUNDARY_KINDS = new Set(['Boundary', 'Enterprise_Boundary', 'System_Boundary', 'Container_Boundary']);
const NODE = /^(Deployment_Node|Node)(_L|_R)?$/;
const REL = /^(Rel|BiRel)(_Up|_Down|_Left|_Right|_U|_D|_L|_R|_Back|_Neighbor)?$/;
/** Styling, layout and legend statements: read and left out. */
const IGNORED = /^(Update[A-Za-z]*|Add[A-Za-z]*|Rewrite[A-Za-z]*|Lay_[A-Za-z]+|SHOW_[A-Z_]+|HIDE_[A-Z_]+|LAYOUT_[A-Z_]+|Legend[A-Za-z]*|SetPropertyHeader|WithoutPropertyHeader)$/;

const BREAK = /<br\s*\/?>/gi;

const fail = (message: string, line: number): never => {
  throw new UrsulaError(message, 'syntax', line);
};

/** Splits the inside of a macro call at commas outside double quotes. */
function splitArgs(text: string, line: number): string[] {
  const args: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if (ch === ',' && !quoted) {
      args.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (quoted) fail('unclosed quote', line);
  if (cur.trim() !== '' || args.length > 0) args.push(cur.trim());
  return args;
}

/** The text of one argument: quotes dropped, line breaks (`<br/>`) turned into newlines. */
function unquote(arg: string): string {
  const t = arg.startsWith('"') && arg.endsWith('"') && arg.length >= 2 ? arg.slice(1, -1) : arg;
  return t.replace(BREAK, '\n').trim();
}

/** Positional arguments only: `$sprite="..."`, `$tags="..."` and the other named ones are dropped. */
function positional(args: string[]): string[] {
  return args.filter((a) => !a.startsWith('$')).map(unquote);
}

interface Call {
  name: string;
  args: string[];
  opens: boolean;
}

const CALL = /^([A-Za-z_]+)\s*\((.*)\)\s*(\{)?$/u;

function readCall(text: string, line: number): Call | undefined {
  const found = CALL.exec(text);
  if (found === null) return undefined;
  return { name: found[1] as string, args: splitArgs(found[2] as string, line), opens: found[3] === '{' };
}

const stripComment = (line: string): string => {
  const at = line.indexOf('%%');
  return at < 0 ? line : line.slice(0, at);
};

/** Reads a C4 diagram; a statement that is not C4 is an error, a styling or layout statement is left out. */
export function parseC4(src: string): C4Model {
  const rows = src.split(/\r?\n/);
  const model: C4Model = { type: 'context', elements: [], boundaries: [], rels: [], ignored: [] };
  const access = createAccessibilityReader();
  const open: Array<{ alias: string; line: number }> = [];
  const aliases = new Set<string>();
  let headed = false;
  let steps = 0;

  const claim = (alias: string, line: number): void => {
    if (alias === '') fail('an element needs an alias', line);
    if (aliases.has(alias)) fail(`'${alias}' is defined twice`, line);
    aliases.add(alias);
  };

  rows.forEach((raw, i) => {
    const line = i + 1;
    if (access.insideBlock(raw)) return;
    const text = stripComment(raw).trim();
    if (text === '') return;
    if (access.read(text)) return;
    if (!headed) {
      const type = HEADERS[text.split(/[\s;]+/)[0] ?? ''];
      if (type === undefined) fail(`expected C4Context, C4Container, C4Component, C4Dynamic or C4Deployment, got '${text}'`, line);
      model.type = type as C4Type;
      headed = true;
      return;
    }
    if (text === '}') {
      if (open.pop() === undefined) fail("'}' has no boundary to close", line);
      return;
    }
    const title = /^title(?:\s*:\s*|\s+)(.*)$/.exec(text);
    if (title !== null) {
      model.title = (title[1] ?? '').trim();
      return;
    }
    const call = readCall(text, line);
    if (call === undefined) return fail(`cannot read '${text}'`, line);
    const { name } = call;
    const parent = open.at(-1)?.alias;
    const place = parent === undefined ? {} : { boundary: parent };

    const element = ELEMENT.exec(name);
    if (element !== null) {
      const role = (element[1] as string).toLowerCase() as ElementRole;
      const [alias = '', label = '', ...rest] = positional(call.args);
      const hasTech = role === 'container' || role === 'component';
      const tech = hasTech ? rest[0] : undefined;
      const descr = hasTech ? rest[1] : rest[0];
      claim(alias, line);
      model.elements.push({
        alias,
        label: label === '' ? alias : label,
        ...(tech === undefined || tech === '' ? {} : { tech }),
        ...(descr === undefined || descr === '' ? {} : { descr }),
        role,
        ...(element[2] === undefined ? {} : { store: element[2] === 'Db' ? ('db' as const) : ('queue' as const) }),
        external: element[3] !== undefined,
        macro: name,
        ...place,
        line,
      });
      if (call.opens) fail(`'${name}' does not open a boundary`, line);
      return;
    }

    if (BOUNDARY_KINDS.has(name) || NODE.test(name)) {
      if (!call.opens) fail(`'${name}' needs a '{' after its arguments`, line);
      const deployment = NODE.test(name);
      const [alias = '', label = '', second, third] = positional(call.args);
      claim(alias, line);
      // A deployment node reads (alias, label, type, description); a boundary reads (alias, label) and, for `Boundary`, a type.
      const kind = deployment ? (second ?? '') : name === 'Boundary' && second !== undefined && second !== '' ? second : name;
      model.boundaries.push({
        alias,
        label: label === '' ? alias : label,
        kind,
        ...(deployment && third !== undefined && third !== '' ? { descr: third } : {}),
        deployment,
        ...(parent === undefined ? {} : { parent }),
        line,
      });
      open.push({ alias, line });
      return;
    }

    const rel = REL.exec(name);
    if (rel !== null || name === 'RelIndex') {
      const args = positional(call.args);
      let index: number | undefined;
      if (name === 'RelIndex') {
        const [first = ''] = args.splice(0, 1);
        index = /^\d+$/.test(first) ? Number(first) : undefined;
      }
      const [from = '', to = '', label = '', tech] = args;
      for (const end of [from, to]) if (!aliases.has(end)) fail(`'${end}' is not defined`, line);
      steps += 1;
      const suffix = rel?.[2];
      const heads = rel?.[1] === 'BiRel' ? 'both' : suffix === '_Back' ? 'start' : 'end';
      model.rels.push({
        from,
        to,
        label,
        ...(tech === undefined || tech === '' ? {} : { tech }),
        heads,
        ...(name === 'RelIndex' ? { index: index ?? steps } : {}),
        line,
      });
      if (suffix !== undefined && suffix !== '_Back') model.ignored.push(`${name} (direction hint)`);
      if (call.opens) fail(`'${name}' does not open a block`, line);
      return;
    }

    if (IGNORED.test(name)) {
      model.ignored.push(name);
      return;
    }
    fail(`unknown statement '${name}'`, line);
  });

  if (!headed) throw new UrsulaError('expected C4Context, C4Container, C4Component, C4Dynamic or C4Deployment', 'syntax', 1);
  const unclosed = open.at(-1);
  if (unclosed !== undefined) throw new UrsulaError(`boundary '${unclosed.alias}' is never closed`, 'syntax', unclosed.line);
  if (access.title !== undefined && access.title !== '') model.accTitle = access.title;
  return model;
}
