/**
 * Synthesises the demo clips shipped with the web app. Everything is generated
 * from maths and a seeded noise source, so the output is reproducible and
 * there are no third-party recordings to license.
 *
 *   npm run demo:sounds
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { encodeWav } from '@earshot/shared';

const SAMPLE_RATE = 44100;
const OUT_DIR = path.resolve(import.meta.dirname, '../apps/web/public/demo');
const TAU = Math.PI * 2;

/** Small deterministic PRNG (mulberry32) returning values in [-1, 1). */
function noiseSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
  };
}

function buffer(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * SAMPLE_RATE));
}

/** One-pole lowpass coefficient for a cutoff in Hz. */
function lowpassCoefficient(cutoff: number): number {
  return 1 - Math.exp((-TAU * cutoff) / SAMPLE_RATE);
}

/** Scale so the loudest sample sits at `peak`, and fade the last few ms to zero. */
function finish(samples: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const sample of samples) max = Math.max(max, Math.abs(sample));
  const scale = max > 0 ? peak / max : 1;
  const fade = Math.min(samples.length, Math.round(0.02 * SAMPLE_RATE));
  for (let i = 0; i < samples.length; i++) {
    const tail = Math.min(1, (samples.length - 1 - i) / fade);
    samples[i] = samples[i]! * scale * tail;
  }
  return samples;
}

/** Three knuckle raps on a wooden door. */
function knock(): Float32Array {
  const out = buffer(1.1);
  const noise = noiseSource(11);
  const modes = [
    { freq: 142, decay: 38, level: 1 },
    { freq: 311, decay: 55, level: 0.7 },
    { freq: 587, decay: 80, level: 0.45 },
    { freq: 1240, decay: 140, level: 0.22 },
  ];
  const raps = [
    { at: 0.02, level: 0.85 },
    { at: 0.24, level: 1 },
    { at: 0.46, level: 0.9 },
  ];
  for (const rap of raps) {
    const start = Math.round(rap.at * SAMPLE_RATE);
    let filtered = 0;
    const k = lowpassCoefficient(3200);
    for (let i = 0; start + i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      let sample = 0;
      for (const mode of modes) {
        sample += mode.level * Math.exp(-mode.decay * t) * Math.sin(TAU * mode.freq * t);
      }
      // A few milliseconds of filtered noise give the knuckle its hard attack.
      filtered += k * (noise() - filtered);
      sample += 1.6 * filtered * Math.exp(-420 * t);
      out[start + i] = out[start + i]! + rap.level * sample;
    }
  }
  return finish(out, 0.9);
}

/** Six unhurried steps on a hard floor, getting slightly louder as they approach. */
function footsteps(): Float32Array {
  const out = buffer(3.9);
  const noise = noiseSource(23);
  const steps = 6;
  for (let step = 0; step < steps; step++) {
    const at = 0.05 + step * 0.62 + (step % 2) * 0.03;
    const level = 0.55 + 0.45 * (step / (steps - 1));
    const left = step % 2 === 0;
    // Each step is a heel strike followed ~90 ms later by a softer sole slap.
    const parts = [
      { offset: 0, level: 1, thump: left ? 92 : 104, cutoff: 1900, decay: 55 },
      { offset: 0.09, level: 0.5, thump: left ? 150 : 165, cutoff: 3400, decay: 90 },
    ];
    for (const part of parts) {
      const start = Math.round((at + part.offset) * SAMPLE_RATE);
      const k = lowpassCoefficient(part.cutoff);
      let filtered = 0;
      for (let i = 0; start + i < out.length && i < SAMPLE_RATE * 0.3; i++) {
        const t = i / SAMPLE_RATE;
        filtered += k * (noise() - filtered);
        const scuff = 2.2 * filtered * Math.exp(-part.decay * t);
        const thump = Math.exp(-48 * t) * Math.sin(TAU * part.thump * t);
        const click = 0.5 * Math.exp(-900 * t) * Math.sin(TAU * 2100 * t);
        out[start + i] = out[start + i]! + level * part.level * (scuff + thump + click);
      }
    }
  }
  return finish(out, 0.85);
}

/** Two strikes of a small metal chime, built from inharmonic partials. */
function chime(): Float32Array {
  const out = buffer(3.4);
  // Partial ratios of a struck bar: bright, slightly dissonant, clearly "metal".
  const partials = [
    { ratio: 1, level: 1, decay: 1.6 },
    { ratio: 2.756, level: 0.55, decay: 2.6 },
    { ratio: 5.404, level: 0.3, decay: 4.2 },
    { ratio: 8.933, level: 0.14, decay: 7 },
  ];
  const strikes = [
    { at: 0.02, freq: 1318.5, level: 1 },
    { at: 0.5, freq: 1046.5, level: 0.9 },
  ];
  for (const strike of strikes) {
    const start = Math.round(strike.at * SAMPLE_RATE);
    for (let i = 0; start + i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const attack = Math.min(1, t / 0.002);
      let sample = 0;
      for (const partial of partials) {
        const freq = strike.freq * partial.ratio;
        if (freq > SAMPLE_RATE / 2.2) continue;
        sample += partial.level * Math.exp(-partial.decay * t) * Math.sin(TAU * freq * t);
      }
      out[start + i] = out[start + i]! + strike.level * attack * sample;
    }
  }
  return finish(out, 0.8);
}

/** The soft electrical hum of a room: mains harmonics plus a breath of air noise. */
function hum(): Float32Array {
  const seconds = 8;
  const out = buffer(seconds);
  const noise = noiseSource(47);
  const harmonics = [
    { freq: 60, level: 0.5 },
    { freq: 120, level: 1 },
    { freq: 180, level: 0.4 },
    { freq: 240, level: 0.3 },
    { freq: 360, level: 0.12 },
  ];
  const k = lowpassCoefficient(900);
  let air = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const drift = 1 + 0.08 * Math.sin(TAU * 0.23 * t) + 0.04 * Math.sin(TAU * 0.71 * t);
    let sample = 0;
    for (const harmonic of harmonics) sample += harmonic.level * Math.sin(TAU * harmonic.freq * t);
    air += k * (noise() - air);
    const fade = Math.min(1, t / 0.6, (seconds - t) / 1.2);
    out[i] = (sample * drift + 1.4 * air) * fade;
  }
  return finish(out, 0.5);
}

const clips: Record<string, () => Float32Array> = { knock, footsteps, chime, hum };

await mkdir(OUT_DIR, { recursive: true });
for (const [name, synthesise] of Object.entries(clips)) {
  const samples = synthesise();
  const file = path.join(OUT_DIR, `${name}.wav`);
  await writeFile(file, encodeWav([samples], SAMPLE_RATE, 16));
  console.log(
    `${path.relative(process.cwd(), file)}  ${(samples.length / SAMPLE_RATE).toFixed(2)} s`,
  );
}
