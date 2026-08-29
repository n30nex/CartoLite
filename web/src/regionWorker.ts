import {
  regionCanvasData,
  REGION_WORKER_MESSAGE_VERTEX_LIMIT,
  type RegionLinePiece,
  type RegionWorkerOutput
} from './regions';

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
    const data = regionCanvasData(await response.json());
    scope.postMessage({ type: 'labels', labels: data.labels });

    let batch: RegionLinePiece[] = [];
    let vertices = 0;
    for (const piece of data.pieces) {
      if (batch.length > 0 && vertices + piece.coordinates.length > REGION_WORKER_MESSAGE_VERTEX_LIMIT) {
        scope.postMessage({ type: 'pieces', pieces: batch });
        batch = [];
        vertices = 0;
      }
      batch.push(piece);
      vertices += piece.coordinates.length;
    }
    if (batch.length > 0) scope.postMessage({ type: 'pieces', pieces: batch });
    scope.postMessage({ type: 'done' });
    scope.close();
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'regional asset processing failed'
    });
  }
}
