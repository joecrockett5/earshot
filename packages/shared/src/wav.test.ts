import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWav } from './wav';

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

describe('encodeWav', () => {
  const left = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const right = new Float32Array([0, 0.25, -0.25, 2, -2]);

  it('writes a canonical 16-bit stereo header', () => {
    const bytes = encodeWav([left, right], 48000, 16);
    const view = new DataView(bytes.buffer);
    const dataBytes = 5 * 2 * 2;
    expect(bytes.byteLength).toBe(44 + dataBytes);
    expect(ascii(bytes, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + dataBytes);
    expect(ascii(bytes, 8, 4)).toBe('WAVE');
    expect(ascii(bytes, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2); // channels
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(28, true)).toBe(48000 * 4); // byte rate
    expect(view.getUint16(32, true)).toBe(4); // block align
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(bytes, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(dataBytes);
  });

  it('interleaves and scales 16-bit samples, clipping out-of-range input', () => {
    const view = new DataView(encodeWav([left, right], 44100, 16).buffer);
    const sample = (frame: number, channel: number) =>
      view.getInt16(44 + (frame * 2 + channel) * 2, true);
    expect(sample(0, 0)).toBe(0);
    expect(sample(1, 0)).toBe(Math.round(0.5 * 32767));
    expect(sample(1, 1)).toBe(Math.round(0.25 * 32767));
    expect(sample(2, 0)).toBe(Math.round(-0.5 * 32767));
    expect(sample(3, 0)).toBe(32767);
    expect(sample(3, 1)).toBe(32767); // 2.0 clipped
    expect(sample(4, 1)).toBe(-32767); // −2.0 clipped
  });

  it('writes 24-bit files with the right sizes', () => {
    const bytes = encodeWav([left, right], 44100, 24);
    const view = new DataView(bytes.buffer);
    expect(bytes.byteLength).toBe(44 + 5 * 2 * 3);
    expect(view.getUint16(34, true)).toBe(24);
    expect(view.getUint16(32, true)).toBe(6);
    expect(view.getUint32(28, true)).toBe(44100 * 6);
    expect(view.getUint32(40, true)).toBe(30);
    // Frame 3, left channel is +1.0 → 0x7FFFFF little-endian.
    expect([...bytes.subarray(44 + 18, 44 + 21)]).toEqual([0xff, 0xff, 0x7f]);
    // Frame 4, left channel is −1.0 → 0x800001 little-endian.
    expect([...bytes.subarray(44 + 24, 44 + 27)]).toEqual([0x01, 0x00, 0x80]);
  });

  it('supports mono', () => {
    const bytes = encodeWav([left], 22050);
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(22, true)).toBe(1);
    expect(bytes.byteLength).toBe(44 + 10);
  });

  it('rejects bad input', () => {
    expect(() => encodeWav([], 48000)).toThrow();
    expect(() => encodeWav([left, new Float32Array(2)], 48000)).toThrow();
    expect(() => encodeWav([left], 48000, 8 as 16)).toThrow();
  });
});

describe('decodeWav', () => {
  it.each([16, 24] as const)('round-trips %i-bit audio', (bitDepth) => {
    const left = Float32Array.from({ length: 64 }, (_, i) => Math.sin(i / 5) * 0.8);
    const right = Float32Array.from({ length: 64 }, (_, i) => Math.cos(i / 7) * -0.6);
    const decoded = decodeWav(encodeWav([left, right], 48000, bitDepth));
    expect(decoded.sampleRate).toBe(48000);
    expect(decoded.bitDepth).toBe(bitDepth);
    expect(decoded.channels).toHaveLength(2);
    const tolerance = bitDepth === 16 ? 4 : 6;
    for (let i = 0; i < 64; i++) {
      expect(decoded.channels[0]?.[i]).toBeCloseTo(left[i] ?? 0, tolerance);
      expect(decoded.channels[1]?.[i]).toBeCloseTo(right[i] ?? 0, tolerance);
    }
  });

  it('skips unknown chunks', () => {
    const wav = encodeWav([new Float32Array([0.5, -0.5])], 8000);
    const list = new Uint8Array([0x4c, 0x49, 0x53, 0x54, 3, 0, 0, 0, 1, 2, 3, 0]); // LIST + pad
    const withList = new Uint8Array(wav.length + list.length);
    withList.set(wav.subarray(0, 36));
    withList.set(list, 36);
    withList.set(wav.subarray(36), 36 + list.length);
    expect(decodeWav(withList).channels[0]?.length).toBe(2);
  });

  it('rejects things that are not PCM WAV', () => {
    expect(() => decodeWav(new Uint8Array(4))).toThrow(/Not a WAV/);
    expect(() => decodeWav(new TextEncoder().encode('RIFF....WAVE'))).toThrow(/no data chunk/);
    const float = encodeWav([new Float32Array(1)], 8000);
    float[20] = 3; // IEEE float format tag
    expect(() => decodeWav(float)).toThrow(/PCM/);
  });
});
