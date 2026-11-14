import type { Scene, SoundSummary } from '@earshot/shared';
import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
export type Busy = 'upload' | 'export' | 'demo' | null;

export interface Toast {
  id: string;
  kind: 'info' | 'error';
  message: string;
}

export interface AppState {
  /** False until the library has loaded for the first time. */
  ready: boolean;
  /** Set when the server could not be reached at startup. */
  loadError: string | null;
  sounds: SoundSummary[];
  scene: Scene | null;
  selectedId: string | null;
  saveState: SaveState;
  playing: boolean;
  /** Ids of the sources whose clips are audible right now. */
  soundingIds: readonly string[];
  busy: Busy;
  settingsOpen: boolean;
  sidebarOpen: boolean;
  theme: Theme;
  hintDismissed: boolean;
  toasts: Toast[];
}

const THEME_KEY = 'earshot:theme';
const HINT_KEY = 'earshot:hint-dismissed';
const LAST_KEY = 'earshot:last-sound';

/** localStorage can throw (private mode, blocked storage); preferences are best-effort. */
export const prefs = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Not persisted; the app still works for this session.
    }
  },
  THEME_KEY,
  HINT_KEY,
  LAST_KEY,
};

const initialState: AppState = {
  ready: false,
  loadError: null,
  sounds: [],
  scene: null,
  selectedId: null,
  saveState: 'saved',
  playing: false,
  soundingIds: [],
  busy: null,
  settingsOpen: false,
  sidebarOpen: false,
  theme: prefs.get(THEME_KEY) === 'light' ? 'light' : 'dark',
  hintDismissed: prefs.get(HINT_KEY) === '1',
  toasts: [],
};

type Listener = () => void;

let state = initialState;
const listeners = new Set<Listener>();

export const store = {
  get: (): AppState => state,
  set(patch: Partial<AppState>): void {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Subscribe a component to one slice of state. Selectors must return stable references. */
export function useStore<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(state));
}
