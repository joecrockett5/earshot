import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SETTINGS, type Scene, type SoundSummary, newId } from '@earshot/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VERSION } from './app';
import { type TestApp, createTestApp, multipartFile, uploadClip, wavBytes } from './test-helpers';

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.close();
});

function source(clipId: string, patch: Record<string, unknown> = {}) {
  return {
    id: newId(),
    clipId,
    label: 'Clip',
    angle: 90,
    distance: 3,
    startOffset: 0,
    gain: 1,
    loop: false,
    duration: 0.1,
    ...patch,
  };
}

async function newClip(): Promise<string> {
  const response = await uploadClip(t.app);
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
}

async function newSound(body: object = {}): Promise<Scene> {
  const response = await t.app.inject({ method: 'POST', url: '/api/sounds', payload: body });
  expect(response.statusCode).toBe(201);
  return response.json<Scene>();
}

const clipFiles = () => readdir(path.join(t.dataDir, 'clips'));

describe('GET /api/health', () => {
  it('reports ok and the version', async () => {
    const response = await t.app.inject({ url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', version: VERSION });
  });

  it('sets security headers', async () => {
    const response = await t.app.inject({ url: '/api/health' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
  });
});

describe('sounds', () => {
  it('starts empty', async () => {
    const response = await t.app.inject({ url: '/api/sounds' });
    expect(response.json()).toEqual([]);
  });

  it('creates a sound with defaults', async () => {
    const scene = await newSound();
    expect(scene).toMatchObject({
      version: 1,
      name: 'Untitled sound',
      sources: [],
      settings: DEFAULT_SETTINGS,
    });
    expect(scene.id).toMatch(/^[a-f0-9]{32}$/);
    expect(scene.createdAt).toBe(scene.updatedAt);
  });

  it('stores each sound as pretty JSON in scenes/<id>.json', async () => {
    const scene = await newSound({ name: 'On disk' });
    const text = await readFile(path.join(t.dataDir, 'scenes', `${scene.id}.json`), 'utf8');
    expect(JSON.parse(text)).toEqual(scene);
    expect(await readdir(path.join(t.dataDir, 'tmp'))).toEqual([]);
  });

  it('lists summaries, newest first', async () => {
    const first = await newSound({ name: 'First' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await newSound({ name: 'Second' });
    const list = (await t.app.inject({ url: '/api/sounds' })).json<SoundSummary[]>();
    expect(list.map((s) => s.id)).toEqual([second.id, first.id]);
    expect(list[0]).toEqual({
      id: second.id,
      name: 'Second',
      createdAt: second.createdAt,
      updatedAt: second.updatedAt,
      sourceCount: 0,
    });
  });

  it('fetches a sound by id', async () => {
    const scene = await newSound({ name: 'Fetch me' });
    const response = await t.app.inject({ url: `/api/sounds/${scene.id}` });
    expect(response.json()).toEqual(scene);
  });

  it('returns 404 for unknown and malformed ids', async () => {
    for (const id of [newId(), 'nope', '..%2F..%2Fetc%2Fpasswd']) {
      const response = await t.app.inject({ url: `/api/sounds/${id}` });
      expect(response.statusCode).toBe(404);
    }
  });

  it('rejects invalid create bodies with details', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/sounds',
      payload: { name: '', settings: { reverb: 9 } },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: string; details: string[] }>();
    expect(body.error).toBe('Invalid sound');
    expect(body.details.some((d) => d.startsWith('name'))).toBe(true);
    expect(body.details.some((d) => d.startsWith('settings.reverb'))).toBe(true);
  });

  it('rejects malformed JSON', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/sounds',
      headers: { 'content-type': 'application/json' },
      payload: '{nope',
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects sources that reference clips that do not exist', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/sounds',
      payload: { sources: [source(newId())] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ details: string[] }>().details[0]).toContain('does not exist');
  });

  it('updates a sound, keeping its identity and creation time', async () => {
    const scene = await newSound();
    const clipId = await newClip();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const response = await t.app.inject({
      method: 'PUT',
      url: `/api/sounds/${scene.id}`,
      payload: {
        name: 'Renamed',
        sources: [source(clipId, { angle: 180 })],
        settings: { ...DEFAULT_SETTINGS, reverb: 0.5 },
        id: 'ignored',
      },
    });
    expect(response.statusCode).toBe(200);
    const updated = response.json<Scene>();
    expect(updated.id).toBe(scene.id);
    expect(updated.createdAt).toBe(scene.createdAt);
    expect(updated.updatedAt > scene.updatedAt).toBe(true);
    expect(updated.name).toBe('Renamed');
    expect(updated.sources[0]?.angle).toBe(180);
    expect(updated.settings.reverb).toBe(0.5);
    const fetched = (await t.app.inject({ url: `/api/sounds/${scene.id}` })).json();
    expect(fetched).toEqual(updated);
  });

  it('rejects invalid updates and leaves the sound untouched', async () => {
    const scene = await newSound({ name: 'Keep' });
    const response = await t.app.inject({
      method: 'PUT',
      url: `/api/sounds/${scene.id}`,
      payload: { name: 'Broken', sources: [{ angle: 720 }], settings: DEFAULT_SETTINGS },
    });
    expect(response.statusCode).toBe(400);
    const fetched = (await t.app.inject({ url: `/api/sounds/${scene.id}` })).json<Scene>();
    expect(fetched.name).toBe('Keep');
  });

  it('returns 404 when updating a sound that does not exist', async () => {
    const response = await t.app.inject({
      method: 'PUT',
      url: `/api/sounds/${newId()}`,
      payload: { name: 'x', sources: [], settings: DEFAULT_SETTINGS },
    });
    expect(response.statusCode).toBe(404);
  });

  it('duplicates a sound with new ids and shared clips', async () => {
    const clipId = await newClip();
    const original = await newSound({ name: 'Original', sources: [source(clipId)] });
    const response = await t.app.inject({
      method: 'POST',
      url: `/api/sounds/${original.id}/duplicate`,
    });
    expect(response.statusCode).toBe(201);
    const copy = response.json<Scene>();
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Original copy');
    expect(copy.sources[0]?.clipId).toBe(clipId);
    expect(copy.sources[0]?.id).not.toBe(original.sources[0]?.id);
    expect((await t.app.inject({ url: '/api/sounds' })).json()).toHaveLength(2);
  });

  it('returns 404 when duplicating a sound that does not exist', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: `/api/sounds/${newId()}/duplicate`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('deletes a sound and its now-unused clips', async () => {
    const clipId = await newClip();
    const scene = await newSound({ sources: [source(clipId)] });
    const response = await t.app.inject({ method: 'DELETE', url: `/api/sounds/${scene.id}` });
    expect(response.statusCode).toBe(204);
    expect((await t.app.inject({ url: `/api/sounds/${scene.id}` })).statusCode).toBe(404);
    expect(await clipFiles()).toEqual([]);
    expect(
      (await t.app.inject({ method: 'DELETE', url: `/api/sounds/${scene.id}` })).statusCode,
    ).toBe(404);
  });

  it('keeps clips that a duplicate still uses', async () => {
    const clipId = await newClip();
    const original = await newSound({ sources: [source(clipId)] });
    await t.app.inject({ method: 'POST', url: `/api/sounds/${original.id}/duplicate` });
    await t.app.inject({ method: 'DELETE', url: `/api/sounds/${original.id}` });
    expect(await clipFiles()).toEqual([`${clipId}.wav`]);
  });

  it('collects a clip when an update removes its last source', async () => {
    const keep = await newClip();
    const drop = await newClip();
    const scene = await newSound({ sources: [source(keep), source(drop)] });
    await t.app.inject({
      method: 'PUT',
      url: `/api/sounds/${scene.id}`,
      payload: { name: scene.name, sources: [scene.sources[0]], settings: scene.settings },
    });
    expect(await clipFiles()).toEqual([`${keep}.wav`]);
  });

  it('skips unreadable scene files instead of failing the list', async () => {
    const scene = await newSound();
    const scenes = path.join(t.dataDir, 'scenes');
    await writeFile(path.join(scenes, `${newId()}.json`), '{ not json');
    await writeFile(path.join(scenes, `${newId()}.json`), JSON.stringify({ version: 99 }));
    await writeFile(path.join(scenes, 'notes.txt'), 'hello');
    const list = (await t.app.inject({ url: '/api/sounds' })).json<SoundSummary[]>();
    expect(list.map((s) => s.id)).toEqual([scene.id]);
  });
});

describe('clips', () => {
  it('accepts a WAV upload and serves it back byte for byte', async () => {
    const bytes = wavBytes();
    const response = await uploadClip(t.app, bytes);
    expect(response.statusCode).toBe(201);
    const info = response.json<{ id: string; format: string; mime: string; size: number }>();
    expect(info).toMatchObject({ format: 'wav', mime: 'audio/wav', size: bytes.byteLength });

    const download = await t.app.inject({ url: `/api/clips/${info.id}` });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('audio/wav');
    expect(download.headers['cache-control']).toContain('immutable');
    expect(new Uint8Array(download.rawPayload)).toEqual(bytes);
  });

  it('names the stored file from the detected format, never the upload filename', async () => {
    const response = await uploadClip(t.app, wavBytes(), {
      filename: '../../../etc/cron.d/evil.sh',
      contentType: 'application/octet-stream',
    });
    expect(response.statusCode).toBe(201);
    const { id } = response.json<{ id: string }>();
    expect(await clipFiles()).toEqual([`${id}.wav`]);
    expect(await readdir(t.dataDir)).toEqual(['clips', 'scenes', 'tmp']);
  });

  it('rejects a non-audio content type', async () => {
    const response = await uploadClip(t.app, wavBytes(), { contentType: 'text/html' });
    expect(response.statusCode).toBe(415);
    expect(await clipFiles()).toEqual([]);
  });

  it('rejects files whose bytes are not audio, whatever they claim to be', async () => {
    const html = new TextEncoder().encode('<script>alert(1)</script>');
    const response = await uploadClip(t.app, html, {
      filename: 'song.mp3',
      contentType: 'audio/mpeg',
    });
    expect(response.statusCode).toBe(415);
    expect(await clipFiles()).toEqual([]);
    expect(await readdir(path.join(t.dataDir, 'tmp'))).toEqual([]);
  });

  it('rejects empty files', async () => {
    const response = await uploadClip(t.app, new Uint8Array());
    expect(response.statusCode).toBe(415);
  });

  it('enforces the upload size limit', async () => {
    await t.close();
    t = await createTestApp({ maxUploadBytes: 1024 });
    const response = await uploadClip(t.app, wavBytes(4000));
    expect(response.statusCode).toBe(413);
    expect(response.json<{ error: string }>().error).toMatch(/upload limit/);
    expect(await clipFiles()).toEqual([]);
    expect(await readdir(path.join(t.dataDir, 'tmp'))).toEqual([]);
  });

  it('rejects uploads that are not multipart or carry no file', async () => {
    const json = await t.app.inject({ method: 'POST', url: '/api/clips', payload: { a: 1 } });
    expect(json.statusCode).toBe(415);
    const boundary = 'x';
    const empty = await t.app.inject({
      method: 'POST',
      url: '/api/clips',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: `--${boundary}--\r\n`,
    });
    expect(empty.statusCode).toBe(400);
  });

  it('returns 404 for unknown and malformed clip ids', async () => {
    for (const id of [newId(), 'nope', '..%2Fscenes%2Fx']) {
      expect((await t.app.inject({ url: `/api/clips/${id}` })).statusCode).toBe(404);
      expect((await t.app.inject({ method: 'DELETE', url: `/api/clips/${id}` })).statusCode).toBe(
        404,
      );
    }
  });

  it('deletes an unused clip', async () => {
    const clipId = await newClip();
    const response = await t.app.inject({ method: 'DELETE', url: `/api/clips/${clipId}` });
    expect(response.statusCode).toBe(204);
    expect(await clipFiles()).toEqual([]);
  });

  it('refuses to delete a clip that a sound still uses', async () => {
    const clipId = await newClip();
    const scene = await newSound({ sources: [source(clipId)] });
    const response = await t.app.inject({ method: 'DELETE', url: `/api/clips/${clipId}` });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ details: string[] }>().details).toEqual([scene.id]);
    expect(await clipFiles()).toEqual([`${clipId}.wav`]);
  });
});

describe('persistence', () => {
  it('survives a restart on the same data directory', async () => {
    const clipId = await newClip();
    const scene = await newSound({ name: 'Durable', sources: [source(clipId)] });
    await t.app.close();
    const again = await createTestApp({ dataDir: t.dataDir });
    try {
      const fetched = (await again.app.inject({ url: `/api/sounds/${scene.id}` })).json();
      expect(fetched).toEqual(scene);
      expect((await again.app.inject({ url: `/api/clips/${clipId}` })).statusCode).toBe(200);
    } finally {
      await again.app.close();
    }
  });

  it('clears interrupted writes from tmp/ on startup', async () => {
    await writeFile(path.join(t.dataDir, 'tmp', 'half-written'), 'x');
    await t.app.close();
    const again = await createTestApp({ dataDir: t.dataDir });
    try {
      expect(await readdir(path.join(t.dataDir, 'tmp'))).toEqual([]);
    } finally {
      await again.app.close();
    }
  });
});

describe('routing', () => {
  it('returns JSON 404s for unknown API routes', async () => {
    const response = await t.app.inject({ url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Not found' });
  });

  it('returns 404 for pages when no frontend is built', async () => {
    expect((await t.app.inject({ url: '/' })).statusCode).toBe(404);
  });

  it('serves the frontend with SPA fallback when one is present', async () => {
    const webDir = path.join(t.dataDir, 'web');
    await mkdir(path.join(webDir, 'assets'), { recursive: true });
    await writeFile(path.join(webDir, 'index.html'), '<!doctype html><title>Earshot</title>');
    await writeFile(path.join(webDir, 'assets', 'app-abc123.js'), 'console.log(1)');
    await t.app.close();
    const web = await createTestApp({ dataDir: t.dataDir, webDir });
    try {
      const index = await web.app.inject({ url: '/' });
      expect(index.statusCode).toBe(200);
      expect(index.body).toContain('Earshot');
      expect(index.headers['cache-control']).toBe('no-cache');

      const asset = await web.app.inject({ url: '/assets/app-abc123.js' });
      expect(asset.statusCode).toBe(200);
      expect(asset.headers['cache-control']).toContain('immutable');

      const deepLink = await web.app.inject({ url: '/some/client/route' });
      expect(deepLink.statusCode).toBe(200);
      expect(deepLink.body).toContain('Earshot');

      expect((await web.app.inject({ url: '/missing.png' })).statusCode).toBe(404);
      expect((await web.app.inject({ url: '/api/nope' })).json()).toEqual({ error: 'Not found' });
      expect((await web.app.inject({ url: '/api/health' })).statusCode).toBe(200);
    } finally {
      await web.app.close();
    }
  });
});

describe('multipart helper', () => {
  it('builds a body the server can parse', () => {
    const { payload, headers } = multipartFile(wavBytes(10));
    expect(headers['content-type']).toContain('boundary=');
    expect(payload.includes('RIFF')).toBe(true);
  });
});
