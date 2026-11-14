/**
 * Regenerates the README screenshots and the usage GIF from the real app.
 *
 *   npm run media
 *
 * Starts the built server on a temporary data directory seeded with the demo
 * Sound, drives it with headless Chromium, and writes everything to docs/media.
 * Needs ffmpeg on the PATH for the GIF.
 */
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type Browser, type Page, chromium } from '@playwright/test';
import {
  type ClipInfo,
  DEMO_CLIPS,
  DEMO_SOUND_NAME,
  type Scene,
  decodeWav,
  newId,
} from '@earshot/shared';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'docs/media');
const DEMO_DIR = path.join(ROOT, 'apps/web/public/demo');
const PORT = Number(process.env.MEDIA_PORT ?? 4180);
const BASE = `http://127.0.0.1:${PORT}`;
const VIEWPORT = { width: 1280, height: 800 };
const GIF_WIDTH = 800;
const GIF_FPS = 15;
const GIF_LIMIT_BYTES = 8 * 1024 * 1024;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function startServer(dataDir: string): Promise<ChildProcess> {
  const server = spawn('node', [path.join(ROOT, 'apps/server/dist/index.cjs')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, LOG_LEVEL: 'warn' },
    stdio: 'inherit',
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return server;
    } catch {
      // Not listening yet.
    }
    await pause(100);
  }
  server.kill();
  throw new Error('Server did not start. Run `npm run build` first.');
}

