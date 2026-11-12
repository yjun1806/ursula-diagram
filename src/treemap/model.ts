export interface TreeNode {
  label: string;
  /** One-based source line. */
  line: number;
  /** Set on leaves only; always greater than zero. */
  value?: number;
  children: TreeNode[];
  /** Name of the `:::class` written on the node. */
  cls?: string;
}

export interface Treemap {
  title?: string;
  accTitle?: string;
  roots: TreeNode[];
  /** `classDef` bodies by class name, kept as written. */
  classDefs: Record<string, string>;
  /** Number format of the values (a d3-style specifier); `,` when none is given. */
  valueFormat: string;
  /** Margin around the drawing in pixels, when the settings give one. */
  diagramPadding?: number;
}

export const isLeaf = (n: TreeNode): boolean => n.value !== undefined;

/** Sum of the leaf values under (or at) a node. */
export function total(n: TreeNode): number {
  return n.value ?? n.children.reduce((sum, c) => sum + total(c), 0);
}
