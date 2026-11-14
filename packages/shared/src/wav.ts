export type BitDepth = 16 | 24;

export interface WavData {
  sampleRate: number;
  bitDepth: number;
  channels: Float32Array[];
}

const HEADER_BYTES = 44;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

/**
 * Encode planar float samples (−1…1) as a canonical PCM WAV file.
 * All channels must have the same length. Samples outside ±1 are clipped.
 */
export function encodeWav(
  channels: readonly Float32Array[],
  sampleRate: number,
  bitDepth: BitDepth = 16,
): Uint8Array<ArrayBuffer> {
  const first = channels[0];
  if (!first) throw new Error('encodeWav needs at least one channel');
  const frames = first.length;
  if (channels.some((channel) => channel.length !== frames)) {
    throw new Error('encodeWav channels must be the same length');
  }
  if (bitDepth !== 16 && bitDepth !== 24) throw new Error('encodeWav supports 16 or 24 bit');

  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels.length * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  const scale = bitDepth === 16 ? 0x7fff : 0x7fffff;
  let offset = HEADER_BYTES;
  for (let frame = 0; frame < frames; frame++) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame] ?? 0));
      const value = Math.round(sample * scale);
      if (bitDepth === 16) {
        view.setInt16(offset, value, true);
      } else {
        view.setUint8(offset, value & 0xff);
        view.setUint8(offset + 1, (value >> 8) & 0xff);
        view.setUint8(offset + 2, (value >> 16) & 0xff);
      }
      offset += bytesPerSample;
    }
  }
  return new Uint8Array(buffer);
}

/** Decode a PCM WAV file (16 or 24 bit) into planar float samples. */
export function decodeWav(bytes: Uint8Array): WavData {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.byteLength < 12 ||
    readAscii(view, 0, 4) !== 'RIFF' ||
    readAscii(view, 8, 4) !== 'WAVE'
  ) {
    throw new Error('Not a WAV file');
  }
  let format: { channels: number; sampleRate: number; bitDepth: number } | null = null;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      if (view.getUint16(body, true) !== 1) throw new Error('Only PCM WAV is supported');
      format = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitDepth: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      if (!format) throw new Error('WAV data chunk before fmt chunk');
      const { channels: count, sampleRate, bitDepth } = format;
      if (bitDepth !== 16 && bitDepth !== 24) throw new Error('Only 16 or 24 bit WAV is supported');
      const bytesPerSample = bitDepth / 8;
      const available = Math.min(size, bytes.byteLength - body);
      const frames = Math.floor(available / (bytesPerSample * count));
      const channels = Array.from({ length: count }, () => new Float32Array(frames));
      let cursor = body;
      for (let frame = 0; frame < frames; frame++) {
        for (const channel of channels) {
          if (bitDepth === 16) {
            channel[frame] = view.getInt16(cursor, true) / 0x7fff;
          } else {
            const value =
              view.getUint8(cursor) |
              (view.getUint8(cursor + 1) << 8) |
              (view.getInt8(cursor + 2) << 16);
            channel[frame] = value / 0x7fffff;
          }
          cursor += bytesPerSample;
        }
      }
      return { sampleRate, bitDepth, channels };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('WAV file has no data chunk');
}
