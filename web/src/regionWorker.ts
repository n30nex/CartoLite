import {
  regionDataset,
  resolveRegionAreas,
  type RegionDataset,
  type RegionWorkerOutput,
  type RegionWorkerRequest,
} from './regions';

interface RegionWorkerScope {
  onmessage: ((event: MessageEvent<RegionWorkerRequest>) => void) | null;
  postMessage(message: RegionWorkerOutput): void;
}

const scope = globalThis as unknown as RegionWorkerScope;
let cachedURLs = '';
let cachedDataset: Promise<RegionDataset> | undefined;

scope.onmessage = (event): void => {
  void handleRequest(event.data);
};

async function handleRequest(request: RegionWorkerRequest): Promise<void> {
  try {
    const dataset = await loadDataset(request.partitionUrl, request.registryUrl);
    if (request.type === 'map') {
      scope.postMessage({ type: 'map', data: dataset.mapData });
      return;
    }
    scope.postMessage({
      type: 'resolved',
      requestId: request.requestId,
      assignments: resolveRegionAreas(dataset, request.nodes),
    });
  } catch (error) {
    scope.postMessage({
      type: 'error',
      requestId: request.type === 'resolve' ? request.requestId : undefined,
      message: error instanceof Error ? error.message : 'regional asset processing failed',
    });
  }
}

function loadDataset(partitionUrl: string, registryUrl: string): Promise<RegionDataset> {
  const urls = `${partitionUrl}\n${registryUrl}`;
  if (cachedDataset && cachedURLs === urls) return cachedDataset;
  cachedURLs = urls;
  cachedDataset = Promise.all([
    checkedJSON(partitionUrl, 'region partition'),
    checkedJSON(registryUrl, 'region registry'),
  ]).then(([partition, registry]) => regionDataset(partition, registry));
  return cachedDataset;
}

async function checkedJSON(url: string, label: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  return response.json();
}
