import { required } from '../dom';
import { requestScreenAwake as requestWakeLock, releaseScreenAwake as releaseWakeLock } from '../screenAwake';
import { mountMobileDock } from '../mobileDock';
import { addViewGuide, closeHelpBackdrop } from '../viewHelp';
import { trackPanelHistory } from '../cinematicChrome';
import { initializeDisplay, DISPLAY_EVENT, displayPreferences, prefersReducedMotion } from '../displayPreferences';
import { mountDisplayControls } from '../displayControls';
import { mountSoundPreview } from '../soundPreview';
import { populateSoundScenes, syncSoundScene } from '../soundScenes';
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
  labPixelRatio,
  normalizeLabPacket,
  type ExperimentDefinition,
  type LabExperiment,
  type LabViewport,
} from './runtime';

initializeDisplay();
const app = required<HTMLElement>('labs-app');
const stage = required<HTMLElement>('labs-stage');
const status = required<HTMLElement>('labs-status');
const statusText = required<HTMLElement>('labs-status-text');
const picker = required<HTMLSelectElement>('experiment-select');
const pauseButton = required<HTMLButtonElement>('pause-button');
const soundButton = required<HTMLButtonElement>('sound-button');
const soundScene = required<HTMLSelectElement>('sound-scene');
populateSoundScenes(soundScene);
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
addViewGuide(infoDialog, 'Labs');
infoButton.textContent = 'Help & controls';
infoButton.setAttribute('aria-controls', 'info-dialog');
infoButton.addEventListener('click', () => {
  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) dialog.close();
  infoDialog.showModal();
  infoDialog.scrollTop = 0;
});
infoClose.addEventListener('click', () => infoDialog.close());
infoDialog.addEventListener('click', event => closeHelpBackdrop(infoDialog, event));
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
let adaptiveEconomy = false;
let expensiveFrames = 0;
let exhibition = false;
let exhibitionTimer: number | undefined;
let burstTimer: number | undefined;
let destroyed = false;
let latestSnapshot: Readonly<StateV2> | undefined;
let captionUntil = 0;

for (const definition of EXPERIMENTS) {
  const option = document.createElement('option');
  option.value = definition.id;
  option.textContent = definition.title;
  picker.append(option);
}
picker.value = currentDefinition.id;

