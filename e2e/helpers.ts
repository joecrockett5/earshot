import { readFile } from 'node:fs/promises';
import type { APIRequestContext, Download, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import {
  type ClipInfo,
  type CreateSoundInput,
  type Scene,
  type WavData,
  decodeWav,
  encodeWav,
} from '@earshot/shared';

export const SAMPLE_RATE = 48000;

/** A single sharp click followed by silence: ideal for measuring arrival time. */
export function clickWav(): Uint8Array {
  const samples = new Float32Array(SAMPLE_RATE / 4);
  // Start a little way in so the onset is unambiguous in the rendered file.
  const start = Math.round(0.05 * SAMPLE_RATE);
  for (let i = 0; i < 48; i++) samples[start + i] = 0.9 * (1 - i / 48);
  return encodeWav([samples], SAMPLE_RATE, 16);
}

export async function uploadClip(request: APIRequestContext, bytes: Uint8Array): Promise<ClipInfo> {
  const response = await request.post('/api/clips', {
    multipart: { file: { name: 'click.wav', mimeType: 'audio/wav', buffer: Buffer.from(bytes) } },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as ClipInfo;
}

export async function createSound(
  request: APIRequestContext,
  input: CreateSoundInput,
): Promise<Scene> {
  const response = await request.post('/api/sounds', { data: input });
  expect(response.status()).toBe(201);
  return (await response.json()) as Scene;
}

export async function waitForApp(page: Page): Promise<void> {
  await page.locator('.app[data-ready="true"]').waitFor();
}

export async function waitForSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'saved');
}

/** Click Export and return the decoded WAV the browser downloads. */
export async function exportWav(
  page: Page,
): Promise<{ download: Download; bytes: Buffer; wav: WavData }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export' }).click(),
  ]);
  const bytes = await readFile(await download.path());
  return { download, bytes, wav: decodeWav(bytes) };
}

/** Simulate dragging a file from the desktop and dropping it on the radar. */
export async function dropFile(
  page: Page,
  file: { name: string; type: string; bytes: Uint8Array },
  offset: { x: number; y: number },
): Promise<void> {
  const radar = page.getByTestId('radar');
  const box = await radar.boundingBox();
  if (!box) throw new Error('Radar is not visible');
  const clientX = box.x + box.width / 2 + offset.x;
  const clientY = box.y + box.height / 2 + offset.y;

  const dataTransfer = await page.evaluateHandle(
    ({ name, type, bytes }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], name, { type }));
      return transfer;
    },
    { name: file.name, type: file.type, bytes: Array.from(file.bytes) },
  );
  for (const type of ['dragenter', 'dragover', 'drop']) {
    await radar.dispatchEvent(type, { dataTransfer, clientX, clientY });
  }
}

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

/** Index of the first sample that reaches a tenth of the channel's own peak. */
export function onset(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return samples.findIndex((sample) => Math.abs(sample) >= peak * 0.1);
}
