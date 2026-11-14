import { api } from '../api';

/**
 * Decoded clips, keyed by clip id. Decoding goes through an offline context so
 * it works before the first user gesture (a live AudioContext would be
 * blocked by autoplay policy until then).
 */
const buffers = new Map<string, AudioBuffer>();
const pending = new Map<string, Promise<AudioBuffer>>();
let decoder: OfflineAudioContext | null = null;

export function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  decoder ??= new OfflineAudioContext(1, 1, 48000);
  return decoder.decodeAudioData(data);
}

export function clipBuffers(): ReadonlyMap<string, AudioBuffer> {
  return buffers;
}

export function rememberClip(id: string, buffer: AudioBuffer): void {
  buffers.set(id, buffer);
}

/** Fetch and decode a stored clip, once. */
export function loadClip(id: string): Promise<AudioBuffer> {
  const ready = buffers.get(id);
  if (ready) return Promise.resolve(ready);
  let job = pending.get(id);
  if (!job) {
    job = (async () => {
      const response = await fetch(api.clipUrl(id));
      if (!response.ok) throw new Error(`Clip could not be loaded (${response.status})`);
      const buffer = await decodeAudio(await response.arrayBuffer());
      buffers.set(id, buffer);
      return buffer;
    })().finally(() => pending.delete(id));
    pending.set(id, job);
  }
  return job;
}
