import type { FrontValue } from '../front-matter.ts';

/** The title and settings a front matter handed to a front-end. */
export interface FrontOptions {
  heading?: string;
  config?: Record<string, FrontValue>;
}

/** Takes the `heading` and `config` out of render options; values of another type are ignored. */
export function frontOf(opts: object): FrontOptions {
  const out: FrontOptions = {};
  if ('heading' in opts && typeof opts.heading === 'string') out.heading = opts.heading;
  if ('config' in opts && opts.config !== null && typeof opts.config === 'object') out.config = opts.config as Record<string, FrontValue>;
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The `name` section of a front-matter `config` map; undefined when `config` has no such section or it is not a map. */
export function configSection(config: unknown, name: string): Record<string, unknown> | undefined {
  if (!isRecord(config)) return undefined;
  const section = config[name];
  return isRecord(section) ? section : undefined;
}
