import type maplibregl from 'maplibre-gl';
import { routeDuration, segmentNearViewport, segmentTravelWeights } from './packetAnimator';
import type { PacketView } from './types';
import type { PacketKind } from './trafficVisuals';

const MASTER_LEVEL = 0.18;
const MIN_GAIN = 0.0001;
const LOOKAHEAD_SECONDS = 0.025;

interface Voice {
  root: number;
  intervals: readonly number[];
  waveform: OscillatorType;
}

const VOICES: Readonly<Record<PacketKind, Voice>> = {
  Advert: { root: 60, intervals: [0, 2, 4, 7, 9], waveform: 'sine' },
  Trace: { root: 62, intervals: [0, 2, 5, 7, 9], waveform: 'triangle' },
  Text: { root: 57, intervals: [0, 3, 5, 7, 10], waveform: 'sine' },
  ACK: { root: 67, intervals: [0, 2, 4, 7, 9], waveform: 'sine' },
  Control: { root: 64, intervals: [0, 3, 5, 7, 10], waveform: 'triangle' },
  Other: { root: 60, intervals: [0, 2, 5, 7, 9], waveform: 'sine' },
};

export interface HopNote {
  startMS: number;
  durationMS: number;
  frequency: number;
  pan: number;
  brightness: number;
  waveform: OscillatorType;
}

interface ViewportProjector {
  project(coordinates: [number, number]): { x: number; y: number };
}

export function routeSoundPlan(
  packet: PacketView,
  projector: ViewportProjector,
  width: number,
  height: number,
): HopNote[] {
  if (packet.mode !== 'route' || packet.segments.length === 0 || width <= 0 || height <= 0) return [];
  const projected = packet.segments.map((segment) => ({
    from: projector.project([segment.from.lng, segment.from.lat]),
    to: projector.project([segment.to.lng, segment.to.lat]),
  }));
  const weights = segmentTravelWeights(packet.segments);
  const totalDuration = routeDuration(packet.segments);
  const voice = VOICES[packet.payloadType] ?? VOICES.Other;
  const phraseSeed = stableHash(`${packet.id}|${packet.payloadType}`);
  let elapsed = 0;

  return packet.segments.flatMap((segment, index) => {
    const weight = weights[index] ?? 1 / packet.segments.length;
    const screen = projected[index]!;
    const startMS = Math.round(elapsed);
    elapsed += totalDuration * weight;
    if (!segmentIntersectsViewport(screen.from, screen.to, width, height)) return [];
    const midpointX = (screen.from.x + screen.to.x) / 2;
    const step = (phraseSeed + stableHash(`${segment.from.id}|${segment.to.id}`) + index * 2) % voice.intervals.length;
    const octave = index >= voice.intervals.length ? 12 : 0;
    const midi = voice.root + voice.intervals[step]! + octave;
    const note: HopNote = {
      startMS,
      durationMS: Math.round(Math.max(180, Math.min(480, totalDuration * weight * 0.78))),
      frequency: midiToFrequency(midi),
      pan: clamp((midpointX / width) * 1.5 - 0.75, -0.75, 0.75),
      brightness: Math.max(2_200, 5_400 - index * 320),
      waveform: voice.waveform,
    };
    return [note];
  });
}

export class RouteSonifier {
  private context?: AudioContext;
  private master?: GainNode;
  private enabled = false;
  private paused = false;
  private readonly active = new Set<OscillatorNode>();

  constructor(
    private readonly map: maplibregl.Map,
    private readonly viewport: HTMLElement,
  ) {}

  supported(): boolean {
    return typeof window.AudioContext === 'function';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    if (!enabled) {
      this.enabled = false;
      this.stopActive();
      this.setMasterLevel(MIN_GAIN);
      return false;
    }
    if (!this.supported()) return false;
    const context = this.context ?? this.createContext();
    try {
      if (context.state === 'suspended') await context.resume();
    } catch {
      return false;
    }
    this.enabled = context.state === 'running';
    this.setMasterLevel(this.enabled && !this.paused ? MASTER_LEVEL : MIN_GAIN);
    return this.enabled;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.stopActive();
    this.setMasterLevel(this.enabled && !paused ? MASTER_LEVEL : MIN_GAIN);
  }

  play(packet: PacketView): void {
    const context = this.context;
    if (!this.enabled || this.paused || !context || context.state !== 'running' || !this.master) return;
    const notes = routeSoundPlan(
      packet,
      this.map,
      this.viewport.clientWidth,
      this.viewport.clientHeight,
    );
    if (notes.length === 0) return;
    const density = 1 / Math.sqrt(1 + this.active.size / 10);
    for (const note of notes) this.schedule(note, density);
  }

  destroy(): void {
    this.enabled = false;
    this.stopActive();
    void this.context?.close();
    this.context = undefined;
    this.master = undefined;
  }

  private createContext(): AudioContext {
    const context = new window.AudioContext({ latencyHint: 'interactive' });
    const master = context.createGain();
    master.gain.value = MIN_GAIN;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 18;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.24;
    master.connect(compressor).connect(context.destination);
    this.context = context;
    this.master = master;
    return context;
  }

  private schedule(note: HopNote, density: number): void {
    const context = this.context!;
    const master = this.master!;
    const starts = context.currentTime + LOOKAHEAD_SECONDS + note.startMS / 1_000;
    const ends = starts + note.durationMS / 1_000;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(note.brightness, starts);
    filter.Q.value = 0.45;
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(note.pan, starts);
    const envelope = context.createGain();
    const peak = Math.max(0.012, 0.052 * density);
    envelope.gain.setValueAtTime(MIN_GAIN, starts);
    envelope.gain.exponentialRampToValueAtTime(peak, starts + 0.012);
    envelope.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, peak * 0.32), starts + note.durationMS / 2_400);
    envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, ends);
    filter.connect(panner).connect(envelope).connect(master);

    const oscillator = this.oscillator(note.waveform, note.frequency, starts, ends, filter);
    oscillator.onended = () => {
      this.active.delete(oscillator);
      oscillator.disconnect();
      filter.disconnect();
      panner.disconnect();
      envelope.disconnect();
    };
  }

  private oscillator(
    waveform: OscillatorType,
    frequency: number,
    starts: number,
    ends: number,
    destination: AudioNode,
  ): OscillatorNode {
    const oscillator = this.context!.createOscillator();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, starts);
    oscillator.connect(destination);
    oscillator.start(starts);
    oscillator.stop(ends + 0.04);
    this.active.add(oscillator);
    return oscillator;
  }

  private stopActive(): void {
    const now = this.context?.currentTime;
    for (const oscillator of this.active) {
      try {
        oscillator.stop(now === undefined ? undefined : now + 0.015);
      } catch {
        // It may already have ended between iteration and stop().
      }
    }
    this.active.clear();
  }

  private setMasterLevel(value: number): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(value, now, 0.018);
  }
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function segmentIntersectsViewport(
  from: { x: number; y: number },
  to: { x: number; y: number },
  width: number,
  height: number,
): boolean {
  if (!segmentNearViewport(from, to, width, height, 0)) return false;
  let start = 0;
  let end = 1;
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  for (const [direction, distance] of [
    [-deltaX, from.x],
    [deltaX, width - from.x],
    [-deltaY, from.y],
    [deltaY, height - from.y],
  ] as const) {
    if (direction === 0) {
      if (distance < 0) return false;
      continue;
    }
    const boundary = distance / direction;
    if (direction < 0) start = Math.max(start, boundary);
    else end = Math.min(end, boundary);
    if (start > end) return false;
  }
  return true;
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
