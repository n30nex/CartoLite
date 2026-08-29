import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { fetchState, LiveFeed } from './api';
import { RouteSonifier, type SoundStatus } from './audio';
import { LiveMap, type LiveMapFocus, type RouteWindow } from './map';
import { PacketAnimator } from './packetAnimator';
import { loadSavedView, saveView, viewClass, type ViewClass } from './preferences';
import { activityLabel, LiveStore } from './state';
import { normalizePacketKind, PACKET_KIND_COLORS, ROUTE_LEGEND_ITEMS } from './trafficVisuals';

const appElement = required<HTMLElement>('app');
const statusElement = required<HTMLElement>('status');
const statusText = required<HTMLElement>('status-text');
const trafficMeter = required<HTMLElement>('traffic-meter');
const topbar = required<HTMLElement>('topbar');
const mapElement = required<HTMLElement>('map');
const fatal = required<HTMLElement>('fatal');
const followButton = required<HTMLButtonElement>('follow-button');
const routesButton = required<HTMLButtonElement>('routes-button');
const heatmapButton = required<HTMLButtonElement>('heatmap-button');
const regionsButton = required<HTMLButtonElement>('regions-button');
const soundButton = required<HTMLButtonElement>('sound-button');
const soundControl = required<HTMLElement>('sound-button').parentElement as HTMLElement;
const soundPanel = required<HTMLElement>('sound-panel');
const soundState = required<HTMLElement>('sound-state');
const soundPanelState = required<HTMLElement>('sound-panel-state');
const soundToggle = required<HTMLButtonElement>('sound-toggle');
const soundVolume = required<HTMLInputElement>('sound-volume');
const soundVolumeOutput = required<HTMLOutputElement>('sound-volume-output');
const soundActivity = required<HTMLElement>('sound-activity');
const layersDisclosure = required<HTMLElement>('layers-disclosure');
const layersSummary = required<HTMLButtonElement>('layers-summary');
const layersPanel = required<HTMLElement>('layers-panel');
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

let legendExpanded = false;
let lastTrafficPulseAt = -Infinity;
let soundPulseTimer: number | undefined;
let scheduledNoteCount = 0;
let activeViewClass: ViewClass = viewClass();
let trafficWakeTimer: number | undefined;
let recentTraffic: number[] = [];

function setLayersOpen(open: boolean): void {
  layersDisclosure.toggleAttribute('open', open);
  layersSummary.setAttribute('aria-expanded', String(open));
  layersPanel.hidden = activeViewClass === 'mobile' && !open;
}

document.documentElement.dataset.viewClass = activeViewClass;
setLayersOpen(activeViewClass === 'desktop');
layersSummary.hidden = activeViewClass === 'desktop';
layersSummary.style.display = activeViewClass === 'desktop' ? 'none' : '';

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
layersSummary.addEventListener('click', () => {
  const opening = !layersDisclosure.hasAttribute('open');
  setLayersOpen(opening);
  if (opening) closeSoundPanel();
});
document.addEventListener('pointerdown', (event) => {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (!soundControl.contains(target)) closeSoundPanel();
  if (activeViewClass === 'mobile' && !layersDisclosure.contains(target)) setLayersOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeSoundPanel();
  if (activeViewClass === 'mobile') setLayersOpen(false);
});

void start();

