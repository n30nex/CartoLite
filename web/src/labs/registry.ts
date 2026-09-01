import type { ExperimentDefinition } from './runtime';

export const EXPERIMENTS: readonly ExperimentDefinition[] = [
  {
    id: 'packet-pond',
    title: 'Packet Pond',
    summary: 'Live hops become moonlit droplets, channels, and resolving ripples.',
    explanation: 'Each droplet follows the packet’s ordered public hops. Distance changes travel time, reused routes deepen temporary channels, and observer-only traffic makes an isolated ripple.',
    renderer: 'canvas2d',
    status: 'Stable',
    load: () => import('./experiments/packetPond'),
  },
  {
    id: 'firefly-meadow',
    title: 'Firefly Meadow',
    summary: 'Packets become fireflies handing light from plant to plant.',
    explanation: 'Plants are stable representations of recently known public nodes. A firefly crosses each ordered route hop; observer-only traffic blinks locally without inventing a route.',
    renderer: 'canvas2d',
    status: 'Stable',
    load: () => import('./experiments/fireflyMeadow'),
  },
  {
    id: 'northern-lights',
    title: 'Northern Lights',
    summary: 'Traffic energy lifts quiet aurora bands above exact relay ribbons.',
    explanation: 'The aurora responds to recent packet rate and packet kind. The foreground ribbons still follow each packet’s ordered public geographic hops.',
    renderer: 'webgl2',
    status: 'Beta',
    load: () => import('./experiments/northernLights'),
  },
  {
    id: 'mesh-loom',
    title: 'Mesh Loom',
    summary: 'Ordered packet paths weave a temporary, scrolling live tapestry.',
    explanation: 'Each row is one sanitized live packet. Knots preserve hop order, colour identifies packet kind, and observer-only traffic remains a single unconnected mark.',
    renderer: 'canvas2d',
    status: 'Stable',
    load: () => import('./experiments/meshLoom'),
  },
];

export function experimentByID(id: string | null): ExperimentDefinition {
  return EXPERIMENTS.find((definition) => definition.id === id) ?? EXPERIMENTS[0]!;
}
