export const DOMAINS = ['complex', 'complicated', 'chaotic', 'clear', 'confusion'] as const;
export type Domain = (typeof DOMAINS)[number];

/** Display name of each domain, as the drawing and the text table write it. */
export const DOMAIN_NAMES: Record<Domain, string> = {
  complex: 'Complex',
  complicated: 'Complicated',
  chaotic: 'Chaotic',
  clear: 'Clear',
  confusion: 'Confusion',
};

export interface CynefinTransition {
  from: Domain;
  to: Domain;
  label?: string;
  /** Source line of the transition, for messages. */
  line: number;
}

export interface Cynefin {
  title?: string;
  accTitle?: string;
  /** Items of each domain, in source order; a domain written twice keeps all its items. */
  items: Record<Domain, string[]>;
  transitions: CynefinTransition[];
}