async function start(): Promise<void> {
  let mapView: LiveMap | undefined;
  let animator: PacketAnimator | undefined;
  let sonifier: RouteSonifier | undefined;
  let store: LiveStore | undefined;
  let feed: LiveFeed | undefined;
  try {
    // Construct MapLibre before the state request so the basemap can paint while
    // the initial snapshot is in flight.
    const regionCanvas = required<HTMLCanvasElement>('region-canvas');
    const routeCanvas = required<HTMLCanvasElement>('route-canvas');
    const liveMap = new LiveMap(mapElement, required<HTMLElement>('tooltip'), {
      regionCanvas,
      routeCanvas,
      onFocusChange: updateFocusChrome,
      onRouteWindowChange(label) {
        const option = routeWindow.querySelector<HTMLOptionElement>('option[value="auto"]');
        if (option) option.textContent = label;
      }
    });
    mapView = liveMap;
    const packetCanvas = required<HTMLCanvasElement>('packet-canvas');
    const liveAnimator = new PacketAnimator(liveMap.map, packetCanvas);
    animator = liveAnimator;
    const routeSonifier = new RouteSonifier(liveMap.map, packetCanvas);
    sonifier = routeSonifier;
    soundVolume.value = String(Math.round(routeSonifier.getVolume() * 100));
    soundVolumeOutput.value = `${soundVolume.value}%`;
    routeSonifier.setStatusListener((status) => updateSoundChrome(status, routeSonifier.getVolume()));
    if (!routeSonifier.supported()) {
      soundButton.disabled = true;
      soundToggle.disabled = true;
      soundButton.title = 'Route sounds are unavailable in this browser';
      soundState.textContent = 'Unavailable';
      soundPanelState.textContent = 'Unavailable';
    }
    wireLayerToggle(routesButton, false, 'routes', (visible) => {
      liveMap.setRoutesVisible(visible);
      routeLegend.hidden = !visible;
    });
    wireLayerToggle(heatmapButton, true, 'heatmap', (visible) => liveMap.setHeatmapVisible(visible));
    wireLayerToggle(regionsButton, false, 'regions', (visible) => liveMap.setRegionsVisible(visible));
    routeWindow.addEventListener('change', () => liveMap.setRouteWindow(routeWindow.value as RouteWindow));
    document.addEventListener('visibilitychange', () => {
      animator?.setPaused(document.hidden);
      sonifier?.setPaused(document.hidden);
    });
    window.addEventListener('beforeunload', () => {
      if (trafficWakeTimer !== undefined) window.clearTimeout(trafficWakeTimer);
      feed?.stop();
      store?.destroy();
      animator?.destroy();
      sonifier?.destroy();
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
      followButton.dataset.mode = enabled ? 'director' : 'manual';
      appElement.classList.toggle('director-enabled', enabled);
      followButton.title = enabled ? 'Stop following live packets' : 'Follow live packets';
    };
    setLiveFollow(false);

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
    const savedView = loadSavedView(localStorage, activeViewClass);
    if (savedView) {
      mapElement.dataset.viewSource = liveMap.restore(savedView.center, savedView.zoom, initial.nodes)
        ? 'saved'
        : 'home-no-activity';
    } else {
      mapElement.dataset.viewSource = 'home';
      liveMap.home(initial.nodes);
    }

    liveMap.map.on('moveend', () => {
      if (!liveFollow) saveView(localStorage, activeViewClass, liveMap.view());
    });
    let resizeTimer: number | undefined;
    window.addEventListener('resize', () => {
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const next = viewClass();
        if (next === activeViewClass) return;
        activeViewClass = next;
        document.documentElement.dataset.viewClass = next;
        setLayersOpen(next === 'desktop');
        layersSummary.hidden = next === 'desktop';
        layersSummary.style.display = next === 'desktop' ? 'none' : '';
        const restored = loadSavedView(localStorage, next);
        if (restored) {
          mapElement.dataset.viewSource = liveMap.restore(restored.center, restored.zoom, liveStore.snapshot.nodes)
            ? 'saved'
            : 'home-no-activity';
        } else {
          mapElement.dataset.viewSource = 'home';
          liveMap.home(liveStore.snapshot.nodes);
        }
      }, 160);
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
        const scheduled = routeSonifier.play(packet);
        if (scheduled > 0) pulseSoundChrome(scheduled);
        pulseTrafficChrome(packet.payloadType);
        if (liveFollow && liveMap.shouldFollow(packet)) liveMap.follow(packet);
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
    soundButton.addEventListener('click', () => {
      const opening = soundPanel.hidden;
      soundPanel.hidden = !opening;
      soundButton.setAttribute('aria-expanded', String(opening));
      if (opening && activeViewClass === 'mobile') setLayersOpen(false);
    });
    soundToggle.addEventListener('click', async () => {
      const enabled = await routeSonifier.setEnabled(routeSonifier.status() !== 'on');
      if (!enabled && routeSonifier.status() === 'off') {
        if (soundPulseTimer !== undefined) window.clearTimeout(soundPulseTimer);
        soundPulseTimer = undefined;
        soundButton.classList.remove('sounding');
        soundActivity.classList.remove('active');
      }
    });
    soundVolume.addEventListener('input', () => {
      const percent = Math.max(0, Math.min(100, Number(soundVolume.value)));
      routeSonifier.setVolume(percent / 100);
      soundVolumeOutput.value = `${Math.round(percent)}%`;
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
    sonifier?.destroy();
    mapView?.destroy();
    statusElement.dataset.state = 'offline';
    statusText.textContent = 'Unavailable';
    fatal.textContent = error instanceof Error ? error.message : 'CartoLite could not start';
    fatal.hidden = false;
  }
}

function updateFocusChrome(focus: LiveMapFocus | null): void {
  legend.dataset.focused = String(Boolean(focus));
  appElement.classList.toggle('focus-active', Boolean(focus));
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

function pulseTrafficChrome(payloadType: string | undefined): void {
  const now = performance.now();
  recentTraffic = recentTraffic.filter((timestamp) => now - timestamp < 3_000);
  recentTraffic.push(now);
  const level = recentTraffic.length >= 16 ? 5
    : recentTraffic.length >= 10 ? 4
      : recentTraffic.length >= 6 ? 3
        : recentTraffic.length >= 3 ? 2 : 1;
  trafficMeter.dataset.level = String(level);
  appElement.dataset.trafficKind = normalizePacketKind(payloadType).toLowerCase();
  appElement.classList.add('traffic-awake');
  if (trafficWakeTimer !== undefined) window.clearTimeout(trafficWakeTimer);
  trafficWakeTimer = window.setTimeout(() => {
    trafficWakeTimer = undefined;
    recentTraffic = [];
    trafficMeter.dataset.level = '0';
    appElement.classList.remove('traffic-awake');
  }, 2_400);
  if (now - lastTrafficPulseAt >= 620) {
    lastTrafficPulseAt = now;
    topbar.classList.remove('traffic-pulse');
    void topbar.offsetWidth;
    topbar.classList.add('traffic-pulse');
    window.setTimeout(() => topbar.classList.remove('traffic-pulse'), 720);
  }
}

function pulseSoundChrome(notes: number): void {
  scheduledNoteCount += notes;
  soundActivity.dataset.scheduled = String(scheduledNoteCount);
  if (soundPulseTimer !== undefined) return;
  soundButton.classList.add('sounding');
  soundActivity.classList.add('active');
  soundPulseTimer = window.setTimeout(() => {
    soundButton.classList.remove('sounding');
    soundActivity.classList.remove('active');
    soundPulseTimer = undefined;
  }, 720);
}

function updateSoundChrome(status: SoundStatus, volume: number): void {
  const label = status === 'on' ? 'On' : status === 'resume' ? 'Tap to Resume' : 'Off';
  const percent = Math.round(volume * 100);
  soundState.textContent = label;
  soundPanelState.textContent = label;
  soundButton.dataset.soundState = status;
  soundPanel.dataset.soundState = status;
  soundButton.setAttribute('aria-pressed', String(status === 'on'));
  soundButton.classList.toggle('selected', status === 'on');
  soundButton.title = status === 'on'
    ? `Sound on — ${percent}% · visible live hops only`
    : status === 'resume'
      ? `Tap to resume sound — ${percent}%`
      : `Sound off — ${percent}%`;
  soundToggle.textContent = status === 'on' ? 'Turn sound off' : status === 'resume' ? 'Tap to Resume' : 'Turn sound on';
  soundVolume.value = String(percent);
  soundVolumeOutput.value = `${percent}%`;
}

function closeSoundPanel(): void {
  soundPanel.hidden = true;
  soundButton.setAttribute('aria-expanded', 'false');
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
