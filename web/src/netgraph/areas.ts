import regionPartitionURL from '../assets/meshcore-canada-region-partition.geojson?url';
import regionRegistryURL from '../assets/meshcore-canada-regions.json?url';
import type { NodeV2 } from '../types';
import type { RegionWorkerOutput } from '../regions';

export interface NetgraphAreaAnchor {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

interface PendingResolution {
  resolve(value: Map<string, NetgraphAreaAnchor>): void;
  reject(reason: Error): void;
}

export class NetgraphRegionResolver {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingResolution>();
  private nextRequestID = 1;

  constructor() {
    this.worker = new Worker(new URL('../regionWorker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (event: MessageEvent<RegionWorkerOutput>): void => {
      const message = event.data;
      if (message.type === 'error') {
        const error = new Error(message.message);
        if (message.requestId !== undefined) this.reject(message.requestId, error);
        else this.rejectAll(error);
        return;
      }
      if (message.type !== 'resolved') return;
      const request = this.pending.get(message.requestId);
      if (!request) return;
      this.pending.delete(message.requestId);
      request.resolve(new Map(message.assignments.map(({ nodeID, area }) => [nodeID, area])));
    };
    this.worker.onerror = (event): void => this.rejectAll(new Error(event.message));
  }

  resolve(nodes: readonly NodeV2[]): Promise<Map<string, NetgraphAreaAnchor>> {
    const requestId = this.nextRequestID++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({
        type: 'resolve',
        requestId,
        partitionUrl: regionPartitionURL,
        registryUrl: regionRegistryURL,
        nodes: nodes.map(({ id, lat, lng }) => ({ id, lat, lng })),
      });
    });
  }

  destroy(): void {
    this.worker.terminate();
    this.pending.clear();
  }

  private reject(requestId: number, error: Error): void {
    const request = this.pending.get(requestId);
    if (!request) return;
    this.pending.delete(requestId);
    request.reject(error);
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}

// These are fallback anchors for nodes outside the Canadian partition. Exact
// Canadian assignments come from MeshCore.ca's national region dataset.
export const NETGRAPH_AREA_ANCHORS: readonly NetgraphAreaAnchor[] = [
  { code: 'AST', name: 'Astoria', lat: 46.1879, lng: -123.8313 },
  { code: 'BLI', name: 'Bellingham', lat: 48.7519, lng: -122.4787 },
  { code: 'BUF', name: 'Buffalo', lat: 42.8864, lng: -78.8784 },
  { code: 'EAT', name: 'Wenatchee', lat: 47.4235, lng: -120.3103 },
  { code: 'EUG', name: 'Eugene', lat: 44.0521, lng: -123.0868 },
  { code: 'GEG', name: 'Spokane', lat: 47.6588, lng: -117.426 },
  { code: 'MFR', name: 'Medford', lat: 42.3265, lng: -122.8756 },
  { code: 'OLM', name: 'Olympia', lat: 47.0379, lng: -122.9007 },
  { code: 'PDX', name: 'Portland', lat: 45.5152, lng: -122.6784 },
  { code: 'PSC', name: 'Tri-Cities', lat: 46.2396, lng: -119.1006 },
  { code: 'ROC', name: 'Rochester', lat: 43.1566, lng: -77.6088 },
  { code: 'SEA', name: 'Seattle', lat: 47.6062, lng: -122.3321 },
  { code: 'SLE', name: 'Salem', lat: 44.9429, lng: -123.0351 },
  { code: 'SYR', name: 'Syracuse', lat: 43.0481, lng: -76.1474 },
] as const;

export function nearestNetgraphArea(lat: number, lng: number): NetgraphAreaAnchor {
  let nearest = NETGRAPH_AREA_ANCHORS[0]!;
  let nearestDistance = Infinity;
  for (const area of NETGRAPH_AREA_ANCHORS) {
    const meanLatitude = (lat + area.lat) * Math.PI / 360;
    const longitudeDistance = (lng - area.lng) * Math.cos(meanLatitude);
    const latitudeDistance = lat - area.lat;
    const distance = longitudeDistance * longitudeDistance + latitudeDistance * latitudeDistance;
    if (distance < nearestDistance || (distance === nearestDistance && area.code < nearest.code)) {
      nearest = area;
      nearestDistance = distance;
    }
  }
  return nearest;
}
