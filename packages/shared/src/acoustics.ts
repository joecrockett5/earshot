import { MIN_DISTANCE, clamp } from './coords';
import type { DistanceModel, Scene, Source } from './schema';

/** Extra seconds rendered after the last clip so the reverb can ring out. */
export const REVERB_TAIL_SECONDS = 1.5;

/** Reference distance (metres) at which a source plays at its own gain. */
export const REF_DISTANCE = 1;

/**
 * Lowpass cutoff (Hz) for a source at `distance` metres. Air and obstacles
 * absorb treble first, so distant sounds are duller. Kept deliberately subtle:
 * fully open at 1 m, about 7 kHz at 10 m, never below 1.5 kHz.
 */
export function lowpassCutoff(distance: number): number {
  const d = Math.max(REF_DISTANCE, distance);
  return clamp(20000 / (1 + 0.2 * (d - REF_DISTANCE)), 1500, 20000);
}

/**
 * Gain of a source's send into the shared reverb. The direct sound falls off
 * with the panner's distance model; the reverb falls off more slowly, so far
 * sources sound relatively more reverberant, as they do in a real room.
 */
export function reverbSend(distance: number): number {
  return 1 / Math.sqrt(Math.max(REF_DISTANCE, distance));
}

/** Level of the reverb return for a 0–1 reverb amount. */
export function reverbWetGain(amount: number): number {
  return clamp(amount, 0, 1) * 0.6;
}

/**
 * Panner roll-off factor per distance model, chosen so that all three models
 * are distinct and none is silent at the radar's outer ring.
 */
export function rolloffFactor(model: DistanceModel): number {
  switch (model) {
    case 'inverse':
      return 1;
    case 'linear':
      return 0.9;
    case 'exponential':
      return 1.5;
  }
}

/** The distance actually sent to the panner: never inside the listener's head. */
export function effectiveDistance(distance: number, maxDistance: number): number {
  return clamp(distance, MIN_DISTANCE, Math.max(MIN_DISTANCE, maxDistance));
}

export function hasLoop(scene: Pick<Scene, 'sources'>): boolean {
  return scene.sources.some((source) => source.loop);
}

/**
 * Length of the rendered Sound in seconds.
 * - If anything loops: the user-set loop duration.
 * - Otherwise: the end of the last clip, plus a short tail when reverb is on.
 */
export function sceneDuration(scene: Pick<Scene, 'sources' | 'settings'>): number {
  if (scene.sources.length === 0) return 0;
  if (hasLoop(scene)) return scene.settings.loopDuration;
  const end = Math.max(...scene.sources.map((s) => s.startOffset + s.duration));
  return end + (scene.settings.reverb > 0 ? REVERB_TAIL_SECONDS : 0);
}

/** Whether a source's clip is audible at `time` seconds into the Sound. */
export function isSounding(
  source: Pick<Source, 'startOffset' | 'duration' | 'loop'>,
  time: number,
): boolean {
  if (time < source.startOffset) return false;
  return source.loop || time < source.startOffset + source.duration;
}

export interface Schedule {
  /** Seconds from "now" until the clip should start. */
  delay: number;
  /** Position within the clip, in seconds, to start from. */
  offset: number;
}

/**
 * When and where to start a source's clip if playback begins `from` seconds
 * into the Sound. Returns null if the clip has already finished.
 */
export function scheduleSource(
  source: Pick<Source, 'startOffset' | 'duration' | 'loop'>,
  from: number,
): Schedule | null {
  if (source.duration <= 0) return null;
  if (from <= source.startOffset) return { delay: source.startOffset - from, offset: 0 };
  const elapsed = from - source.startOffset;
  if (source.loop) return { delay: 0, offset: elapsed % source.duration };
  if (elapsed < source.duration) return { delay: 0, offset: elapsed };
  return null;
}

/** Small deterministic PRNG (mulberry32) so impulse responses are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ImpulseOptions {
  sampleRate: number;
  /** Total length in seconds. */
  seconds?: number;
  /** Time for the tail to decay by 60 dB. */
  rt60?: number;
  /** Silence before the reverb begins, separating it from the direct sound. */
  preDelay?: number;
}

/**
 * Synthesise a stereo room impulse response: exponentially decaying noise
 * that gets darker as it decays, decorrelated between the two channels.
 * Deterministic, so live preview and export use an identical room.
 */
export function generateImpulseResponse(options: ImpulseOptions): [Float32Array, Float32Array] {
  const { sampleRate, seconds = 1.4, rt60 = 0.9, preDelay = 0.012 } = options;
  const length = Math.max(1, Math.round(seconds * sampleRate));
  const start = Math.min(length - 1, Math.round(preDelay * sampleRate));
  const decay = Math.log(1000) / rt60; // 60 dB
  const channels: [Float32Array, Float32Array] = [
    new Float32Array(length),
    new Float32Array(length),
  ];
  channels.forEach((data, channel) => {
    const random = mulberry32(0x5eed + channel * 7919);
    let low = 0;
    for (let i = start; i < length; i++) {
      const t = (i - start) / sampleRate;
      // One-pole lowpass whose cutoff slides from ~9 kHz down to ~1.5 kHz.
      const cutoff = 1500 + 7500 * Math.exp(-t * 4);
      const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
      low += alpha * (random() * 2 - 1 - low);
      data[i] = low * Math.exp(-decay * t);
    }
  });
  return channels;
}
