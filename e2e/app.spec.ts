import { expect, test } from '@playwright/test';
import { clickWav, dropFile, exportWav, waitForApp, waitForSaved } from './helpers';

test('create a Sound, drop a clip, move it, change a setting, reload and export', async ({
  page,
}) => {
  await page.goto('/');
  await waitForApp(page);

  // Create a Sound and give it a name.
  await page.getByRole('button', { name: 'New' }).click();
  const title = page.getByRole('textbox', { name: 'Sound name' });
  await expect(title).toHaveValue('Untitled sound');
  await title.fill('Kitchen at night');
  await title.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Sounds' })).toContainText('Kitchen at night');
  await expect(page.getByText('Drop a sound anywhere around the listener')).toBeVisible();

  // Drop an audio file to the front-right of the listener.
  await dropFile(
    page,
    { name: 'Door click.wav', type: 'audio/wav', bytes: clickWav() },
    { x: 90, y: -90 },
  );
  const dot = page.getByTestId('source-dot');
  await expect(dot).toHaveCount(1);
  await expect(dot).toContainText('Door click');
  expect(Number(await dot.getAttribute('data-angle'))).toBeCloseTo(45, 0);
  await expect(page.getByRole('complementary', { name: 'Source properties' })).toBeVisible();

  // Drag the dot round to the left of the listener.
  const radarBox = (await page.getByTestId('radar').boundingBox())!;
  const centre = { x: radarBox.x + radarBox.width / 2, y: radarBox.y + radarBox.height / 2 };
  const dotBox = (await dot.locator('.dot__core').boundingBox())!;
  await page.mouse.move(dotBox.x + dotBox.width / 2, dotBox.y + dotBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(centre.x, centre.y - 120, { steps: 6 });
  await page.mouse.move(centre.x - 150, centre.y, { steps: 6 });
  await page.mouse.up();
  await expect(dot).toHaveAttribute('data-angle', '270.00');
  const movedDistance = await dot.getAttribute('data-distance');

  // Keyboard nudging rotates the selected source.
  await dot.focus();
  await page.keyboard.press('ArrowRight');
  await expect(dot).toHaveAttribute('data-angle', '275.00');

  // Change a setting.
  await page.getByTestId('open-settings').click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await settings.getByRole('radio', { name: '24-bit' }).check();
  await settings.getByRole('button', { name: 'Close settings' }).click();
  await expect(settings).toBeHidden();
  await waitForSaved(page);

  // Everything survives a reload.
  await page.reload();
  await waitForApp(page);
  await expect(page.getByRole('textbox', { name: 'Sound name' })).toHaveValue('Kitchen at night');
  await expect(dot).toHaveCount(1);
  await expect(dot).toHaveAttribute('data-angle', '275.00');
  await expect(dot).toHaveAttribute('data-distance', movedDistance!);
  await page.getByTestId('open-settings').click();
  await expect(settings.getByRole('radio', { name: '24-bit' })).toBeChecked();
  await page.keyboard.press('Escape');

  // Export produces a real stereo WAV at the chosen bit depth.
  const { download, bytes, wav } = await exportWav(page);
  expect(download.suggestedFilename()).toBe('kitchen-at-night.wav');
  expect(bytes.length).toBeGreaterThan(44);
  expect(wav.bitDepth).toBe(24);
  expect(wav.channels).toHaveLength(2);
  expect(
    Math.max(
      ...wav.channels.map((channel) => channel.reduce((m, s) => Math.max(m, Math.abs(s)), 0)),
    ),
  ).toBeGreaterThan(0.001);
});

test('load the demo, play it and delete a source with the keyboard', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('button', { name: 'Load demo' }).click();

  const dots = page.getByTestId('source-dot');
  await expect(dots).toHaveCount(4);
  await expect(page.getByRole('textbox', { name: 'Sound name' })).toHaveValue(/Demo/);
  // The knock sits directly behind the listener.
  await expect(dots.filter({ hasText: 'Knock' })).toHaveAttribute('data-angle', '180.00');

  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.locator('.dot--sounding').first()).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

  await dots.filter({ hasText: 'Chime' }).click();
  await page.keyboard.press('Delete');
  await expect(dots).toHaveCount(3);
});
