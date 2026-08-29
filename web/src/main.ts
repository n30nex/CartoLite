import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { fetchState, LiveFeed } from './api';
import { LiveMap, type LiveMapFocus, type RouteWindow } from './map';
import { PacketAnimator } from './packetAnimator';
import { activityLabel, LiveStore } from './state';
import { PACKET_KIND_COLORS, ROUTE_LEGEND_ITEMS } from './trafficVisuals';
import type { EndpointV2, PacketView } from './types';

const statusElement = required<HTMLElement>('status');
const statusText = required<HTMLElement>('status-text');
const topbar = required<HTMLElement>('topbar');
const fatal = required<HTMLElement>('fatal');
const followButton = required<HTMLButtonElement>('follow-button');
const routesButton = required<HTMLButtonElement>('routes-button');
const heatmapButton = required<HTMLButtonElement>('heatmap-button');
const regionsButton = required<HTMLButtonElement>('regions-button');
const resetButton = required<HTMLButtonElement>('reset-button');
const legend = required<HTMLElement>('legend');
const legendToggle = required<HTMLButtonElement>('legend-toggle');
const focusChip = required<HTMLElement>('focus-chip');
const focusText = required<HTMLElement>('focus-text');
const routeLegend = required<HTMLElement>('route-legend');
const routeWindow = required<HTMLSelectElement>('route-window');
const aboutButton = required<HTMLButtonElement>('about-button');
const aboutDialog = required<HTMLDialogElement>('about-dialog');
const aboutClose = required<HTMLButtonElement>('about-close');
const lastUpdate = required<HTMLElement>('last-update');

const SAVED_VIEW_KEY = 'cartolite:view:v2';

let legendExpanded = false;
let lastTrafficPulseAt = -Infinity;

legendToggle.addEventListener('click', () => {
  legendExpanded = !legendExpanded;
  legend.dataset.collapsed = String(!legendExpanded);
  legendToggle.setAttribute('aria-expanded', String(legendExpanded));
  legendToggle.setAttribute('aria-label', legendExpanded ? 'Hide map legend' : 'Show map legend');
});

renderRouteLegend(routeLegend);
aboutButton.addEventListener('click', () => aboutDialog.showModal());
aboutClose.addEventListener('click', () => aboutDialog.close());
aboutDialog.addEventListener('click', (event) => {
  if (event.target === aboutDialog) aboutDialog.close();
});

void start();

