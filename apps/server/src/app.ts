import { createWriteStream, existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  type ApiError,
  type ClipInfo,
  CreateSoundSchema,
  type HealthInfo,
  SCENE_VERSION,
  type Scene,
  UpdateSoundSchema,
  isId,
  newId,
  summarize,
} from '@earshot/shared';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, LogController } from 'fastify';
import type { ZodError } from 'zod';
import pkg from '../package.json' with { type: 'json' };
import type { Config } from './config';
import { isAcceptableContentType } from './sniff';
import { Storage, type StoredClip } from './storage';

export const VERSION: string = pkg.version;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join('; ');

function fail(
  reply: FastifyReply,
  status: number,
  error: string,
  details?: string[],
): FastifyReply {
  const body: ApiError = details ? { error, details } : { error };
  return reply.code(status).send(body);
}

function issues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.join('.');
    return where ? `${where}: ${issue.message}` : issue.message;
  });
}

function clipInfo(clip: StoredClip): ClipInfo {
  return { id: clip.id, format: clip.format.ext, mime: clip.format.mime, size: clip.size };
}

type IdParams = { Params: { id: string } };

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: 1024 * 1024,
    // Per-request lines are only useful when debugging; autosave makes them noisy.
    logController: new LogController({
      disableRequestLogging: config.logLevel !== 'debug' && config.logLevel !== 'trace',
    }),
  });

  const storage = new Storage(config.dataDir, app.log);
  await storage.init();

  await app.register(multipart, {
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 0, parts: 1 },
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'Request failed');
      return fail(reply, 500, 'Internal server error');
    }
    return fail(reply, status, error.message);
  });

  /** Names of clips referenced by `sources` that do not exist on disk. */
  async function missingClips(sources: Scene['sources']): Promise<string[]> {
    const missing: string[] = [];
    for (const clipId of new Set(sources.map((source) => source.clipId))) {
      if (!(await storage.findClip(clipId))) missing.push(`sources: clip ${clipId} does not exist`);
    }
    return missing;
  }

  await app.register(
    async (api) => {
      api.get('/health', async (): Promise<HealthInfo> => ({ status: 'ok', version: VERSION }));

      /* ---- sounds ------------------------------------------------------ */

      api.get('/sounds', async () => (await storage.listScenes()).map(summarize));

      api.post('/sounds', async (request, reply) => {
        const parsed = CreateSoundSchema.safeParse(request.body ?? {});
        if (!parsed.success) return fail(reply, 400, 'Invalid sound', issues(parsed.error));
        const missing = await missingClips(parsed.data.sources);
        if (missing.length > 0) return fail(reply, 400, 'Invalid sound', missing);
        const now = new Date().toISOString();
        const scene: Scene = {
          version: SCENE_VERSION,
          id: newId(),
          createdAt: now,
          updatedAt: now,
          ...parsed.data,
        };
        await storage.saveScene(scene);
        return reply.code(201).send(scene);
      });

      api.get<IdParams>('/sounds/:id', async (request, reply) => {
        const scene = await storage.getScene(request.params.id);
        return scene ?? fail(reply, 404, 'Sound not found');
      });

      api.put<IdParams>('/sounds/:id', async (request, reply) => {
        const existing = await storage.getScene(request.params.id);
        if (!existing) return fail(reply, 404, 'Sound not found');
        const parsed = UpdateSoundSchema.safeParse(request.body);
        if (!parsed.success) return fail(reply, 400, 'Invalid sound', issues(parsed.error));
        const missing = await missingClips(parsed.data.sources);
        if (missing.length > 0) return fail(reply, 400, 'Invalid sound', missing);
        const scene: Scene = {
          ...existing,
          ...parsed.data,
          updatedAt: new Date().toISOString(),
        };
        await storage.saveScene(scene);
        // Clips this sound no longer uses are deleted unless another sound still does.
        const kept = new Set(scene.sources.map((source) => source.clipId));
        const dropped = existing.sources.map((s) => s.clipId).filter((id) => !kept.has(id));
        await storage.collectClips(dropped);
        return scene;
      });

      api.delete<IdParams>('/sounds/:id', async (request, reply) => {
        const existing = await storage.getScene(request.params.id);
        if (!existing) return fail(reply, 404, 'Sound not found');
        await storage.deleteScene(existing.id);
        await storage.collectClips(existing.sources.map((source) => source.clipId));
        return reply.code(204).send();
      });

      api.post<IdParams>('/sounds/:id/duplicate', async (request, reply) => {
        const existing = await storage.getScene(request.params.id);
        if (!existing) return fail(reply, 404, 'Sound not found');
        const now = new Date().toISOString();
        const copy: Scene = {
          ...existing,
          id: newId(),
          name: `${existing.name} copy`.slice(0, 80),
          createdAt: now,
          updatedAt: now,
          // Clip files are shared between the copies; sources get their own ids.
          sources: existing.sources.map((source) => ({ ...source, id: newId() })),
        };
        await storage.saveScene(copy);
        return reply.code(201).send(copy);
      });

      /* ---- clips ------------------------------------------------------- */

      api.post('/clips', async (request, reply) => {
        if (!request.isMultipart()) {
          return fail(reply, 415, 'Upload must be multipart/form-data');
        }
        const part = await request.file();
        if (!part) return fail(reply, 400, 'No file in upload');
        if (!isAcceptableContentType(part.mimetype)) {
          part.file.resume();
          return fail(reply, 415, `Unsupported content type "${part.mimetype}"`);
        }
        const temp = storage.tempPath();
        try {
          await pipeline(part.file, createWriteStream(temp, { flags: 'wx' }));
        } catch (error) {
          await rm(temp, { force: true });
          throw error;
        }
        if (part.file.truncated) {
          await rm(temp, { force: true });
          const limit = Math.round(config.maxUploadBytes / (1024 * 1024));
          return fail(reply, 413, `File is larger than the ${limit} MB upload limit`);
        }
        const clip = await storage.adoptClip(temp);
        if (!clip) {
          return fail(
            reply,
            415,
            'File is not a supported audio format (wav, mp3, ogg, flac, m4a)',
          );
        }
        return reply.code(201).send(clipInfo(clip));
      });

      api.get<IdParams>('/clips/:id', async (request, reply) => {
        const clip = await storage.findClip(request.params.id);
        if (!clip) return fail(reply, 404, 'Clip not found');
        return reply
          .header('Content-Type', clip.format.mime)
          .header('Content-Length', clip.size)
          .header('Cache-Control', 'private, max-age=31536000, immutable')
          .send(storage.openClip(clip));
      });

      api.delete<IdParams>('/clips/:id', async (request, reply) => {
        const { id } = request.params;
        if (!isId(id) || !(await storage.findClip(id))) return fail(reply, 404, 'Clip not found');
        const users = await storage.clipUsers(id);
        if (users.length > 0) {
          return fail(reply, 409, 'Clip is still used by a sound', users);
        }
        await storage.deleteClip(id);
        return reply.code(204).send();
      });

      api.setNotFoundHandler((_request, reply) => fail(reply, 404, 'Not found'));
    },
    { prefix: '/api' },
  );

  /* ---- frontend -------------------------------------------------------- */

  const webDir = config.webDir;
  const hasFrontend = webDir !== null && existsSync(path.join(webDir, 'index.html'));
  if (hasFrontend) {
    await app.register(fastifyStatic, {
      root: webDir,
      setHeaders(reply, file) {
        const hashed = file.includes(`${path.sep}assets${path.sep}`);
        reply.header('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  } else {
    app.log.warn({ webDir }, 'No built frontend found; serving the API only');
  }

  app.setNotFoundHandler((request, reply) => {
    const wantsPage = request.method === 'GET' && !request.url.startsWith('/api');
    // Unknown paths without a file extension fall through to the single-page app.
    if (hasFrontend && wantsPage && !path.extname(request.url.split('?')[0] ?? '')) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return fail(reply, 404, 'Not found');
  });

  return app;
}
