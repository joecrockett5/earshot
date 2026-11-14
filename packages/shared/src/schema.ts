import { z } from 'zod';
import { ID_PATTERN } from './id';

/** Current on-disk scene format. Bump when the shape changes and add a migration. */
export const SCENE_VERSION = 1;

export const MAX_SOURCES = 64;

const IdSchema = z.string().regex(ID_PATTERN, 'must be a 32 character hex id');

export const PANNING_MODELS = ['HRTF', 'equalpower'] as const;
export const DISTANCE_MODELS = ['inverse', 'linear', 'exponential'] as const;
export const BIT_DEPTHS = [16, 24] as const;
export const SAMPLE_RATES = [44100, 48000] as const;

export const SettingsSchema = z.object({
  /** How direction is rendered. HRTF is binaural; equal-power is plain stereo panning. */
  panningModel: z.enum(PANNING_MODELS).default('HRTF'),
  /** How loudness falls with distance. */
  distanceModel: z.enum(DISTANCE_MODELS).default('inverse'),
  /** Distance, in metres, represented by the radar's outer ring. */
  maxDistance: z.number().min(1).max(100).default(10),
  /** Room reverb amount, 0 (dry) to 1. */
  reverb: z.number().min(0).max(1).default(0.2),
  exportBitDepth: z.union([z.literal(16), z.literal(24)]).default(16),
  exportSampleRate: z.union([z.literal(44100), z.literal(48000)]).default(48000),
  /** Angle step, in degrees, used when Shift is held while dragging. */
  snapAngle: z.number().min(1).max(90).default(15),
  /** Export / preview length in seconds when any source loops. */
  loopDuration: z.number().min(1).max(3600).default(30),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type PanningModel = Settings['panningModel'];
export type DistanceModel = Settings['distanceModel'];

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

export const SourceSchema = z.object({
  id: IdSchema,
  /** The uploaded clip this source plays. */
  clipId: IdSchema,
  label: z.string().trim().min(1).max(60),
  /** Degrees clockwise from front, [0, 360). */
  angle: z.number().min(0).lt(360),
  /** Metres from the listener. */
  distance: z.number().min(0).max(100),
  /** Seconds after the start of the Sound at which the clip begins. */
  startOffset: z.number().min(0).max(3600).default(0),
  /** Linear gain, 1 = unchanged. */
  gain: z.number().min(0).max(4).default(1),
  loop: z.boolean().default(false),
  /** Length of the clip in seconds, measured when it was decoded. */
  duration: z.number().min(0).max(36000),
});

export type Source = z.infer<typeof SourceSchema>;

const NameSchema = z.string().trim().min(1).max(80);

export const SceneSchema = z.object({
  version: z.literal(SCENE_VERSION),
  id: IdSchema,
  name: NameSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  sources: z.array(SourceSchema).max(MAX_SOURCES),
  settings: SettingsSchema.default(DEFAULT_SETTINGS),
});

export type Scene = z.infer<typeof SceneSchema>;

/** Body of `POST /api/sounds` — everything is optional. */
export const CreateSoundSchema = z.object({
  name: NameSchema.default('Untitled sound'),
  sources: z.array(SourceSchema).max(MAX_SOURCES).default([]),
  settings: SettingsSchema.default(DEFAULT_SETTINGS),
});

export type CreateSoundInput = z.input<typeof CreateSoundSchema>;

/** Body of `PUT /api/sounds/:id` — a full replacement of the editable fields. */
export const UpdateSoundSchema = z.object({
  name: NameSchema,
  sources: z.array(SourceSchema).max(MAX_SOURCES),
  settings: SettingsSchema,
});

export type UpdateSoundInput = z.infer<typeof UpdateSoundSchema>;

export interface SoundSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sourceCount: number;
}

export function summarize(scene: Scene): SoundSummary {
  return {
    id: scene.id,
    name: scene.name,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
    sourceCount: scene.sources.length,
  };
}

export interface ClipInfo {
  id: string;
  /** Detected container format, e.g. "wav". */
  format: string;
  mime: string;
  size: number;
}

export interface HealthInfo {
  status: 'ok';
  version: string;
}

export interface ApiError {
  error: string;
  details?: string[];
}

/* ------------------------------------------------------------------------ */
/* Migrations                                                               */
/* ------------------------------------------------------------------------ */

type RawScene = Record<string, unknown>;

/** Upgrades a scene from the version it is keyed under to the next version. */
export type Migration = (scene: RawScene) => RawScene;

/**
 * Migrations keyed by the version they upgrade FROM. To change the format:
 * bump SCENE_VERSION, add `[oldVersion]: (scene) => upgradedScene` here, and
 * add a test. Version 1 is the first released format, so this starts empty.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export class SceneVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SceneVersionError';
  }
}

/**
 * Bring stored scene data up to the current version and validate it.
 * Throws `SceneVersionError` for unknown versions and `ZodError` for bad data.
 */
export function migrateScene(
  raw: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  targetVersion: number = SCENE_VERSION,
): Scene {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SceneVersionError('Scene data is not an object');
  }
  let scene = raw as RawScene;
  let version = scene.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new SceneVersionError('Scene data has no valid version');
  }
  if (version > targetVersion) {
    throw new SceneVersionError(
      `Scene was saved by a newer Earshot (format ${version}, this build reads up to ${targetVersion})`,
    );
  }
  while (version < targetVersion) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new SceneVersionError(`No migration from scene format ${version}`);
    }
    version += 1;
    scene = { ...migrate(scene), version };
  }
  return SceneSchema.parse(scene);
}