const labControls=document.querySelector<HTMLElement>('.labs-controls')!;
const soundOptions=document.createElement('details');soundOptions.id='labs-sound-options';
soundOptions.innerHTML='<summary>Voice & volume</summary><div class="labs-sound-body glass"></div>';
const soundBody=soundOptions.querySelector<HTMLElement>('div')!;
for(const label of labControls.querySelectorAll<HTMLElement>('.compact-field,.volume-field'))soundBody.append(label);
labControls.append(soundOptions);
document.addEventListener('pointerdown',event=>{if(event.target instanceof Node&&!soundOptions.contains(event.target))soundOptions.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&soundOptions.open){soundOptions.open=false;soundOptions.querySelector<HTMLElement>('summary')!.focus();}});
const displayDialog = document.createElement('dialog'); displayDialog.id='labs-display'; displayDialog.className='labs-display glass'; displayDialog.setAttribute('aria-label','Display settings');
displayDialog.innerHTML='<header><strong>Display</strong><button type="button" aria-label="Close display settings">×</button></header>';
const displayButton=document.createElement('button');displayButton.id='labs-display-button';displayButton.type='button';displayButton.textContent='Display';displayButton.setAttribute('aria-haspopup','dialog');
document.querySelector('.labs-controls')!.append(displayButton);app.append(displayDialog);
mountDisplayControls(displayDialog,'labs');
displayButton.addEventListener('click',()=>displayDialog.showModal());
displayDialog.querySelector('button')!.addEventListener('click',()=>{displayDialog.close();displayButton.focus();});
const navigation = document.createElement('nav'); navigation.className='dock-views'; navigation.setAttribute('aria-label','Views');
navigation.innerHTML='<a class="control-button" href="/" aria-label="Open CartoLite map">Map</a><a class="control-button" href="/netgraph/" aria-label="Open CartoLite Netgraph">Netgraph</a><a class="control-button" href="/terminal/" aria-label="Open CartoLite Terminal">Terminal</a><a class="control-button" href="/chronoscope/" aria-label="Open CartoLite Chronoscope">Chronoscope</a><a class="control-button" href="/labs/" aria-current="page" aria-label="Open CartoLite Labs">Labs</a>';
mountMobileDock(labControls, navigation, 'Labs');
trackPanelHistory(labControls, ['labs-display', 'info-dialog', 'view-panel']);
let qualityPreference = displayPreferences().quality;
window.addEventListener(DISPLAY_EVENT,()=>{
  if (qualityPreference !== displayPreferences().quality) {
    qualityPreference = displayPreferences().quality;
    adaptiveEconomy = false; expensiveFrames = 0;
  }
  resizeActiveExperiment();
});
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
    mountSoundPreview(routeSonifier, soundBody);
    updateExperimentInformation(currentDefinition);
    await switchExperiment(currentDefinition, liveStore.snapshot);
    if (destroyed) return;

    unsubscribe = liveStore.subscribe((snapshot, changes) => {
      latestSnapshot = snapshot;
      if (changes) activeExperiment?.applySnapshot(snapshot);
      updateConnectionStatus(liveStore.snapshot);
    });

    const handlePacket = (event: PacketEventV2, replayed = false): void => {
      const packetView = liveStore.applyPacket(event);
      if (!packetView || replayed) return;
      const packet = normalizeLabPacket(packetView);
      metrics.record(packet);
      if (!effectivePause() && performance.now() >= captionUntil) liveCaption.textContent = captionFor(packet);
      if (!effectivePause()) {
        activeExperiment?.handlePacket(packet);
        routeSonifier.play(packetView, activeExperiment?.soundCharacter);
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
          showFeedback(userPaused ? 'Live stream restored. Motion is still paused.' : 'Live stream restored.');
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
      showFeedback(userPaused ? 'Paused. Live traffic continues; motion and sound are paused.' : 'Resumed. New live packets animate as they arrive.');
    });
    resetButton.addEventListener('click', () => {
      metrics.reset();
      activeExperiment?.reset();
      activeExperiment?.applySnapshot(liveStore.snapshot);
      showFeedback(userPaused ? 'Scene reset. Paused. Live traffic continues.' : 'Scene reset. Live traffic continues.');
      updateBurstState();
    });
    exhibitButton.addEventListener('click', () => setExhibition(!exhibition));

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

  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
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
  });
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
  delete stage.dataset.assets;
  stage.setAttribute('aria-label', `${definition.title} live traffic experiment`);
  next.mount({
    stage,
    project: (endpoint) => projector.project([endpoint.lng, endpoint.lat]),
    reducedMotion: () => prefersReducedMotion() || displayPreferences().effects === 'minimal',
    metrics: () => metrics.snapshot(),
  });
  activeExperiment = next;
  adaptiveEconomy = false; expensiveFrames = 0;
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
  syncSoundScene(soundScene, sonifier.getScene());
  sonifier.setStatusListener((soundStatus) => {
    syncSoundScene(soundScene, sonifier.getScene());
    updateSoundButton(soundStatus);
  });
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
  history.replaceState(history.state, '', `${next.pathname}${next.search}${next.hash}`);
}

function resizeActiveExperiment(): void {
  if (!activeExperiment) return;
  const viewport: LabViewport = {
    width: Math.max(1, stage.clientWidth),
    height: Math.max(1, stage.clientHeight),
    pixelRatio: labPixelRatio(displayPreferences().quality, adaptiveEconomy, devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches),
  };
  const quality = displayPreferences().quality;
  const economy = quality === 'economy' || (quality === 'auto' && adaptiveEconomy);
  stage.dataset.qualityMode = economy ? 'economy' : 'high';
  required('labs-quality-status').textContent = quality === 'auto'
    ? economy ? 'Automatic: reduced resolution to keep the scene responsive.' : 'Automatic: full scene resolution.'
    : quality === 'high' ? 'High: full scene resolution.' : 'Economy: reduced scene resolution.';
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
    const started = performance.now();
    activeExperiment?.frame(now, delta);
    if (displayPreferences().quality === 'auto' && !adaptiveEconomy) {
      expensiveFrames = performance.now() - started > 14 ? expensiveFrames + 1 : Math.max(0, expensiveFrames - 1);
      if (expensiveFrames >= 30) { adaptiveEconomy = true; resizeActiveExperiment(); }
    }
    frameHandle = requestAnimationFrame(frame);
  };
  frameHandle = requestAnimationFrame(frame);
}

function stopFrames(): void {
  if (frameHandle !== undefined) cancelAnimationFrame(frameHandle);
  frameHandle = undefined;
}

function showFeedback(message: string): void {
  captionUntil = performance.now() + 4_000;
  liveCaption.textContent = message;
  required('labs-announcement').textContent = message;
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

function showFatal(error: unknown): void {
  status.dataset.state = 'offline';
  statusText.textContent = 'Unavailable';
  console.warn('Labs could not start:', error);
  fatal.hidden = false;
  app.dataset.loading = 'false';
  picker.disabled = false;
}
