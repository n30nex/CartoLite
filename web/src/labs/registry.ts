import type { ExperimentDefinition } from './runtime';

export const EXPERIMENTS: readonly ExperimentDefinition[] = [
  {
    id: 'packet-pond',
    title: 'Packet Pond',
    summary: 'Live hops disturb detailed reactive WebGL water with droplets, wakes, currents, and layered ripples.',
    explanation: 'Each luminous droplet follows the packet’s ordered public hops. Distance changes travel time, every crossing wakes the simulated water, reused routes deepen temporary channels, and observer-only traffic makes one isolated ripple.',
    renderer: 'webgl2+canvas2d',
    status: 'Stable',
    load: () => import('./experiments/packetPond'),
  },
  {
    id: 'firefly-meadow',
    title: 'Firefly Meadow',
    summary: 'Packets become detailed fireflies crossing a spacious, lightly planted moonlit meadow.',
    explanation: 'Plants are stable representations of recently known public nodes. A firefly traces every ordered route hop, leaves a short-lived plant glow, and keeps observer-only activity local without inventing a route.',
    renderer: 'canvas2d',
    status: 'Stable',
    load: () => import('./experiments/fireflyMeadow'),
  },
  {
    id: 'mesh-loom',
    title: 'Mesh Loom',
    summary: 'Wide packet-coloured fibres move through seven geographic lanes in a luminous live tapestry.',
    explanation: 'Each row is one sanitized live packet. Layered fibre, knots, and shuttle movement preserve hop order; colour identifies packet kind, and the nearest-hub lane separates public endpoint geography without exposing an MQTT region.',
    renderer: 'canvas2d',
    status: 'Stable',
    load: () => import('./experiments/meshLoom'),
  },
  {
    id: 'little-mesh-villages',
    title: 'Little Mesh Villages',
    summary: 'Recently observed nodes become spacious connected settlements across a screen-filling toy Canada at night.',
    explanation: 'Buildings are deterministic public nodes, active routes become roads and intercity links, and every live packet carries a sequence of porch lights through its ordered hops. Settlement size represents observed connectivity, not real-world population or permanent coverage.',
    renderer: 'canvas2d',
    status: 'Beta',
    load: () => import('./experiments/littleMeshVillages'),
  },
];

export function experimentByID(id: string | null): ExperimentDefinition {
  return EXPERIMENTS.find((definition) => definition.id === id) ?? EXPERIMENTS[0]!;
}
