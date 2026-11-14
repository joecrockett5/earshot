import { hasLoop, sceneDuration } from '@earshot/shared';
import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../lib/format';
import { addFiles, exportWav, playbackTime, togglePlay } from '../state/actions';
import { useStore } from '../state/store';
import { DownloadIcon, PlayIcon, PlusIcon, StopIcon } from './icons';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

function Clock({ playing, total }: { playing: boolean; total: number }) {
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!playing) {
      setTime(0);
      return;
    }
    let frame = requestAnimationFrame(function update() {
      setTime(playbackTime());
      frame = requestAnimationFrame(update);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  return (
    <div className="clock" role="timer" aria-label="Playback position">
      <span className="clock__now">{formatTime(Math.min(time, total))}</span>
      <span className="clock__total">/ {formatTime(total)}</span>
    </div>
  );
}

export function Transport() {
  const scene = useStore((s) => s.scene);
  const playing = useStore((s) => s.playing);
  const busy = useStore((s) => s.busy);
  const fileRef = useRef<HTMLInputElement>(null);

  const total = scene ? sceneDuration(scene) : 0;
  const empty = !scene || scene.sources.length === 0;
  const looping = scene ? hasLoop(scene) : false;

  return (
    <footer className="transport">
      <button
        className={`play${playing ? ' play--active' : ''}`}
        aria-label={playing ? 'Stop' : 'Play'}
        title={playing ? 'Stop (Space)' : 'Play (Space)'}
        disabled={empty}
        onClick={togglePlay}
      >
        {playing ? <StopIcon /> : <PlayIcon />}
      </button>

      <Clock playing={playing} total={total} />
      {looping && <span className="badge">Loop</span>}

      <div className="transport__spacer" />

      <button
        className="button button--quiet"
        disabled={!scene || busy !== null}
        onClick={() => fileRef.current?.click()}
      >
        <PlusIcon />
        <span className="button__text">{busy === 'upload' ? 'Adding…' : 'Add clip'}</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
        multiple
        hidden
        onChange={(event) => {
          void addFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />

      <button
        className="button button--accent"
        disabled={empty || busy !== null}
        title={`Export WAV (${isMac ? '⌘' : 'Ctrl+'}E)`}
        onClick={() => void exportWav()}
      >
        <DownloadIcon />
        <span className="button__text">{busy === 'export' ? 'Exporting…' : 'Export'}</span>
      </button>
    </footer>
  );
}
