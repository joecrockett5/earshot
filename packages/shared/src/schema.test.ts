import { describe, expect, it } from 'vitest';
import { newId, isId } from './id';
import {
  CreateSoundSchema,
  DEFAULT_SETTINGS,
  SCENE_VERSION,
  SceneSchema,
  SceneVersionError,
  SourceSchema,
  UpdateSoundSchema,
  migrateScene,
  summarize,
} from './schema';

function validSource() {
  return {
    id: newId(),
    clipId: newId(),
    label: 'Knock',
    angle: 180,
    distance: 2.5,
    startOffset: 0,
    gain: 1,
    loop: false,
    duration: 1.2,
  };
}

function validScene() {
  const now = new Date().toISOString();
  return {
    version: SCENE_VERSION,
    id: newId(),
    name: 'Test',
    createdAt: now,
    updatedAt: now,
    sources: [validSource()],
    settings: { ...DEFAULT_SETTINGS },
  };
}

describe('ids', () => {
  it('generates unique 32 character hex ids', () => {
    const a = newId();
    const b = newId();
    expect(a).toMatch(/^[a-f0-9]{32}$/);
    expect(a).not.toBe(b);
    expect(isId(a)).toBe(true);
  });

  it('rejects anything that could be a path', () => {
    expect(isId('../../etc/passwd')).toBe(false);
    expect(isId('a'.repeat(31))).toBe(false);
    expect(isId(`${'a'.repeat(32)}.json`)).toBe(false);
    expect(isId(42)).toBe(false);
  });
});

describe('settings', () => {
  it('has the documented defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      maxDistance: 10,
      reverb: 0.2,
      exportBitDepth: 16,
      exportSampleRate: 48000,
      snapAngle: 15,
      loopDuration: 30,
    });
  });
});

describe('SceneSchema', () => {
  it('accepts a valid scene', () => {
    const scene = validScene();
    expect(SceneSchema.parse(scene)).toEqual(scene);
  });

  it('fills in default settings and source fields', () => {
    const { settings: _settings, ...rest } = validScene();
    const { startOffset: _s, gain: _g, loop: _l, ...source } = validSource();
    const parsed = SceneSchema.parse({ ...rest, sources: [source] });
    expect(parsed.settings).toEqual(DEFAULT_SETTINGS);
    expect(parsed.sources[0]).toMatchObject({ startOffset: 0, gain: 1, loop: false });
  });

  it.each([
    ['angle of 360', { angle: 360 }],
    ['negative angle', { angle: -1 }],
    ['negative distance', { distance: -1 }],
    ['non-finite distance', { distance: Infinity }],
    ['empty label', { label: '   ' }],
    ['bad clip id', { clipId: '../secret' }],
    ['negative start offset', { startOffset: -0.1 }],
  ])('rejects a source with %s', (_name, patch) => {
    expect(SourceSchema.safeParse({ ...validSource(), ...patch }).success).toBe(false);
  });

  it.each([
    ['unknown panning model', { panningModel: 'ambisonic' }],
    ['unsupported bit depth', { exportBitDepth: 32 }],
    ['unsupported sample rate', { exportSampleRate: 96000 }],
    ['zero max distance', { maxDistance: 0 }],
    ['reverb above 1', { reverb: 1.5 }],
  ])('rejects settings with %s', (_name, patch) => {
    const scene = validScene();
    const result = SceneSchema.safeParse({ ...scene, settings: { ...scene.settings, ...patch } });
    expect(result.success).toBe(false);
  });

  it('rejects the wrong version', () => {
    expect(SceneSchema.safeParse({ ...validScene(), version: 2 }).success).toBe(false);
  });

  it('trims names and labels', () => {
    const parsed = SceneSchema.parse({ ...validScene(), name: '  Door  ' });
    expect(parsed.name).toBe('Door');
  });
});

describe('request schemas', () => {
  it('CreateSoundSchema defaults everything', () => {
    expect(CreateSoundSchema.parse({})).toEqual({
      name: 'Untitled sound',
      sources: [],
      settings: DEFAULT_SETTINGS,
    });
  });

  it('UpdateSoundSchema requires the full editable document', () => {
    expect(UpdateSoundSchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(
      UpdateSoundSchema.safeParse({ name: 'x', sources: [], settings: DEFAULT_SETTINGS }).success,
    ).toBe(true);
  });

  it('summarize reports the source count', () => {
    const scene = SceneSchema.parse(validScene());
    expect(summarize(scene)).toEqual({
      id: scene.id,
      name: scene.name,
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
      sourceCount: 1,
    });
  });
});

describe('migrateScene', () => {
  it('returns a current scene unchanged', () => {
    const scene = validScene();
    expect(migrateScene(scene)).toEqual(scene);
  });

  it('runs each migration in order up to the target version', () => {
    // A pretend history: format 0 stored positions as x/z metres and had no
    // settings; format 1 is today's.
    const { settings: _settings, ...current } = validScene();
    const legacy = {
      ...current,
      version: 0,
      sources: [{ ...validSource(), angle: undefined, distance: undefined, x: 3, z: 0 }],
    };
    const calls: number[] = [];
    const migrated = migrateScene(legacy, {
      0: (scene) => {
        calls.push(0);
        const sources = (scene.sources as Record<string, number>[]).map((s) => ({
          ...s,
          angle: 90,
          distance: Math.hypot(s.x ?? 0, s.z ?? 0),
        }));
        return { ...scene, sources };
      },
    });
    expect(calls).toEqual([0]);
    expect(migrated.version).toBe(SCENE_VERSION);
    expect(migrated.sources[0]).toMatchObject({ angle: 90, distance: 3 });
    expect(migrated.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('refuses scenes from a newer format', () => {
    expect(() => migrateScene({ ...validScene(), version: SCENE_VERSION + 1 })).toThrow(
      SceneVersionError,
    );
  });

  it('refuses data with no usable version', () => {
    expect(() => migrateScene({ name: 'x' })).toThrow(SceneVersionError);
    expect(() => migrateScene({ version: '1' })).toThrow(SceneVersionError);
    expect(() => migrateScene(null)).toThrow(SceneVersionError);
    expect(() => migrateScene([])).toThrow(SceneVersionError);
  });

  it('refuses an old version with no migration path', () => {
    expect(() => migrateScene({ ...validScene(), version: 0 }, {})).toThrow(/No migration/);
  });

  it('still validates after migrating', () => {
    expect(() => migrateScene({ ...validScene(), name: '' })).toThrow();
  });
});
