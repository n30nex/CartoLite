import './styles.css';
import { fetchState, LiveFeed } from '../api';
import { RouteSonifier, type SoundScene, type SoundStatus } from '../audio';
import { activityLabel, LiveStore } from '../state';
import type { PacketEventV2, StateV2 } from '../types';
import { DemoFeed, demoState } from './demo';
import { EXPERIMENTS, experimentByID } from './registry';
import {
  CanadaProjector,
  RollingMetrics,
  captionFor,
  normalizeLabPacket,
  type ExperimentDefinition,
  type LabExperiment,
  type LabViewport,
} from './runtime';

const app = required<HTMLElement>('labs-app');
const stage = required<HTMLElement>('labs-stage');
const status = required<HTMLElement>('labs-status');
const statusText = required<HTMLElement>('labs-status-text');
const picker = required<HTMLSelectElement>('experiment-select');
const pauseButton = required<HTMLButtonElement>('pause-button');
const soundButton = required<HTMLButtonElement>('sound-button');
const soundScene = required<HTMLSelectElement>('sound-scene');
const soundVolume = required<HTMLInputElement>('sound-volume');
const soundVolumeOutput = required<HTMLOutputElement>('sound-volume-output');
const resetButton = required<HTMLButtonElement>('reset-button');
const exhibitButton = required<HTMLButtonElement>('exhibit-button');
const infoButton = required<HTMLButtonElement>('info-button');
const infoDialog = required<HTMLDialogElement>('info-dialog');
const infoClose = required<HTMLButtonElement>('info-close');
const infoStatus = required<HTMLElement>('info-status');
const infoTitle = required<HTMLElement>('info-title');
const infoSummary = required<HTMLElement>('info-summary');
const infoExplanation = required<HTMLElement>('info-explanation');
const burstIndicator = required<HTMLElement>('burst-indicator');
const liveCaption = required<HTMLElement>('live-caption');
const fatal = required<HTMLElement>('labs-fatal');

const query = new URLSearchParams(location.search);
const demoMode = query.get('demo') === '1';
const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const projector = new CanadaProjector(stage);
const metrics = new RollingMetrics();

let currentDefinition = experimentByID(query.get('experiment'));
let activeExperiment: LabExperiment | undefined;
let switchGeneration = 0;
let userPaused = false;
let streamConnected = false;
let frameHandle: number | undefined;
let previousFrame = performance.now();
let exhibition = false;
let exhibitionTimer: number | undefined;
let burstTimer: number | undefined;
let destroyed = false;
let wakeLock: WakeLockSentinel | undefined;
let latestSnapshot: Readonly<StateV2> | undefined;

for (const definition of EXPERIMENTS) {
  const option = document.createElement('option');
  option.value = definition.id;
  option.textContent = `${definition.title} · ${definition.status}`;
  picker.append(option);
}
picker.value = currentDefinition.id;

void start();

