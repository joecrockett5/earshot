import type { SoundSummary } from '@earshot/shared';
import { useEffect, useRef, useState } from 'react';
import { createSound, deleteSound, duplicateSound, openSound, renameSound } from '../state/actions';
import { useStore } from '../state/store';
import { Logo } from './Logo';
import { NameInput } from './controls';
import { MoreIcon, PlusIcon, SearchIcon } from './icons';

/** The search box only appears once the library is long enough to need it. */
const SEARCH_THRESHOLD = 8;

interface RowProps {
  sound: SoundSummary;
  active: boolean;
}

function SoundRow({ sound, active }: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !rowRef.current?.contains(event.target as Node)
      ) {
        setMenuOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  const act = (action: () => void) => {
    setMenuOpen(false);
    setConfirming(false);
    action();
  };

  return (
    <li
      ref={rowRef}
      className={`sound${active ? ' sound--active' : ''}${menuOpen ? ' sound--menu' : ''}`}
    >
      {renaming ? (
        <NameInput
          className="sound__rename"
          ariaLabel={`Rename ${sound.name}`}
          value={sound.name}
          autoFocus
          onCommit={(name) => void renameSound(sound.id, name)}
          onDone={() => setRenaming(false)}
        />
      ) : (
        <button
          className="sound__open"
          aria-current={active ? 'true' : undefined}
          onClick={() => void openSound(sound.id)}
          onDoubleClick={() => setRenaming(true)}
        >
          <span className="sound__name">{sound.name}</span>
          <span className="sound__count">{sound.sourceCount}</span>
        </button>
      )}

      <button
        className="icon-button sound__more"
        aria-label={`Actions for ${sound.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => {
          setMenuOpen(!menuOpen);
          setConfirming(false);
        }}
      >
        <MoreIcon />
      </button>

      {menuOpen && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={() => act(() => setRenaming(true))}>
            Rename
          </button>
          <button role="menuitem" onClick={() => act(() => void duplicateSound(sound.id))}>
            Duplicate
          </button>
          {confirming ? (
            <button
              role="menuitem"
              className="menu__danger"
              autoFocus
              onClick={() => act(() => void deleteSound(sound.id))}
            >
              Confirm delete
            </button>
          ) : (
            <button role="menuitem" className="menu__danger" onClick={() => setConfirming(true)}>
              Delete…
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function Sidebar() {
  const sounds = useStore((s) => s.sounds);
  const currentId = useStore((s) => s.scene?.id);
  const open = useStore((s) => s.sidebarOpen);
  const [query, setQuery] = useState('');

  const searchable = sounds.length > SEARCH_THRESHOLD;
  const needle = searchable ? query.trim().toLowerCase() : '';
  const visible = needle ? sounds.filter((s) => s.name.toLowerCase().includes(needle)) : sounds;

  return (
    <nav className={`sidebar${open ? ' sidebar--open' : ''}`} aria-label="Sounds">
      <div className="brand">
        <Logo />
        <span className="brand__name">Earshot</span>
      </div>

      <div className="sidebar__head">
        <h2>Sounds</h2>
        <button className="button button--small" onClick={() => void createSound()}>
          <PlusIcon />
          New
        </button>
      </div>

      {searchable && (
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search"
            aria-label="Search sounds"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}

      <ul className="sounds">
        {visible.map((sound) => (
          <SoundRow key={sound.id} sound={sound} active={sound.id === currentId} />
        ))}
      </ul>
      {needle && visible.length === 0 && (
        <p className="sidebar__none">No sounds match “{query.trim()}”.</p>
      )}
    </nav>
  );
}
