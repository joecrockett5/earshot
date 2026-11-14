import { type APIRequestContext, type Page, expect, test } from '@playwright/test';
import { DEFAULT_SETTINGS, newId } from '@earshot/shared';
import {
  SAMPLE_RATE,
  clickWav,
  createSound,
  exportWav,
  onset,
  rms,
  uploadClip,
  waitForApp,
} from './helpers';

/**
 * The proof that the app spatialises: a click placed to one side must arrive
 * at the near ear both louder and earlier. The scene is rendered by the real
 * export path (OfflineAudioContext + HRTF panner) in headless Chromium and the
 * downloaded WAV is analysed here.
 */
async function renderClickAt(page: Page, request: APIRequestContext, angle: number) {
  const clip = await uploadClip(request, clickWav());
  const sound = await createSound(request, {
    name: `Click at ${angle}`,
    // No reverb: only the direct, panned path should reach the ears.
    settings: { ...DEFAULT_SETTINGS, reverb: 0, exportSampleRate: SAMPLE_RATE },
    sources: [
      {
        id: newId(),
        clipId: clip.id,
        label: 'Click',
        angle,
        distance: 2,
        startOffset: 0,
        gain: 1,
        loop: false,
        duration: 0.25,
      },
    ],
  });

  await page.goto(`/#${sound.id}`);
  await waitForApp(page);
  await expect(page.getByTestId('source-dot')).toHaveCount(1);

  const { wav } = await exportWav(page);
  expect(wav.sampleRate).toBe(SAMPLE_RATE);
  expect(wav.channels).toHaveLength(2);
  const [left, right] = wav.channels as [Float32Array, Float32Array];
  return {
    left: { rms: rms(left), onset: onset(left) },
    right: { rms: rms(right), onset: onset(right) },
  };
}

test.describe('spatialisation', () => {
  test('a click placed hard right is louder and earlier in the right ear', async ({
    page,
    request,
  }) => {
    const { left, right } = await renderClickAt(page, request, 90);
    expect(right.rms).toBeGreaterThan(0);
    expect(right.rms).toBeGreaterThan(left.rms * 1.5);
    expect(right.onset).toBeGreaterThanOrEqual(0);
    expect(right.onset).toBeLessThan(left.onset);
    // The interaural delay of a human head is well under a millisecond.
    expect(left.onset - right.onset).toBeLessThan(SAMPLE_RATE * 0.0015);
  });

  test('a click placed hard left is louder and earlier in the left ear', async ({
    page,
    request,
  }) => {
    const { left, right } = await renderClickAt(page, request, 270);
    expect(left.rms).toBeGreaterThan(0);
    expect(left.rms).toBeGreaterThan(right.rms * 1.5);
    expect(left.onset).toBeGreaterThanOrEqual(0);
    expect(left.onset).toBeLessThan(right.onset);
    expect(right.onset - left.onset).toBeLessThan(SAMPLE_RATE * 0.0015);
  });
});
