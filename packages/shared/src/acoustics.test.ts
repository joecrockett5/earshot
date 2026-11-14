import { describe, expect, it } from 'vitest';
import {
  REVERB_TAIL_SECONDS,
  effectiveDistance,
  generateImpulseResponse,
  isSounding,
  lowpassCutoff,
  reverbSend,
  reverbWetGain,
  rolloffFactor,
  sceneDuration,
  scheduleSource,
} from './acoustics';
import { DEFAULT_SETTINGS } from './schema';

const clip = (startOffset: number, duration: number, loop = false) => ({
  startOffset,
  duration,
  loop,
});

describe('distance cues', () => {
  it('lowpass is fully open up close and darker with distance, within bounds', () => {
    expect(lowpassCutoff(0.3)).toBe(20000);
    expect(lowpassCutoff(1)).toBe(20000);
    expect(lowpassCutoff(10)).toBeGreaterThan(6000);
    expect(lowpassCutoff(10)).toBeLessThan(8000);
    expect(lowpassCutoff(5)).toBeGreaterThan(lowpassCutoff(10));
    expect(lowpassCutoff(1000)).toBe(1500);
  });

  it('reverb send falls more slowly than inverse distance', () => {
    expect(reverbSend(0.5)).toBe(1);
    expect(reverbSend(4)).toBeCloseTo(0.5);
    expect(reverbSend(10)).toBeGreaterThan(1 / 10);
  });

  it('wet gain scales with the reverb amount and is clamped', () => {
    expect(reverbWetGain(0)).toBe(0);
    expect(reverbWetGain(0.5)).toBeCloseTo(0.3);
    expect(reverbWetGain(5)).toBeCloseTo(0.6);
  });

  it('gives each distance model its own roll-off', () => {
    const factors = (['inverse', 'linear', 'exponential'] as const).map(rolloffFactor);
    expect(new Set(factors).size).toBe(3);
    expect(rolloffFactor('linear')).toBeLessThan(1); // never silent at the outer ring
  });

  it('effectiveDistance keeps the source out of the head', () => {
    expect(effectiveDistance(0, 10)).toBe(0.25);
    expect(effectiveDistance(12, 10)).toBe(10);
  });
});

describe('sceneDuration', () => {
  const settings = DEFAULT_SETTINGS;

  it('is zero for an empty scene', () => {
    expect(sceneDuration({ sources: [], settings })).toBe(0);
  });

  it('ends with the last clip plus a reverb tail', () => {
    const sources = [clip(0, 2), clip(3, 1.5)];
    expect(sceneDuration({ sources, settings })).toBeCloseTo(4.5 + REVERB_TAIL_SECONDS);
  });

  it('has no tail when reverb is off', () => {
    expect(sceneDuration({ sources: [clip(1, 2)], settings: { ...settings, reverb: 0 } })).toBe(3);
  });

  it('uses the loop duration when anything loops', () => {
    const sources = [clip(0, 2), clip(0, 1, true)];
    expect(sceneDuration({ sources, settings: { ...settings, loopDuration: 12 } })).toBe(12);
  });
});

describe('timing', () => {
  it('isSounding covers exactly the span of the clip', () => {
    expect(isSounding(clip(1, 2), 0.9)).toBe(false);
    expect(isSounding(clip(1, 2), 1)).toBe(true);
    expect(isSounding(clip(1, 2), 2.99)).toBe(true);
    expect(isSounding(clip(1, 2), 3)).toBe(false);
    expect(isSounding(clip(1, 2, true), 300)).toBe(true);
  });

  it('scheduleSource delays clips that have not started', () => {
    expect(scheduleSource(clip(2, 1), 0.5)).toEqual({ delay: 1.5, offset: 0 });
  });

  it('scheduleSource resumes part-way through a clip', () => {
    expect(scheduleSource(clip(2, 4), 3)).toEqual({ delay: 0, offset: 1 });
  });

  it('scheduleSource skips finished clips and wraps looping ones', () => {
    expect(scheduleSource(clip(0, 1), 5)).toBeNull();
    expect(scheduleSource(clip(0, 2, true), 5)).toEqual({ delay: 0, offset: 1 });
    expect(scheduleSource(clip(0, 0, true), 5)).toBeNull();
  });
});

describe('generateImpulseResponse', () => {
  const [left, right] = generateImpulseResponse({ sampleRate: 48000 });

  it('has the requested length and two decorrelated channels', () => {
    expect(left.length).toBe(Math.round(1.4 * 48000));
    expect(right.length).toBe(left.length);
    expect(left.some((v, i) => v !== right[i])).toBe(true);
  });

  it('starts with a silent pre-delay', () => {
    const preDelay = Math.round(0.012 * 48000);
    expect(left.subarray(0, preDelay).every((v) => v === 0)).toBe(true);
    expect(left.subarray(preDelay, preDelay + 200).some((v) => v !== 0)).toBe(true);
  });

  it('decays', () => {
    const rms = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += (left[i] ?? 0) ** 2;
      return Math.sqrt(sum / (to - from));
    };
    const early = rms(1000, 5000);
    const late = rms(left.length - 5000, left.length - 1000);
    expect(late).toBeLessThan(early * 0.01);
    expect(left.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
  });

  it('is deterministic', () => {
    const [again] = generateImpulseResponse({ sampleRate: 48000 });
    expect(again).toEqual(left);
  });
});
