import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegionWorkerOutput } from '../regions';
import { NetgraphRegionResolver } from './areas';

class MockWorker {
  static instances: MockWorker[] = [];
  onmessage: ((event: MessageEvent<RegionWorkerOutput>) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { MockWorker.instances.push(this); }
  reply(requestId: number): void {
    this.onmessage?.(new MessageEvent('message', { data: { type: 'resolved', requestId, assignments: [] } }));
  }
}

describe('Netgraph region worker lifecycle', () => {
  let resolver: NetgraphRegionResolver;
  beforeEach(() => {
    vi.useFakeTimers(); MockWorker.instances = []; vi.stubGlobal('Worker', MockWorker);
    resolver = new NetgraphRegionResolver();
  });
  afterEach(() => { resolver.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('only uses outside-partition anchors after a successful geographic lookup', async () => {
    const node = { id: 'outside', label: 'Outside', lat: 47.51, lng: -121.99, lastSeen: 1, role: 'repeater' as const, observer: false };
    const failed = expect(resolver.resolve([node])).rejects.toThrow('offline');
    MockWorker.instances[0]!.onerror?.({ message: 'offline' }); await failed;
    const next = resolver.resolve([node]); MockWorker.instances[1]!.reply(2);
    expect((await next).get(node.id)?.code).toBe('SEA');
  });

  it('settles every pending request on disposal and rejects further work', async () => {
    const first = expect(resolver.resolve([])).rejects.toThrow('stopped');
    const second = expect(resolver.resolve([])).rejects.toThrow('stopped');
    resolver.destroy(); await first; await second;
    expect(MockWorker.instances[0]!.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    await expect(resolver.resolve([])).rejects.toThrow('stopped');
    expect(MockWorker.instances).toHaveLength(1);
  });

  it('does not apply a reply whose continuation runs after disposal', async () => {
    const result = expect(resolver.resolve([])).rejects.toThrow('stopped');
    MockWorker.instances[0]!.reply(1);
    resolver.destroy();
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('expires a silent worker and retries with a new one, ignoring late replies', async () => {
    const first = expect(resolver.resolve([])).rejects.toThrow('timed out');
    const second = expect(resolver.resolve([])).rejects.toThrow('timed out');
    const old = MockWorker.instances[0]!;
    await vi.advanceTimersByTimeAsync(30_000); await first; await second;
    expect(old.terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    const next = resolver.resolve([]);
    old.reply(3); expect(vi.getTimerCount()).toBe(1);
    MockWorker.instances[1]!.reply(3); await expect(next).resolves.toEqual(new Map());
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(MockWorker.instances[1]!.terminate).not.toHaveBeenCalled();
  });

  it('recovers from both worker startup exceptions and worker errors', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('startup failed'); } });
    await expect(resolver.resolve([])).rejects.toThrow('startup failed');
    expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal('Worker', MockWorker);
    const failed = expect(resolver.resolve([])).rejects.toThrow('worker failed');
    MockWorker.instances[0]!.onerror?.({ message: 'worker failed' }); await failed;
    expect(vi.getTimerCount()).toBe(0);
    const next = resolver.resolve([]); MockWorker.instances[1]!.reply(3);
    await expect(next).resolves.toEqual(new Map());
  });
});
