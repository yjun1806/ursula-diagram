import type { FrontValue } from '../front-matter.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutPacket } from './layout.ts';
import { parsePacket } from './parse.ts';
import type { PacketOptions } from './parse.ts';
import { layoutPacketText } from './text.ts';

function packetOptions(opts: { heading?: string; config?: Record<string, FrontValue> }): PacketOptions {
  return { ...(opts.heading === undefined ? {} : { heading: opts.heading }), ...(opts.config === undefined ? {} : { config: opts.config }) };
}

registerFrontEnd({
  name: 'packet',
  headers: ['packet', 'packet-beta'],
  svg(src, opts) {
    const { scene } = layoutPacket(parsePacket(src, packetOptions(opts)), pixelRuler());
    return renderThemedScene(scene, { ...(opts.title === undefined ? {} : { title: opts.title }), ...(opts.theme === undefined ? {} : { theme: opts.theme }) });
  },
  textLines(src, maxWidth, opts) {
    return layoutPacketText(parsePacket(src, packetOptions(opts)), maxWidth);
  },
  json(src, mode, opts) {
    const packet = parsePacket(src, packetOptions(opts));
    return { packet, layout: layoutPacket(packet, mode === 'text' ? cellRuler() : pixelRuler()) };
  },
});
