import {
  DEMO_CLIPS,
  DEMO_SOUND_NAME,
  MAX_SOURCES,
  type Polar,
  type Scene,
  type Settings,
  type Source,
  clampDistance,
  isId,
  isSounding,
  newId,
  normalizeAngle,
  sceneDuration,
  summarize,
} from '@earshot/shared';
import { api } from '../api';
import { clipBuffers, decodeAudio, loadClip, rememberClip } from '../audio/clips';
import { engine } from '../audio/engine';
import { downloadBlob, renderScene, renderedToWav } from '../audio/export';
import { fileSlug, labelFromFilename } from '../lib/format';
import { type Theme, prefs, store } from './store';

const SAVE_DELAY_MS = 400;
const TOAST_MS = 6000;
const DEFAULT_NAME = 'Untitled sound';

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

/* ---- toasts ------------------------------------------------------------ */

export function notify(text: string, kind: 'info' | 'error' = 'error'): void {
  const id = newId();
  store.set({ toasts: [...store.get().toasts, { id, kind, message: text }] });
  window.setTimeout(() => dismissToast(id), TOAST_MS);
}

export function dismissToast(id: string): void {
  store.set({ toasts: store.get().toasts.filter((toast) => toast.id !== id) });
}

/* ---- saving ------------------------------------------------------------ */

let saveTimer: number | undefined;
let saveQueue: Promise<void> = Promise.resolve();

function editable(scene: Scene) {
  return { name: scene.name, sources: scene.sources, settings: scene.settings };
}

/** Save the current scene if it has unsaved changes. Saves never overlap. */
export function saveNow(): Promise<void> {
  window.clearTimeout(saveTimer);
  saveQueue = saveQueue.then(async () => {
    const { scene, saveState } = store.get();
    if (!scene || saveState === 'saved') return;
    store.set({ saveState: 'saving' });
    try {
      await api.saveSound(scene.id, editable(scene));
      // An edit made while the request was in flight has already queued another save.
      if (store.get().scene === scene) store.set({ saveState: 'saved' });
    } catch (error) {
      if (store.get().scene?.id === scene.id) store.set({ saveState: 'error' });
      notify(`Could not save: ${message(error)}`);
    }
  });
  return saveQueue;
}

/** Last-chance save when the page is being closed; `keepalive` lets it outlive the page. */
export function saveOnExit(): void {
  const { scene, saveState } = store.get();
  if (!scene || saveState === 'saved') return;
  window.clearTimeout(saveTimer);
  api.saveSound(scene.id, editable(scene), true).catch(() => undefined);
}

function commit(next: Scene): void {
  const { sounds, selectedId } = store.get();
  const selectionGone = selectedId !== null && !next.sources.some((s) => s.id === selectedId);
  store.set({
    scene: next,
    saveState: 'dirty',
    selectedId: selectionGone ? null : selectedId,
    sounds: sounds.map((sound) =>
      sound.id === next.id
        ? { ...sound, name: next.name, sourceCount: next.sources.length }
        : sound,
    ),
  });
  if (engine.playing) engine.sync(next, clipBuffers());
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), SAVE_DELAY_MS);
}

function editScene(change: (scene: Scene) => Scene): void {
  const { scene } = store.get();
  if (!scene) return;
  const next = change(scene);
  if (next !== scene) commit(next);
}

/* ---- library ----------------------------------------------------------- */

function preloadClips(scene: Scene): void {
  const ids = new Set(scene.sources.map((source) => source.clipId));
  for (const id of ids) {
    loadClip(id).then(
      () => {
        // A clip that arrives mid-playback joins in from the current position.
        const current = store.get().scene;
        if (current && engine.playing) engine.sync(current, clipBuffers());
      },
      (error: unknown) => notify(`A clip failed to load: ${message(error)}`),
    );
  }
}

function showScene(scene: Scene): void {
  stop();
  store.set({ scene, selectedId: null, saveState: 'saved', sidebarOpen: false });
  prefs.set(prefs.LAST_KEY, scene.id);
  if (window.location.hash !== `#${scene.id}`) {
    window.history.replaceState(null, '', `#${scene.id}`);
  }
  preloadClips(scene);
}

export async function openSound(id: string): Promise<void> {
  if (store.get().scene?.id === id) {
    store.set({ sidebarOpen: false });
    return;
  }
  try {
    await saveNow();
    showScene(await api.getSound(id));
  } catch (error) {
    notify(`Could not open sound: ${message(error)}`);
  }
}

export async function createSound(): Promise<void> {
  try {
    await saveNow();
    const scene = await api.createSound({ name: DEFAULT_NAME });
    store.set({ sounds: [summarize(scene), ...store.get().sounds] });
    showScene(scene);
  } catch (error) {
    notify(`Could not create sound: ${message(error)}`);
  }
}

