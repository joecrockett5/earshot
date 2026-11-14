import { useEffect } from 'react';
import { Header, Hint, Toasts } from './components/Chrome';
import { Inspector } from './components/Inspector';
import { Radar } from './components/Radar';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { Transport } from './components/Transport';
import {
  exportWav,
  init,
  removeSource,
  saveOnExit,
  select,
  setSidebarOpen,
  togglePlay,
  warmAudio,
} from './state/actions';
import { store, useStore } from './state/store';

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  // Checkboxes, radios and sliders keep the global shortcuts; text-like inputs do not.
  return (
    target instanceof HTMLInputElement && !['checkbox', 'radio', 'range'].includes(target.type)
  );
}

/** Native controls that Space or Enter already activates. */
function isActivatable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement ||
    target instanceof HTMLInputElement ||
    (target instanceof HTMLElement && target.tagName === 'SUMMARY')
  );
}

function onKeyDown(event: KeyboardEvent): void {
  const { settingsOpen, selectedId } = store.get();
  if (event.defaultPrevented) return;

  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'e') {
    event.preventDefault();
    void exportWav();
    return;
  }
  if (settingsOpen || isTextEntry(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }
  if (event.key === ' ' && !isActivatable(event.target)) {
    event.preventDefault();
    togglePlay();
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
    event.preventDefault();
    removeSource(selectedId);
  } else if (event.key === 'Escape') {
    select(null);
    setSidebarOpen(false);
  }
}

export function App() {
  const ready = useStore((s) => s.ready);
  const loadError = useStore((s) => s.loadError);
  const theme = useStore((s) => s.theme);
  const sidebarOpen = useStore((s) => s.sidebarOpen);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    void init();
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('pagehide', saveOnExit);
    window.addEventListener('pointerdown', warmAudio, { once: true });
    window.addEventListener('keydown', warmAudio, { once: true });
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pagehide', saveOnExit);
      window.removeEventListener('pointerdown', warmAudio);
      window.removeEventListener('keydown', warmAudio);
    };
  }, []);

  if (loadError) {
    return (
      <main className="fatal">
        <h1>Earshot cannot reach its server</h1>
        <p>{loadError}</p>
        <button className="button button--accent" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  }

  return (
    <div className="app" data-ready={ready}>
      <Sidebar />
      {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} />}
      <main className="main">
        <Header />
        <div className="stage">
          <Hint />
          <Radar />
          <Inspector />
        </div>
        <Transport />
      </main>
      <Settings />
      <Toasts />
    </div>
  );
}
