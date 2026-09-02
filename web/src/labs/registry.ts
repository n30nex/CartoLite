import type { ExperimentDefinition } from './runtime';

export const EXPERIMENTS: readonly ExperimentDefinition[] = [
  {
    id: 'packet-pond',
    title: 'Packet Pond',
    summary: 'Live hops skim across a moonlit living pond as droplets, currents, and layered ripples.',
    explanation: 'Each luminous droplet follows the packet’s ordered public hops. Distance changes travel time, reused routes deepen temporary surface channels, and observer-only traffic makes one isolated ripple.',
    renderer: 'canvas2d',
    status: 'Stable',
    load: () => import('./experiments/packetPond'),
  },
  {
    id: 'firefly-meadow',
    title: 'Firefly Meadow',
    summary: 'Packets become detailed fireflies carrying light through a layered moonlit meadow.',
    explanation: 'Plants are stable representations of recently known public nodes. A firefly traces every ordered route hop, leaves a short-lived plant glow, and keeps observer-only activity local without inventing a route.',
    renderer: 'canvas2d',
    status: 'Stable',
    load: () => import('./experiments/fireflyMeadow'),
  },
  {
    id: 'mesh-loom',
    title: 'Mesh Loom',
    summary: 'Ordered packet paths are woven into a luminous, scrolling live tapestry.',
    explanation: 'Each row is one sanitized live packet. Layered fibre, knots, and shuttle movement preserve hop order; packet colour remains recognizable and observer-only traffic stays an unconnected patch.',
    renderer: 'canvas2d',
    status: 'Stable',
    load: () => import('./experiments/meshLoom'),
  },
  {
    id: 'little-mesh-villages',
    title: 'Little Mesh Villages',
    summary: 'Recently observed nodes become tiny connected settlements across a toy Canada at night.',
    explanation: 'Buildings are deterministic public nodes, active routes become roads and intercity links, and every live packet carries a sequence of porch lights through its ordered hops. Settlement size represents observed connectivity, not real-world population or permanent coverage.',
    renderer: 'canvas2d',
    status: 'Beta',
    load: () => import('./experiments/littleMeshVillages'),
  },
];

export function experimentByID(id: string | null): ExperimentDefinition {
  return EXPERIMENTS.find((definition) => definition.id === id) ?? EXPERIMENTS[0]!;
}