export async function duplicateSound(id: string): Promise<void> {
  try {
    await saveNow();
    const copy = await api.duplicateSound(id);
    store.set({ sounds: [summarize(copy), ...store.get().sounds] });
    showScene(copy);
  } catch (error) {
    notify(`Could not duplicate sound: ${message(error)}`);
  }
}

export async function renameSound(id: string, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) return;
  const { scene, sounds } = store.get();
  if (scene?.id === id) {
    editScene((current) => (current.name === trimmed ? current : { ...current, name: trimmed }));
    return;
  }
  try {
    const other = await api.getSound(id);
    await api.saveSound(id, { ...editable(other), name: trimmed });
    store.set({ sounds: sounds.map((s) => (s.id === id ? { ...s, name: trimmed } : s)) });
  } catch (error) {
    notify(`Could not rename sound: ${message(error)}`);
  }
}

export async function deleteSound(id: string): Promise<void> {
  try {
    const wasOpen = store.get().scene?.id === id;
    if (wasOpen) {
      stop();
      window.clearTimeout(saveTimer);
      await saveQueue;
    }
    await api.deleteSound(id);
    const sounds = store.get().sounds.filter((sound) => sound.id !== id);
    store.set({ sounds });
    if (!wasOpen) return;
    const next = sounds[0];
    if (next) showScene(await api.getSound(next.id));
    else {
      store.set({ scene: null, saveState: 'saved' });
      await createSound();
    }
  } catch (error) {
    notify(`Could not delete sound: ${message(error)}`);
  }
}

/** Load the library and open the Sound from the URL, the last one used, or the newest. */
export async function init(): Promise<void> {
  try {
    const sounds = await api.listSounds();
    store.set({ sounds, loadError: null });
    const wanted = [window.location.hash.slice(1), prefs.get(prefs.LAST_KEY) ?? ''];
    const id = wanted.find(
      (candidate) => isId(candidate) && sounds.some((s) => s.id === candidate),
    );
    const target = id ?? sounds[0]?.id;
    if (target) showScene(await api.getSound(target));
    else await createSound();
    store.set({ ready: true });
  } catch (error) {
    store.set({ ready: true, loadError: message(error) });
  }
}

/** Follow a Sound link pasted or edited into the address bar of an open tab. */
export function openFromHash(): void {
  const id = window.location.hash.slice(1);
  if (isId(id) && store.get().sounds.some((sound) => sound.id === id)) void openSound(id);
}

/* ---- sources ----------------------------------------------------------- */

export function select(id: string | null): void {
  if (store.get().selectedId !== id) store.set({ selectedId: id });
}

export function updateSource(id: string, patch: Partial<Omit<Source, 'id' | 'clipId'>>): void {
  editScene((scene) => {
    const current = scene.sources.find((source) => source.id === id);
    if (!current) return scene;
    const changed = Object.entries(patch).some(
      ([key, value]) => current[key as keyof Source] !== value,
    );
    if (!changed) return scene;
    return {
      ...scene,
      sources: scene.sources.map((source) => (source.id === id ? { ...source, ...patch } : source)),
    };
  });
}

export function moveSource(id: string, position: Polar): void {
  const max = store.get().scene?.settings.maxDistance ?? 10;
  updateSource(id, {
    angle: normalizeAngle(position.angle),
    distance: clampDistance(position.distance, max),
  });
}

export function removeSource(id: string): void {
  editScene((scene) => ({ ...scene, sources: scene.sources.filter((s) => s.id !== id) }));
}

export function updateSettings(patch: Partial<Settings>): void {
  editScene((scene) => {
    const settings = { ...scene.settings, ...patch };
    // Shrinking the radar pulls in any sources left outside the new outer ring.
    const sources =
      patch.maxDistance === undefined
        ? scene.sources
        : scene.sources.map((source) =>
            source.distance > settings.maxDistance
              ? { ...source, distance: settings.maxDistance }
              : source,
          );
    return { ...scene, settings, sources };
  });
}

type Placement = Pick<Source, 'label' | 'angle' | 'distance'> &
  Partial<Pick<Source, 'startOffset' | 'gain' | 'loop'>>;

/** Decode, upload and place one audio file. Returns the new source id, or null on failure. */
async function addClip(file: Blob, name: string, placement: Placement): Promise<string | null> {
  const scene = store.get().scene;
  if (!scene) return null;
  if (scene.sources.length >= MAX_SOURCES) {
    notify(`A sound can hold at most ${MAX_SOURCES} sources`);
    return null;
  }
  let buffer: AudioBuffer;
  try {
    buffer = await decodeAudio(await file.arrayBuffer());
  } catch {
    notify(`"${name}" is not audio this browser can decode`);
    return null;
  }
  try {
    const clip = await api.uploadClip(file);
    rememberClip(clip.id, buffer);
    const source: Source = {
      id: newId(),
      clipId: clip.id,
      startOffset: 0,
      gain: 1,
      loop: false,
      ...placement,
      angle: normalizeAngle(placement.angle),
      distance: clampDistance(placement.distance, scene.settings.maxDistance),
      duration: buffer.duration,
    };
    editScene((current) =>
      current.id === scene.id ? { ...current, sources: [...current.sources, source] } : current,
    );
    return store.get().scene?.id === scene.id ? source.id : null;
  } catch (error) {
    notify(`Could not upload "${name}": ${message(error)}`);
    return null;
  }
}

