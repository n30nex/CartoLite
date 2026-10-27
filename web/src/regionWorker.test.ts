import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegionWorkerRequest } from './regions';

vi.mock('./regions', () => ({
  regionDataset: vi.fn(() => ({ mapData: { type: 'FeatureCollection', features: [] }, indexed: [] })),
  resolveRegionAreas: vi.fn(() => []),
}));

const scope = globalThis as unknown as { onmessage(event: MessageEvent<RegionWorkerRequest>): void };
const post = vi.fn();
const response = () => ({ ok: true, json: async () => ({}) });

function send(requestId: number, pair = 'one'): void {
  scope.onmessage(new MessageEvent('message', { data: {
    type: 'resolve', requestId, nodes: [], partitionUrl: `/${pair}/partition`, registryUrl: `/${pair}/registry`,
  } }));
}

async function replied(requestId: number, type: 'resolved' | 'error'): Promise<void> {
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ requestId, type })));
}

describe('region worker dataset recovery', () => {
  beforeEach(async () => {
    vi.resetModules(); vi.useFakeTimers(); post.mockClear();
    vi.stubGlobal('onmessage', null); vi.stubGlobal('postMessage', post);
    await import('./regionWorker');
  });

  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('retries a failed URL pair and then shares its successful cached dataset', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('temporary failure')).mockImplementation(async () => response());
    vi.stubGlobal('fetch', fetcher);
    send(1); await replied(1, 'error');
    send(2); send(3); await replied(2, 'resolved'); await replied(3, 'resolved');
    expect(fetcher).toHaveBeenCalledTimes(4);
    send(4); await replied(4, 'resolved'); expect(fetcher).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts stalled response bodies and permits the next lookup', async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      const signal = options.signal!; signals.push(signal);
      return { ok: true, json: () => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('download aborted')), { once: true });
      }) };
    }));
    send(1);
    await vi.advanceTimersByTimeAsync(20_000);
    await replied(1, 'error');
    expect(signals).toHaveLength(2); expect(signals.every(signal => signal.aborted)).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => response()));
    send(2); await replied(2, 'resolved'); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let an older failing request evict a newer successful URL pair', async () => {
    let fail!: (reason: Error) => void;
    const blocked = new Promise<never>((_resolve, reject) => { fail = reject; });
    const fetcher = vi.fn((url: string) => url === '/old/partition' ? blocked : Promise.resolve(response()));
    vi.stubGlobal('fetch', fetcher);
    send(1, 'old'); send(2, 'new'); await replied(2, 'resolved');
    fail(new Error('older request failed')); await replied(1, 'error');
    send(3, 'new'); await replied(3, 'resolved');
    expect(fetcher).toHaveBeenCalledTimes(4); expect(vi.getTimerCount()).toBe(0);
  });
});