async function start(): Promise<void> {
  let store: LiveStore | undefined;
  let feed: LiveFeed | undefined;
  let demoFeed: DemoFeed | undefined;
  let sonifier: RouteSonifier | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let unsubscribe: (() => void) | undefined;
  try {
    const initial = demoMode ? demoState() : await fetchState();
    if (destroyed) return;
    latestSnapshot = initial;
    const liveStore = new LiveStore(initial);
    store = liveStore;
    const routeSonifier = new RouteSonifier(projector, stage);
    sonifier = routeSonifier;

    configureSound(routeSonifier);
    updateExperimentInformation(currentDefinition);
    await switchExperiment(currentDefinition, liveStore.snapshot);
    if (destroyed) return;

    unsubscribe = liveStore.subscribe((snapshot, changes) => {
      latestSnapshot = snapshot;
      if (changes) activeExperiment?.applySnapshot(snapshot);
      updateConnectionStatus(liveStore.snapshot);
    });

    const handlePacket = (event: PacketEventV2): void => {
      const packetView = liveStore.applyPacket(event);
      if (!packetView) return;
      const packet = normalizeLabPacket(packetView);
      metrics.record(packet);
      liveCaption.textContent = captionFor(packet);
      if (!effectivePause()) {
        activeExperiment?.handlePacket(packet);
        routeSonifier.play(packetView);
      }
      updateBurstState();
    };

    if (demoMode) {
      streamConnected = true;
      status.dataset.state = 'demo';
      statusText.textContent = 'Demo · synthetic';
      demoFeed = new DemoFeed(handlePacket);
      demoFeed.start();
    } else {
      const liveFeed = new LiveFeed(initial, {
        onConnection(connected) {
          streamConnected = connected;
          updateConnectionStatus(liveStore.snapshot);
        },
        onNode(event) {
          liveStore.upsertNode(event.node, event.seq);
        },
        onPacket: handlePacket,
        onStatus(event) {
          liveStore.updateStatus(event.status, event.seq);
        },
        async recover() {
          const snapshot = await fetchState();
          metrics.reset();
          activeExperiment?.reset();
          liveStore.replace(snapshot);
          liveCaption.textContent = 'Live stream restored.';
          return snapshot;
        },
        onError() {
          status.dataset.state = 'reconnecting';
          statusText.textContent = 'Reconnecting';
        },
      });
      feed = liveFeed;
      liveFeed.start();
    }

    resizeObserver = new ResizeObserver(resizeActiveExperiment);
    resizeObserver.observe(stage);
    resizeActiveExperiment();
    startFrames();
    burstTimer = window.setInterval(updateBurstState, 1_000);
    app.dataset.loading = 'false';
    app.dataset.demo = String(demoMode);

    picker.addEventListener('change', () => {
      const next = experimentByID(picker.value);
      void switchExperiment(next, liveStore.snapshot).catch(showFatal);
    });
    pauseButton.addEventListener('click', () => {
      userPaused = !userPaused;
      pauseButton.textContent = userPaused ? 'Resume' : 'Pause';
      pauseButton.setAttribute('aria-pressed', String(userPaused));
      applyPauseState(routeSonifier);
    });
    resetButton.addEventListener('click', () => {
      metrics.reset();
      activeExperiment?.reset();
      activeExperiment?.applySnapshot(liveStore.snapshot);
      liveCaption.textContent = 'This experiment was reset. Live traffic continues.';
      updateBurstState();
    });
    exhibitButton.addEventListener('click', () => setExhibition(!exhibition));
    infoButton.addEventListener('click', () => infoDialog.showModal());
    infoClose.addEventListener('click', () => infoDialog.close());
    infoDialog.addEventListener('click', (event) => {
      if (event.target === infoDialog) infoDialog.close();
    });

    let wasHidden = document.hidden;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        wasHidden = true;
        stopFrames();
        releaseWakeLock();
      } else {
        startFrames();
        void requestWakeLock();
        if (wasHidden && !demoMode) void liveFeedResume(feed);
        wasHidden = false;
      }
      applyPauseState(routeSonifier);
    });
    window.addEventListener('online', () => {
      if (!demoMode) void liveFeedResume(feed);
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && !demoMode) void liveFeedResume(feed);
      void requestWakeLock();
    });
    document.addEventListener('pointerdown', () => { void requestWakeLock(); }, { passive: true });
    reducedMotionQuery.addEventListener('change', () => resizeActiveExperiment());
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && exhibition) setExhibition(false, false);
    });
    void requestWakeLock();
  } catch (error) {
    showFatal(error);
  }

  window.addEventListener('beforeunload', () => {
    destroyed = true;
    stopFrames();
    if (burstTimer !== undefined) window.clearInterval(burstTimer);
    if (exhibitionTimer !== undefined) window.clearInterval(exhibitionTimer);
    unsubscribe?.();
    resizeObserver?.disconnect();
    feed?.stop();
    demoFeed?.stop();
    store?.destroy();
    sonifier?.destroy();
    activeExperiment?.destroy();
    releaseWakeLock();
  }, { once: true });
}

async function switchExperiment(definition: ExperimentDefinition, snapshot: Readonly<StateV2>): Promise<void> {
  const generation = ++switchGeneration;
  app.dataset.loading = 'true';
  picker.disabled = true;
  const module = await definition.load();
  if (generation !== switchGeneration || destroyed) return;
  const next = module.createExperiment();
  activeExperiment?.destroy();
  stage.replaceChildren();
  currentDefinition = definition;
  picker.value = definition.id;
  stage.dataset.renderer = definition.renderer;
  stage.setAttribute('aria-label', `${definition.title} live traffic experiment`);
  next.mount({
    stage,
    project: (endpoint) => projector.project([endpoint.lng, endpoint.lat]),
    reducedMotion: () => reducedMotionQuery.matches,
    metrics: () => metrics.snapshot(),
  });
  activeExperiment = next;
  next.applySnapshot(snapshot);
  next.setPaused(effectivePause());
  resizeActiveExperiment();
  updateExperimentInformation(definition);
  updateExperimentURL(definition.id);
  app.dataset.loading = 'false';
  picker.disabled = false;
}

function configureSound(sonifier: RouteSonifier): void {
  soundVolume.value = String(Math.round(sonifier.getVolume() * 100));
  soundVolumeOutput.value = `${soundVolume.value}%`;
  soundScene.value = sonifier.getScene();
  sonifier.setStatusListener((soundStatus) => updateSoundButton(soundStatus));
  if (!sonifier.supported()) {
    soundButton.disabled = true;
    soundScene.disabled = true;
    soundVolume.disabled = true;
    soundButton.textContent = 'Sound unavailable';
    return;
  }
  soundButton.addEventListener('click', async () => {
    await sonifier.setEnabled(sonifier.status() !== 'on');
  });
  soundScene.addEventListener('change', () => sonifier.setScene(soundScene.value as SoundScene));
  soundVolume.addEventListener('input', () => {
    const percent = Math.max(0, Math.min(100, Number(soundVolume.value)));
    sonifier.setVolume(percent / 100);
    soundVolumeOutput.value = `${Math.round(percent)}%`;
  });
}

