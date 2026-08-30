import { regionMapData, type RegionWorkerOutput } from './regions';

interface RegionWorkerRequest {
  url: string;
}

interface RegionWorkerScope {
  onmessage: ((event: MessageEvent<RegionWorkerRequest>) => void) | null;
  postMessage(message: RegionWorkerOutput): void;
  close(): void;
}

const scope = globalThis as unknown as RegionWorkerScope;

scope.onmessage = (event): void => {
  void loadRegions(event.data.url);
};

async function loadRegions(url: string): Promise<void> {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`regional asset returned HTTP ${response.status}`);
    scope.postMessage({ type: 'data', data: regionMapData(await response.json()) });
    scope.close();
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'regional asset processing failed'
    });
  }
}
