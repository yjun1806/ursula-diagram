import { flowchart } from './flowchart.ts';
import { sequence } from './sequence.ts';
import { state } from './state.ts';
import { klass } from './class.ts';
import { er } from './er.ts';
import { gantt } from './gantt.ts';
import { journey } from './journey.ts';
import { eventmodeling } from './eventmodeling.ts';
import { ishikawa } from './ishikawa.ts';
import { cynefin } from './cynefin.ts';
import { git } from './git.ts';
import { kanban } from './kanban.ts';
import { mindmap } from './mindmap.ts';
import { quadrant } from './quadrant.ts';
import { railroad } from './railroad.ts';
import { block } from './block.ts';
import { pie } from './pie.ts';
import { packet } from './packet.ts';
import { radar } from './radar.ts';
import { requirement } from './requirement.ts';
import { sankey } from './sankey.ts';
import { architecture } from './architecture.ts';
import { timeline } from './timeline.ts';
import { treeview } from './treeview.ts';
import { usecase } from './usecase.ts';
import { treemap } from './treemap.ts';
import { venn } from './venn.ts';
import { c4 } from './c4.ts';
import { wardley } from './wardley.ts';
import { xychart } from './xychart.ts';
import { zenuml } from './zenuml.ts';
import type { SyntaxEntry } from './entry.ts';

export type { SyntaxEntry } from './entry.ts';

/** One entry per diagram type, in the order the list shows them. */
export const SYNTAX: readonly SyntaxEntry[] = [flowchart, sequence, state, klass, er, gantt, journey, eventmodeling, ishikawa, cynefin, git, kanban, mindmap, quadrant, railroad, block, pie, packet, radar, requirement, sankey, architecture, timeline, treeview, usecase, treemap, venn, c4, wardley, xychart, zenuml];
