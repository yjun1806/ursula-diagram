import { UrsulaError } from '../types.ts';
import type { Journey, JourneySection, JourneyTask } from './model.ts';

function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, `journey-${code}`, line);
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/u;

/** Reads a Mermaid `journey` source into sections of scored tasks; `heading` is the title a front matter gave. */
export function parseJourney(src: string, heading?: string): Journey {
  const rows = src.split(/\r?\n/);
  let headerSeen = false;
  let title: string | undefined;
  let bodyTitle = false;
  let accTitle: string | undefined;
  let accDescr: string | undefined;
  const sections: JourneySection[] = [];
  let section: JourneySection | undefined;
  let directive = false;
  let description: string[] | undefined;

  for (let n = 0; n < rows.length; n++) {
    const line = n + 1;
    const s = (rows[n] ?? '').trim();
    if (description !== undefined) {
      if (s.startsWith('}')) {
        accDescr = description.filter((l) => l !== '').join(' ');
        description = undefined;
      } else description.push(s);
      continue;
    }
    if (directive) {
      if (s.includes('}%%')) directive = false;
      continue;
    }
    if (s.startsWith('%%{') && !s.includes('}%%')) {
      directive = true;
      continue;
    }
    if (s === '' || s.startsWith('%%')) continue;
    if (!headerSeen) {
      if (s !== 'journey') fail(`Expected "journey" before "${s}".`, line, 'header');
      headerSeen = true;
      continue;
    }

    let m: RegExpExecArray | null;
    if ((m = /^accTitle\s*:\s*(.*)$/u.exec(s)) !== null) {
      accTitle = (m[1] ?? '').trim();
    } else if ((m = /^accDescr\s*:\s*(.*)$/u.exec(s)) !== null) {
      accDescr = (m[1] ?? '').trim();
    } else if (/^accDescr\s*\{/u.test(s)) {
      const rest = s.replace(/^accDescr\s*\{/u, '');
      if (rest.includes('}')) accDescr = rest.slice(0, rest.indexOf('}')).trim();
      else description = rest.trim() === '' ? [] : [rest.trim()];
    } else if ((m = /^title(?:\s+(.*))?$/u.exec(s)) !== null) {
      const text = (m[1] ?? '').trim();
      if (text !== '') {
        title = text;
        bodyTitle = true;
      }
    } else if ((m = /^section(?:\s+(.*))?$/u.exec(s)) !== null) {
      const name = (m[1] ?? '').trim();
      section = name === '' ? { tasks: [] } : { name, tasks: [] };
      sections.push(section);
    } else {
      const parts = s.split(':');
      const name = (parts[0] ?? '').trim();
      if (parts.length < 2 || name === '') fail(`Cannot read "${s}"; a task is written "name: score: actor, actor".`, line);
      const scoreText = (parts[1] ?? '').trim();
      if (!NUMBER.test(scoreText)) fail(`"${name}" has the score "${scoreText}"; a score is a number from 1 to 5.`, line, 'score');
      const score = Number(scoreText);
      if (score < 1 || score > 5) fail(`"${name}" has the score ${scoreText}; a score must be between 1 and 5.`, line, 'score');
      const actors = parts
        .slice(2)
        .join(':')
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a !== '');
      const task: JourneyTask = { name, score, scoreText, actors, line };
      if (section === undefined) {
        section = { tasks: [] };
        sections.push(section);
      }
      section.tasks.push(task);
    }
  }

  if (description !== undefined) fail('accDescr block is not closed with "}".', rows.length);
  if (!headerSeen) fail('A user journey starts with "journey".', 1, 'header');
  const filled = sections.filter((sec) => sec.tasks.length > 0 || sec.name !== undefined);
  if (!filled.some((sec) => sec.tasks.length > 0)) fail('A user journey needs at least one task.', rows.length, 'empty');
  if (!bodyTitle && heading !== undefined && heading.trim() !== '') title = heading.trim();
  return {
    ...(title === undefined ? {} : { title }),
    ...(accTitle === undefined ? {} : { accTitle }),
    ...(accDescr === undefined ? {} : { accDescr }),
    sections: filled,
  };
}
