import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { encodeWav } from '@earshot/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import type { Config } from './config';

export interface TestApp {
  app: FastifyInstance;
  dataDir: string;
  close(): Promise<void>;
}

export async function createTestApp(overrides: Partial<Config> = {}): Promise<TestApp> {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'earshot-test-'));
  const app = await buildApp({
    port: 0,
    host: '127.0.0.1',
    dataDir,
    webDir: null,
    maxUploadBytes: 1024 * 1024,
    logLevel: 'silent',
    ...overrides,
  });
  return {
    app,
    dataDir,
    async close() {
      await app.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

/** A tiny valid WAV file. */
export function wavBytes(frames = 800): Uint8Array {
  const samples = Float32Array.from({ length: frames }, (_, i) => Math.sin(i / 10) * 0.5);
  return encodeWav([samples], 8000);
}

export interface UploadOptions {
  filename?: string;
  contentType?: string;
}

/** Build a multipart/form-data request body containing one file. */
export function multipartFile(bytes: Uint8Array, options: UploadOptions = {}) {
  const { filename = 'clip.wav', contentType = 'audio/wav' } = options;
  const boundary = '----earshot-test-boundary';
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, Buffer.from(bytes), tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

export async function uploadClip(
  app: FastifyInstance,
  bytes: Uint8Array = wavBytes(),
  options: UploadOptions = {},
) {
  return app.inject({ method: 'POST', url: '/api/clips', ...multipartFile(bytes, options) });
}
