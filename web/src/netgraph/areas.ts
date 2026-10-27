import regionPartitionURL from '../assets/meshcore-canada-region-partition.geojson?url';
import regionRegistryURL from '../assets/meshcore-canada-regions.json?url';
import type { NodeV2 } from '../types';
import type { RegionWorkerOutput } from '../regions';

export interface NetgraphAreaAnchor {
  code: string;
  name: string;
  lat: number;
  lng: number;
  aliases?: readonly string[];
}

interface PendingResolution {
  resolve(value: Map<string, NetgraphAreaAnchor>): void;
  reject(reason: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

export class NetgraphRegionResolver {
  #worker?: Worker;
  readonly #pending = new Map<number, PendingResolution>();
  #nextRequestID = 1;
  #destroyed = false;

  #ensureWorker(): Worker {
    if (this.#worker) return this.#worker;
    const worker = new Worker(new URL('../regionWorker.ts', import.meta.url), {
      type: 'module',
    });
    this.#worker = worker;
    worker.onmessage = (event: MessageEvent<RegionWorkerOutput>): void => {
      if (this.#worker !== worker) return;
      const message = event.data;
      if (message.type === 'error') {
        const error = new Error(message.message);
        if (message.requestId !== undefined) this.#reject(message.requestId, error);
        else this.#rejectAll(error);
        return;
      }
      if (message.type !== 'resolved') return;
      const request = this.#pending.get(message.requestId);
      if (!request) return;
      this.#pending.delete(message.requestId);
      clearTimeout(request.timeout);
      request.resolve(new Map(message.assignments.map(({ nodeID, area }) => [nodeID, area])));
    };
    worker.onerror = (event): void => {
      if (this.#worker === worker) this.#fail(new Error(event.message || 'regional worker failed'));
    };
    return worker;
  }

  resolve(nodes: readonly NodeV2[]): Promise<Map<string, NetgraphAreaAnchor>> {
    if (this.#destroyed) return Promise.reject(new Error('regional resolver stopped'));
    const requestId = this.#nextRequestID++;
    return new Promise<Map<string, NetgraphAreaAnchor>>((resolve, reject) => {
      const timeout = setTimeout(() => this.#fail(new Error('regional lookup timed out')), 30_000);
      this.#pending.set(requestId, { resolve, reject, timeout });
      try {
        this.#ensureWorker().postMessage({
          type: 'resolve',
          requestId,
          partitionUrl: regionPartitionURL,
          registryUrl: regionRegistryURL,
          nodes: nodes.map(({ id, lat, lng }) => ({ id, lat, lng })),
        });
      } catch (error) {
        this.#fail(error instanceof Error ? error : new Error('regional worker failed'));
      }
    }).then(assignments => {
      if (this.#destroyed) throw new Error('regional resolver stopped');
      // Only a successful partition lookup establishes that a node is outside it.
      for (const node of nodes) if (!assignments.has(node.id)) assignments.set(node.id, nearestNetgraphArea(node.lat, node.lng));
      return assignments;
    });
  }

  destroy(): void {
    this.#destroyed = true;
    this.#fail(new Error('regional resolver stopped'));
  }

  #fail(error: Error): void {
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#rejectAll(error);
  }

  #reject(requestId: number, error: Error): void {
    const request = this.#pending.get(requestId);
    if (!request) return;
    this.#pending.delete(requestId);
    clearTimeout(request.timeout);
    request.reject(error);
  }

  #rejectAll(error: Error): void {
    for (const id of this.#pending.keys()) this.#reject(id, error);
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