async function post<T>(route: string, body: BodyInit, headers?: HeadersInit): Promise<T> {
  const response = await fetch(`${BASE}/api${route}`, { method: 'POST', body, headers });
  if (!response.ok)
    throw new Error(`POST ${route} failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

const createSound = (input: object) =>
  post<Scene>('/sounds', JSON.stringify(input), { 'content-type': 'application/json' });

/** Build the demo Sound through the public API, exactly as "Load demo" does in the browser. */
async function seedDemo(): Promise<Scene> {
  const sources = [];
  for (const clip of DEMO_CLIPS) {
    const bytes = await readFile(path.join(DEMO_DIR, clip.file));
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'audio/wav' }), clip.file);
    const info = await post<ClipInfo>('/clips', form);
    const wav = decodeWav(bytes);
    sources.push({
      id: newId(),
      clipId: info.id,
      duration: wav.channels[0]!.length / wav.sampleRate,
      ...clip.placement,
    });
  }
  return createSound({ name: DEMO_SOUND_NAME, sources });
}

async function open(page: Page, soundId: string): Promise<void> {
  await page.goto(`${BASE}/#${soundId}`);
  // Navigating between two hashes does not reload; reload so saved preferences apply.
  await page.reload();
  await page.locator('.app[data-ready="true"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await pause(250);
}

async function screenshots(browser: Browser, demo: Scene, empty: Scene): Promise<void> {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const shot = (name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  // Empty state, with the one-time headphone hint still showing.
  await open(page, empty.id);
  await shot('empty-state');

  // Main view: the demo scene with the knock behind the listener selected.
  await page.evaluate(() => localStorage.setItem('earshot:hint-dismissed', '1'));
  await open(page, demo.id);
  await page.getByTestId('source-dot').filter({ hasText: 'Knock' }).click();
  await pause(300);
  await shot('main');

  await page.getByTestId('open-settings').click();
  await pause(400);
  await shot('settings');

  await page.getByRole('radio', { name: 'Light' }).check();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await pause(400);
  await shot('light-theme');

  await context.close();
}

/** Headless Chromium draws no pointer, so the recording gets a drawn one. */
const CURSOR_SCRIPT = `
  window.addEventListener('DOMContentLoaded', () => {
    const cursor = document.createElement('div');
    cursor.style.cssText =
      'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;display:flex;align-items:flex-start;gap:6px;transform:translate(-100px,-100px)';
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M4 2l13 9.5-6.2 1L8 18.5z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>' +
      '<span style="display:none;margin-top:14px;padding:4px 9px;border-radius:6px;background:#f2a14a;color:#1a1206;font:600 12px system-ui;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.4)"></span>';
    document.body.append(cursor);
    const chip = cursor.querySelector('span');
    window.__cursor = (x, y, label) => {
      cursor.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)';
      chip.style.display = label ? 'block' : 'none';
      chip.textContent = label || '';
    };
    window.addEventListener('mousemove', (event) => window.__cursor(event.clientX, event.clientY), true);
  });
`;

declare global {
  interface Window {
    __cursor: (x: number, y: number, label?: string) => void;
  }
}

type Point = { x: number; y: number };

const ease = (t: number) => t * t * (3 - 2 * t);

async function glide(page: Page, from: Point, to: Point, ms: number): Promise<void> {
  const steps = Math.max(2, Math.round(ms / 33));
  for (let step = 1; step <= steps; step++) {
    const t = ease(step / steps);
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await pause(33);
  }
}

/** Drag a file in from the edge of the window and drop it on the radar. */
async function dragFileIn(page: Page, name: string, from: Point, to: Point): Promise<void> {
  const file = name;
  const bytes = await readFile(path.join(DEMO_DIR, name.toLowerCase()));
  const transfer = await page.evaluateHandle(
    ({ name, data }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([new Uint8Array(data)], name, { type: 'audio/wav' }));
      return dataTransfer;
    },
    { name: file, data: Array.from(bytes) },
  );
  const radar = page.getByTestId('radar');
  const steps = 34;
  for (let step = 0; step <= steps; step++) {
    const t = ease(step / steps);
    const clientX = from.x + (to.x - from.x) * t;
    const clientY = from.y + (to.y - from.y) * t;
    await page.evaluate(([x, y, label]) => window.__cursor(x, y, label), [
      clientX,
      clientY,
      file,
    ] as const);
    await radar.dispatchEvent(step === 0 ? 'dragenter' : 'dragover', {
      dataTransfer: transfer,
      clientX,
      clientY,
    });
    await pause(33);
  }
  await pause(350);
  await radar.dispatchEvent('drop', { dataTransfer: transfer, clientX: to.x, clientY: to.y });
  await page.evaluate(([x, y]) => window.__cursor(x, y), [to.x, to.y] as const);
  await page.mouse.move(to.x, to.y);
}

async function centreOf(page: Page, selector: ReturnType<Page['locator']>): Promise<Point> {
  const box = await selector.boundingBox();
  if (!box) throw new Error('Element is not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Record the core flow: drop, drag, play, export. Returns the raw video path. */
async function record(
  browser: Browser,
  sound: Scene,
  videoDir: string,
): Promise<{ video: string; skip: number }> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });
  const started = Date.now();
  await context.addInitScript(CURSOR_SCRIPT);
  await context.addInitScript(() => localStorage.setItem('earshot:hint-dismissed', '1'));
  const page = await context.newPage();
  await open(page, sound.id);

  const radar = await centreOf(page, page.getByTestId('radar'));
  const polar = (angle: number, pixels: number): Point => ({
    x: radar.x + Math.sin((angle * Math.PI) / 180) * pixels,
    y: radar.y - Math.cos((angle * Math.PI) / 180) * pixels,
  });

  await page.mouse.move(420, 700);
  await pause(500);
  // Everything before this moment (page load) is trimmed from the GIF.
  const skip = (Date.now() - started) / 1000;
  await pause(500);

  // 1. Drop a knock behind the listener.
  await dragFileIn(page, 'Knock.wav', { x: 300, y: 760 }, polar(180, 120));
  const dots = page.getByTestId('source-dot');
  await dots.first().waitFor();
  await pause(900);

  // 2. Drag it round to behind-right, along an arc.
  await page.mouse.down();
  for (let step = 1; step <= 40; step++) {
    const t = ease(step / 40);
    const at = polar(180 - 50 * t, 120 + 50 * t);
    await page.mouse.move(at.x, at.y);
    await pause(33);
  }
  await page.mouse.up();
  await pause(700);

  // 3. Drop a chime front-left.
  await dragFileIn(page, 'Chime.wav', { x: 300, y: 120 }, polar(315, 190));
  await dots.nth(1).waitFor();
  await pause(800);

  // 4. Play: the dots pulse while they sound.
  const play = await centreOf(page, page.getByRole('button', { name: 'Play' }));
  await glide(page, polar(315, 190), play, 700);
  await page.mouse.click(play.x, play.y);
  await page.getByRole('button', { name: 'Stop' }).waitFor();
  await page.getByRole('button', { name: 'Play' }).waitFor({ timeout: 15_000 });
  await pause(300);

  // 5. Export a binaural WAV.
  const exportButton = await centreOf(page, page.getByRole('button', { name: 'Export' }));
  await glide(page, play, exportButton, 800);
  const download = page.waitForEvent('download');
  await page.mouse.click(exportButton.x, exportButton.y);
  await download;
  await pause(2200);

  const video = page.video();
  await context.close();
  if (!video) throw new Error('No video was recorded');
  return { video: await video.path(), skip };
}

/** Two-pass palette conversion: far better colour than ffmpeg's default GIF encoder. */
async function toGif(video: string, skip: number, gif: string, workDir: string): Promise<number> {
  const palette = path.join(workDir, 'palette.png');
  const filters = `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos`;
  const input = ['-v', 'error', '-y', '-ss', skip.toFixed(2), '-i', video];
  execFileSync('ffmpeg', [
    ...input,
    '-vf',
    `${filters},palettegen=max_colors=128:stats_mode=diff`,
    palette,
  ]);
  execFileSync('ffmpeg', [
    ...input,
    '-i',
    palette,
    '-lavfi',
    `${filters}[frames];[frames][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    '-loop',
    '0',
    gif,
  ]);
  return (await readFile(gif)).byteLength;
}

const work = await mkdtemp(path.join(os.tmpdir(), 'earshot-media-'));
await mkdir(OUT, { recursive: true });
const server = await startServer(path.join(work, 'data'));
const browser = await chromium.launch();

try {
  const demo = await seedDemo();
  const empty = await createSound({ name: 'Untitled sound' });
  await screenshots(browser, demo, empty);

  const stage = await createSound({ name: 'Front door' });
  const { video, skip } = await record(browser, stage, path.join(work, 'video'));
  const size = await toGif(video, skip, path.join(OUT, 'demo.gif'), work);
  if (size > GIF_LIMIT_BYTES) {
    throw new Error(`demo.gif is ${(size / 1048576).toFixed(1)} MB, over the 8 MB limit`);
  }

  for (const file of (await readdir(OUT)).sort()) {
    const bytes = (await readFile(path.join(OUT, file))).byteLength;
    console.log(`docs/media/${file}  ${(bytes / 1024).toFixed(0)} kB`);
  }
} finally {
  await browser.close();
  server.kill();
  await rm(work, { recursive: true, force: true });
}
