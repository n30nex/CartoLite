import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { fetchState, LiveFeed } from './api';
import { LiveMap } from './map';
import { PacketAnimator } from './packetAnimator';
import { activityLabel, LiveStore } from './state';
import type { EndpointV1, PacketV1 } from './types';

const statusElement = required<HTMLElement>('status');
const statusText = required<HTMLElement>('status-text');
const fatal = required<HTMLElement>('fatal');
const followButton = required<HTMLButtonElement>('follow-button');
const resetButton = required<HTMLButtonElement>('reset-button');

void start();

async function start(): Promise<void> {
  let mapView: LiveMap | undefined;
  let animator: PacketAnimator | undefined;
  let store: LiveStore | undefined;
  let feed: LiveFeed | undefined;
  try {
    // Construct MapLibre before the state request so the basemap can paint while
    // the initial snapshot is in flight.
    const liveMap = new LiveMap(required<HTMLElement>('map'), required<HTMLElement>('tooltip'));
    const liveAnimator = new PacketAnimator(liveMap.map, required<HTMLCanvasElement>('packet-canvas'));
    mapView = liveMap;
    animator = liveAnimator;
    document.addEventListener('visibilitychange', () => animator?.setPaused(document.hidden));
    window.addEventListener('beforeunload', () => {
      feed?.stop();
      store?.destroy();
      animator?.destroy();
      mapView?.destroy();
    }, { once: true });

    const initial = await fetchState();
    const liveStore = new LiveStore(initial);
    store = liveStore;
    let streamConnected = false;
    let liveFollow = false;

    const updateStatus = (): void => {
      const display = activityLabel(liveStore.snapshot, streamConnected);
      statusElement.dataset.state = display.state;
      statusText.textContent = display.text;
      statusElement.title = `${liveStore.snapshot.nodes.length} nodes · ${liveStore.snapshot.routes.length} routes`;
    };

    liveStore.subscribe((state, mapChanged) => {
      if (mapChanged) liveMap.render(state);
      updateStatus();
    });
    liveMap.reset(initial.map.center, initial.map.zoom);

    const liveFeed = new LiveFeed(initial, {
      onConnection(connected) {
        streamConnected = connected;
        updateStatus();
      },
      onNode(event) {
        liveStore.upsertNode(event.node, event.seq);
      },
      onPacket(event) {
        liveStore.applyPacket(event);
        liveAnimator.add(event);
        if (liveFollow) liveMap.follow(packetDestination(event));
      },
      onStatus(event) {
        liveStore.updateStatus(event.status, event.seq);
      },
      async recover() {
        const snapshot = await fetchState();
        liveStore.replace(snapshot);
        return snapshot;
      },
      onError(error) {
        console.warn('Live stream recovery:', error.message);
      }
    });
    feed = liveFeed;
    liveFeed.start();

    followButton.addEventListener('click', () => {
      liveFollow = !liveFollow;
      followButton.setAttribute('aria-pressed', String(liveFollow));
      followButton.classList.toggle('selected', liveFollow);
    });
    resetButton.addEventListener('click', () => liveMap.reset(liveStore.snapshot.map.center, liveStore.snapshot.map.zoom));
  } catch (error) {
    statusElement.dataset.state = 'offline';
    statusText.textContent = 'Unavailable';
    fatal.textContent = error instanceof Error ? error.message : 'CartoLite could not start';
    fatal.hidden = false;
  }
}

function packetDestination(packet: PacketV1): EndpointV1 {
  if (packet.mode === 'observer') return packet.observer;
  return packet.segments[packet.segments.length - 1]?.to ?? packet.segments[0]?.from ?? {
    id: 'default', label: '', lat: 43.45, lng: -80.35
  };
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
}