function updateSoundButton(soundStatus: SoundStatus): void {
  const label = soundStatus === 'on' ? 'Sound On' : soundStatus === 'resume' ? 'Tap to Resume' : 'Sound Off';
  soundButton.textContent = label;
  soundButton.dataset.state = soundStatus;
  soundButton.setAttribute('aria-pressed', String(soundStatus === 'on'));
}

function updateConnectionStatus(snapshot: Readonly<StateV2>): void {
  if (demoMode) return;
  const display = activityLabel(snapshot, streamConnected);
  status.dataset.state = display.state;
  statusText.textContent = display.text;
  status.title = `${snapshot.nodes.length.toLocaleString()} public nodes · ${snapshot.routes.length.toLocaleString()} public routes`;
}

function updateExperimentInformation(definition: ExperimentDefinition): void {
  infoStatus.textContent = definition.status;
  infoTitle.textContent = definition.title;
  infoSummary.textContent = definition.summary;
  infoExplanation.textContent = definition.explanation;
  document.title = `${definition.title} · CartoLite Labs`;
}

function updateExperimentURL(experiment: string): void {
  const next = new URL(location.href);
  next.searchParams.set('experiment', experiment);
  history.replaceState(null, '', `${next.pathname}${next.search}${next.hash}`);
}

function resizeActiveExperiment(): void {
  if (!activeExperiment) return;
  const viewport: LabViewport = {
    width: Math.max(1, stage.clientWidth),
    height: Math.max(1, stage.clientHeight),
    pixelRatio: Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2),
  };
  activeExperiment.resize(viewport);
}

function startFrames(): void {
  if (frameHandle !== undefined || document.hidden || destroyed) return;
  previousFrame = performance.now();
  const frame = (now: number): void => {
    frameHandle = undefined;
    if (document.hidden || destroyed) return;
    const delta = Math.min(100, Math.max(0, now - previousFrame));
    previousFrame = now;
    activeExperiment?.frame(now, delta);
    frameHandle = requestAnimationFrame(frame);
  };
  frameHandle = requestAnimationFrame(frame);
}

function stopFrames(): void {
  if (frameHandle !== undefined) cancelAnimationFrame(frameHandle);
  frameHandle = undefined;
}

function effectivePause(): boolean {
  return userPaused || document.hidden;
}

function applyPauseState(sonifier: RouteSonifier): void {
  const paused = effectivePause();
  activeExperiment?.setPaused(paused);
  sonifier.setPaused(paused);
}

function updateBurstState(): void {
  const burst = metrics.snapshot().burst;
  burstIndicator.hidden = !burst;
  app.dataset.burst = String(burst);
}

function setExhibition(enabled: boolean, requestFullscreen = true): void {
  exhibition = enabled;
  app.classList.toggle('exhibition', enabled);
  exhibitButton.setAttribute('aria-pressed', String(enabled));
  exhibitButton.textContent = enabled ? 'Exit Exhibit' : 'Exhibit';
  if (exhibitionTimer !== undefined) window.clearInterval(exhibitionTimer);
  exhibitionTimer = undefined;
  if (enabled) {
    exhibitionTimer = window.setInterval(() => {
      const index = EXPERIMENTS.findIndex((definition) => definition.id === currentDefinition.id);
      const next = EXPERIMENTS[(index + 1) % EXPERIMENTS.length]!;
      void switchExperiment(next, activeSnapshot()).catch(showFatal);
    }, 60_000);
    if (requestFullscreen && !document.fullscreenElement) void app.requestFullscreen?.().catch(() => undefined);
  } else if (requestFullscreen && document.fullscreenElement) {
    void document.exitFullscreen().catch(() => undefined);
  }
}

function activeSnapshot(): Readonly<StateV2> {
  if (!latestSnapshot) throw new Error('Labs state is not ready');
  return latestSnapshot;
}

async function liveFeedResume(feed: LiveFeed | undefined): Promise<void> {
  try {
    await feed?.resume();
  } catch {
    // LiveFeed owns retry backoff and user-facing connection state.
  }
}

interface WakeLockSentinel extends EventTarget {
  readonly released: boolean;
  release(): Promise<void>;
}

async function requestWakeLock(): Promise<void> {
  if (document.hidden || wakeLock && !wakeLock.released || !matchMedia('(pointer: coarse)').matches) return;
  const api = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> } }).wakeLock;
  if (!api) return;
  try {
    wakeLock = await api.request('screen');
  } catch {
    wakeLock = undefined;
  }
}

function releaseWakeLock(): void {
  const lock = wakeLock;
  wakeLock = undefined;
  if (lock && !lock.released) void lock.release().catch(() => undefined);
}

function showFatal(error: unknown): void {
  status.dataset.state = 'offline';
  statusText.textContent = 'Unavailable';
  fatal.textContent = error instanceof Error ? error.message : 'CartoLite Labs could not start';
  fatal.hidden = false;
  app.dataset.loading = 'false';
  picker.disabled = false;
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing Labs control: ${id}`);
  return element as T;
}
