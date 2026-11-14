import { type BitDepth, type Scene, encodeWav, sceneDuration } from '@earshot/shared';
import { buildGraph } from './graph';

/** Render a scene to stereo with the same graph the live preview uses. */
export async function renderScene(
  scene: Scene,
  buffers: ReadonlyMap<string, AudioBuffer>,
): Promise<AudioBuffer> {
  const sampleRate = scene.settings.exportSampleRate;
  const frames = Math.max(1, Math.ceil(sceneDuration(scene) * sampleRate));
  const ctx = new OfflineAudioContext(2, frames, sampleRate);
  buildGraph(ctx, scene, buffers, 0, 0);
  return ctx.startRendering();
}

const PEAK_CEILING = 0.999;

/**
 * Encode a rendered buffer as WAV. If the mix would clip, the whole file is
 * turned down just enough to fit; relative levels and timing are untouched.
 */
export function renderedToWav(rendered: AudioBuffer, bitDepth: BitDepth): Blob {
  const channels = Array.from({ length: rendered.numberOfChannels }, (_, i) =>
    rendered.getChannelData(i),
  );
  let peak = 0;
  for (const channel of channels) {
    for (const sample of channel) {
      const magnitude = Math.abs(sample);
      if (magnitude > peak) peak = magnitude;
    }
  }
  if (peak > PEAK_CEILING) {
    const scale = PEAK_CEILING / peak;
    for (const channel of channels) {
      for (let i = 0; i < channel.length; i++) channel[i] = (channel[i] ?? 0) * scale;
    }
  }
  return new Blob([encodeWav(channels, rendered.sampleRate, bitDepth)], { type: 'audio/wav' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