async function start(): Promise<void> {
  let mapView: LiveMap | undefined;
  let animator: PacketAnimator | undefined;
  let store: LiveStore | undefined;
  let feed: LiveFeed | undefined;
  try {
    // Construct MapLibre before the state request so the basemap can paint while
    // the initial snapshot is in flight.
    const liveMap = new LiveMap(required<HTMLElement>('map'), required<HTMLElement>('tooltip'), {
      onFocusChange: updateFocusChrome,
      onRouteWindowChange(label) {
        const option = routeWindow.querySelector<HTMLOptionElement>('option[value="auto"]');
        if (option) option.textContent = label;
      }
    });
    mapView = liveMap;
    const liveAnimator = new PacketAnimator(liveMap.map, required<HTMLCanvasElement>('packet-canvas'));
    animator = liveAnimator;
    wireLayerToggle(routesButton, false, 'routes', (visible) => {
      liveMap.setRoutesVisible(visible);
      routeLegend.hidden = !visible;
    });
    wireLayerToggle(heatmapButton, true, 'heatmap', (visible) => liveMap.setHeatmapVisible(visible));
    wireLayerToggle(regionsButton, false, 'regions', (visible) => liveMap.setRegionsVisible(visible));
    routeWindow.addEventListener('change', () => liveMap.setRouteWindow(routeWindow.value as RouteWindow));
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

    const setLiveFollow = (enabled: boolean): void => {
      liveFollow = enabled;
      followButton.setAttribute('aria-pressed', String(enabled));
      followButton.classList.toggle('selected', enabled);
      followButton.title = enabled ? 'Stop following live packets' : 'Follow live packets';
    };

    liveMap.map.on('dragstart', () => setLiveFollow(false));

    const updateStatus = (): void => {
      const display = activityLabel(liveStore.snapshot, streamConnected);
      statusElement.dataset.state = display.state;
      statusText.textContent = display.text;
      statusElement.title = `${liveStore.snapshot.nodes.length} nodes · ${liveStore.snapshot.routes.length} routes`;
    };

    liveStore.subscribe((state, changes) => {
      if (changes) liveMap.render(state, changes);
      updateStatus();
    });
    const savedView = loadSavedView();
    if (savedView) liveMap.reset(savedView.center, savedView.zoom);
    else liveMap.home(initial.nodes);

    liveMap.map.on('moveend', () => {
      if (!liveFollow) saveView(liveMap.view());
    });

    const liveFeed = new LiveFeed(initial, {
      onConnection(connected) {
        streamConnected = connected;
        updateStatus();
      },
      onNode(event) {
        liveStore.upsertNode(event.node, event.seq);
      },
      onPacket(event) {
        const packet = liveStore.applyPacket(event);
        lastUpdate.textContent = formatUpdate(event.at);
        if (!packet) return;
        liveAnimator.add(packet);
        pulseTrafficChrome();
        if (liveFollow && liveMap.shouldFollow(packet)) liveMap.follow(packetDestination(packet));
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
      setLiveFollow(!liveFollow);
    });
    resetButton.addEventListener('click', () => {
      setLiveFollow(false);
      liveMap.home(liveStore.snapshot.nodes);
    });
    lastUpdate.textContent = formatUpdate(initial.serverTime);
  } catch (error) {
    feed?.stop();
    store?.destroy();
    animator?.destroy();
    mapView?.destroy();
    statusElement.dataset.state = 'offline';
    statusText.textContent = 'Unavailable';
    fatal.textContent = error instanceof Error ? error.message : 'CartoLite could not start';
    fatal.hidden = false;
  }
}

function updateFocusChrome(focus: LiveMapFocus | null): void {
  legend.dataset.focused = String(Boolean(focus));
  focusChip.hidden = !focus;
  if (!focus) {
    focusText.textContent = '';
    legend.setAttribute('aria-label', 'Map legend');
    return;
  }
  const neighbors = `${focus.neighborCount} ${focus.neighborCount === 1 ? 'neighbor' : 'neighbors'}`;
  focusText.textContent = `${focus.label} · ${neighbors}`;
  legend.setAttribute('aria-label', `Selected node: ${focus.label}, ${neighbors}`);
}

function pulseTrafficChrome(): void {
  const now = performance.now();
  if (now - lastTrafficPulseAt < 1_000) return;
  lastTrafficPulseAt = now;
  topbar.classList.add('traffic-pulse');
  window.setTimeout(() => topbar.classList.remove('traffic-pulse'), 720);
}

function packetDestination(packet: PacketView): EndpointV2 {
  if (packet.mode === 'observer') return packet.observer;
  return packet.segments[packet.segments.length - 1]?.to ?? packet.segments[0]?.from ?? {
    id: 'default', label: '', lat: 56, lng: -96
  };
}

function loadSavedView(): { center: [number, number]; zoom: number } | null {
  try {
    const value = JSON.parse(localStorage.getItem(SAVED_VIEW_KEY) ?? 'null') as { center?: unknown; zoom?: unknown } | null;
    if (!value || !Array.isArray(value.center) || value.center.length !== 2 || typeof value.zoom !== 'number') return null;
    const lng = Number(value.center[0]);
    const lat = Number(value.center[1]);
    const zoom = Number(value.zoom);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -142 || lng > -48 || lat < 38 || lat > 84 || zoom < 3 || zoom > 16) return null;
    return { center: [lng, lat], zoom };
  } catch {
    return null;
  }
}

function saveView(view: { center: [number, number]; zoom: number }): void {
  try {
    localStorage.setItem(SAVED_VIEW_KEY, JSON.stringify(view));
  } catch {
    // Local persistence is optional; private browsing may reject it.
  }
}

function formatUpdate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Waiting for live state…';
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
}

function wireLayerToggle(
  button: HTMLButtonElement,
  initiallyVisible: boolean,
  layerName: string,
  setVisible: (visible: boolean) => void
): void {
  let visible = initiallyVisible;
  const update = (): void => {
    button.setAttribute('aria-pressed', String(visible));
    button.classList.toggle('selected', visible);
    button.title = `${visible ? 'Hide' : 'Show'} ${layerName}`;
  };
  setVisible(visible);
  update();
  button.addEventListener('click', () => {
    visible = !visible;
    setVisible(visible);
    update();
  });
}

function renderRouteLegend(container: HTMLElement): void {
  for (const item of ROUTE_LEGEND_ITEMS) {
    const entry = document.createElement('span');
    entry.className = 'route-legend-item';
    entry.setAttribute('aria-label', item.accessibleLabel);
    entry.title = item.accessibleLabel;

    const swatch = document.createElement('i');
    swatch.className = 'route-legend-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.setProperty('--route-color', PACKET_KIND_COLORS[item.kind]);

    const label = document.createElement('span');
    label.className = 'route-legend-label';
    label.setAttribute('aria-hidden', 'true');
    label.dataset.short = item.shortLabel;
    label.textContent = item.label;

    entry.append(swatch, label);
    container.append(entry);
  }
}
