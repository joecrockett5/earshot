import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { type Scene, isId, migrateScene, newId } from '@earshot/shared';
import { AUDIO_FORMATS, type AudioFormat, SNIFF_BYTES, sniffAudio } from './sniff';

export interface StoredClip {
  id: string;
  format: AudioFormat;
  path: string;
  size: number;
}

export interface StorageLogger {
  warn(details: object, message: string): void;
}

const FORMATS_BY_EXT = new Map<string, AudioFormat>(
  Object.values(AUDIO_FORMATS).map((format) => [format.ext, format]),
);

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

/**
 * File-backed storage rooted at DATA_DIR:
 *
 *   scenes/<id>.json   one scene per file
 *   clips/<id>.<ext>   uploaded audio, extension from the detected format
 *   tmp/               in-flight writes, on the same filesystem so that
 *                      rename() into place is atomic
 *
 * Every path is built from an id that has passed `isId`, never from client
 * supplied names.
 */
export class Storage {
  private readonly scenesDir: string;
  private readonly clipsDir: string;
  private readonly tmpDir: string;

  constructor(
    readonly dataDir: string,
    private readonly log?: StorageLogger,
  ) {
    this.scenesDir = path.join(dataDir, 'scenes');
    this.clipsDir = path.join(dataDir, 'clips');
    this.tmpDir = path.join(dataDir, 'tmp');
  }

  async init(): Promise<void> {
    await mkdir(this.scenesDir, { recursive: true });
    await mkdir(this.clipsDir, { recursive: true });
    // Anything left in tmp/ is from an interrupted write and safe to discard.
    await rm(this.tmpDir, { recursive: true, force: true });
    await mkdir(this.tmpDir, { recursive: true });
  }

  /** A fresh path in tmp/ for an in-flight write. */
  tempPath(): string {
    return path.join(this.tmpDir, newId());
  }

  private scenePath(id: string): string {
    if (!isId(id)) throw new Error('Invalid scene id');
    return path.join(this.scenesDir, `${id}.json`);
  }

  private async writeAtomic(target: string, data: string): Promise<void> {
    const temp = this.tempPath();
    const handle = await open(temp, 'w');
    try {
      await handle.writeFile(data, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, target);
  }

  /* ---- scenes ---------------------------------------------------------- */

  async getScene(id: string): Promise<Scene | null> {
    if (!isId(id)) return null;
    let text: string;
    try {
      text = await readFile(this.scenePath(id), 'utf8');
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    return migrateScene(JSON.parse(text));
  }

  /** Every readable scene. Files that fail to parse are logged and skipped. */
  async listScenes(): Promise<Scene[]> {
    const names = await readdir(this.scenesDir);
    const scenes: Scene[] = [];
    for (const name of names) {
      const id = name.endsWith('.json') ? name.slice(0, -'.json'.length) : '';
      if (!isId(id)) continue;
      try {
        const scene = await this.getScene(id);
        if (scene) scenes.push(scene);
      } catch (error) {
        this.log?.warn({ file: name, err: error }, 'Skipping unreadable scene file');
      }
    }
    return scenes.sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
  }

  async saveScene(scene: Scene): Promise<void> {
    await this.writeAtomic(this.scenePath(scene.id), `${JSON.stringify(scene, null, 2)}\n`);
  }

  async deleteScene(id: string): Promise<boolean> {
    if (!isId(id)) return false;
    try {
      await rm(this.scenePath(id));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  /* ---- clips ----------------------------------------------------------- */

  async findClip(id: string): Promise<StoredClip | null> {
    if (!isId(id)) return null;
    for (const format of FORMATS_BY_EXT.values()) {
      const file = path.join(this.clipsDir, `${id}.${format.ext}`);
      try {
        const info = await stat(file);
        if (info.isFile()) return { id, format, path: file, size: info.size };
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
    return null;
  }

  openClip(clip: StoredClip): ReadStream {
    return createReadStream(clip.path);
  }

  /**
   * Adopt a fully written temp file as a clip. The format is taken from the
   * file's magic bytes; returns null (and removes the file) if it is not audio.
   */
  async adoptClip(tempFile: string): Promise<StoredClip | null> {
    const head = new Uint8Array(SNIFF_BYTES);
    const handle = await open(tempFile, 'r');
    let size: number;
    try {
      await handle.read(head, 0, SNIFF_BYTES, 0);
      await handle.sync();
      size = (await handle.stat()).size;
    } finally {
      await handle.close();
    }
    const format = sniffAudio(head);
    if (!format || size === 0) {
      await rm(tempFile, { force: true });
      return null;
    }
    const id = newId();
    const target = path.join(this.clipsDir, `${id}.${format.ext}`);
    await rename(tempFile, target);
    return { id, format, path: target, size };
  }

  async deleteClip(id: string): Promise<boolean> {
    const clip = await this.findClip(id);
    if (!clip) return false;
    await rm(clip.path, { force: true });
    return true;
  }

  /** Ids of the scenes (other than `exceptSceneId`) that use a clip. */
  async clipUsers(clipId: string, exceptSceneId?: string): Promise<string[]> {
    const scenes = await this.listScenes();
    return scenes
      .filter((scene) => scene.id !== exceptSceneId)
      .filter((scene) => scene.sources.some((source) => source.clipId === clipId))
      .map((scene) => scene.id);
  }

  /** Delete each of the given clips that no scene references any more. */
  async collectClips(clipIds: Iterable<string>): Promise<void> {
    const candidates = new Set(clipIds);
    if (candidates.size === 0) return;
    for (const scene of await this.listScenes()) {
      for (const source of scene.sources) candidates.delete(source.clipId);
    }
    for (const id of candidates) await this.deleteClip(id);
  }
}
