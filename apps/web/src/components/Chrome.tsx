import {
  dismissHint,
  dismissToast,
  renameSound,
  setSettingsOpen,
  setSidebarOpen,
} from '../state/actions';
import { type SaveState, useStore } from '../state/store';
import { NameInput } from './controls';
import { CloseIcon, HeadphonesIcon, MenuIcon, SettingsIcon } from './icons';

const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'Saved',
  dirty: 'Saving…',
  saving: 'Saving…',
  error: 'Not saved',
};

/** The strip above the radar: Sound name, save status and the settings button. */
export function Header() {
  const scene = useStore((s) => s.scene);
  const saveState = useStore((s) => s.saveState);

  return (
    <header className="header">
      <button
        className="icon-button header__menu"
        aria-label="Show sounds"
        onClick={() => setSidebarOpen(true)}
      >
        <MenuIcon />
      </button>
      {scene && (
        <NameInput
          className="header__title"
          ariaLabel="Sound name"
          value={scene.name}
          onCommit={(name) => void renameSound(scene.id, name)}
        />
      )}
      <span
        className={`save save--${saveState}`}
        role="status"
        data-testid="save-status"
        data-state={saveState}
      >
        {scene ? SAVE_LABELS[saveState] : ''}
      </span>
      <div className="header__spacer" />
      <button
        className="icon-button"
        aria-label="Settings"
        title="Settings"
        data-testid="open-settings"
        onClick={() => setSettingsOpen(true)}
      >
        <SettingsIcon />
      </button>
    </header>
  );
}

/** One-time reminder that the whole point needs headphones. */
export function Hint() {
  const dismissed = useStore((s) => s.hintDismissed);
  if (dismissed) return null;
  return (
    <div className="hint" role="note">
      <HeadphonesIcon />
      <p>Use headphones. On AirPods, turn off Spatialize Stereo when playing exported files.</p>
      <button className="icon-button" aria-label="Dismiss hint" onClick={dismissHint}>
        <CloseIcon />
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.kind}`}
          role={toast.kind === 'error' ? 'alert' : 'status'}
        >
          <p>{toast.message}</p>
          <button
            className="icon-button"
            aria-label="Dismiss"
            onClick={() => dismissToast(toast.id)}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