/** Add dropped or picked files. Several files fan out clockwise from the drop point. */
export async function addFiles(files: readonly File[], at?: Polar): Promise<void> {
  const { scene, busy } = store.get();
  if (!scene || busy || files.length === 0) return;
  const origin = at ?? { angle: 0, distance: scene.settings.maxDistance * 0.3 };
  store.set({ busy: 'upload' });
  try {
    let last: string | null = null;
    for (const [index, file] of files.entries()) {
      const id = await addClip(file, file.name, {
        label: labelFromFilename(file.name),
        angle: origin.angle + index * scene.settings.snapAngle,
        distance: origin.distance,
      });
      last = id ?? last;
    }
    if (last) select(last);
  } finally {
    store.set({ busy: null });
  }
}

/** Fill the current (empty) Sound with the built-in demo scene. */
export async function loadDemo(): Promise<void> {
  const { scene, busy } = store.get();
  if (!scene || busy) return;
  store.set({ busy: 'demo' });
  try {
    if (scene.name === DEFAULT_NAME) await renameSound(scene.id, DEMO_SOUND_NAME);
    for (const clip of DEMO_CLIPS) {
      const response = await fetch(`${import.meta.env.BASE_URL}demo/${clip.file}`);
      if (!response.ok) throw new Error(`Demo clip ${clip.file} is missing`);
      await addClip(await response.blob(), clip.file, clip.placement);
    }
  } catch (error) {
    notify(`Could not load the demo: ${message(error)}`);
  } finally {
    store.set({ busy: null });
  }
}

/* ---- playback ---------------------------------------------------------- */

let ticker: number | undefined;

function tick(): void {
  const { scene, soundingIds } = store.get();
  if (!scene || !engine.playing) return;
  const time = engine.time();
  if (time >= sceneDuration(scene)) {
    stop();
    return;
  }
  const buffers = clipBuffers();
  const ids = scene.sources
    .filter((source) => buffers.has(source.clipId) && isSounding(source, time))
    .map((source) => source.id);
  if (ids.length !== soundingIds.length || ids.some((id, i) => id !== soundingIds[i])) {
    store.set({ soundingIds: ids });
  }
}

export async function play(): Promise<void> {
  const { scene } = store.get();
  if (!scene || scene.sources.length === 0) return;
  try {
    await engine.play(scene, clipBuffers());
    store.set({ playing: true });
    window.clearInterval(ticker);
    ticker = window.setInterval(tick, 50);
    tick();
  } catch (error) {
    notify(`Could not start playback: ${message(error)}`);
  }
}

export function stop(): void {
  window.clearInterval(ticker);
  engine.stop();
  if (store.get().playing || store.get().soundingIds.length > 0) {
    store.set({ playing: false, soundingIds: [] });
  }
}

export function togglePlay(): void {
  if (store.get().playing) stop();
  else void play();
}

/** Seconds into the Sound while playing, otherwise 0. */
export function playbackTime(): number {
  return engine.time();
}

export function warmAudio(): void {
  engine.warm();
}

/* ---- export ------------------------------------------------------------ */

export async function exportWav(): Promise<void> {
  const { scene, busy } = store.get();
  if (!scene || busy || scene.sources.length === 0) return;
  store.set({ busy: 'export' });
  try {
    await Promise.all(scene.sources.map((source) => loadClip(source.clipId)));
    const rendered = await renderScene(scene, clipBuffers());
    const filename = `${fileSlug(scene.name)}.wav`;
    downloadBlob(renderedToWav(rendered, scene.settings.exportBitDepth), filename);
    notify(`Exported ${filename}`, 'info');
  } catch (error) {
    notify(`Export failed: ${message(error)}`);
  } finally {
    store.set({ busy: null });
  }
}

/* ---- interface --------------------------------------------------------- */

export function setTheme(theme: Theme): void {
  prefs.set(prefs.THEME_KEY, theme);
  store.set({ theme });
}

export function dismissHint(): void {
  prefs.set(prefs.HINT_KEY, '1');
  store.set({ hintDismissed: true });
}

export function setSettingsOpen(open: boolean): void {
  store.set({ settingsOpen: open });
}

export function setSidebarOpen(open: boolean): void {
  store.set({ sidebarOpen: open });
}
