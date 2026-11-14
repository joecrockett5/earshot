import { describeDirection } from '@earshot/shared';
import { dbToGain, formatAngle, formatDb, formatDistance, gainToDb } from '../lib/format';
import { removeSource, select, updateSource } from '../state/actions';
import { useStore } from '../state/store';
import { Field, NameInput, NumberInput, Slider, Switch } from './controls';
import { CloseIcon, TrashIcon } from './icons';

const MIN_DB = -24;
const MAX_DB = 12;

/** Properties of the selected source. Rendered only while something is selected. */
export function Inspector() {
  const source = useStore((s) => s.scene?.sources.find((item) => item.id === s.selectedId));
  if (!source) return null;

  const db = Math.min(MAX_DB, Math.max(MIN_DB, gainToDb(source.gain)));

  return (
    <aside className="inspector" aria-label="Source properties">
      <header className="inspector__header">
        <NameInput
          className="inspector__label"
          ariaLabel="Label"
          value={source.label}
          maxLength={60}
          onCommit={(label) => updateSource(source.id, { label })}
        />
        <button className="icon-button" aria-label="Close inspector" onClick={() => select(null)}>
          <CloseIcon />
        </button>
      </header>

      <p className="inspector__position" data-testid="position-readout">
        <span>{formatAngle(source.angle)}</span>
        <span className="inspector__direction">{describeDirection(source.angle)}</span>
        <span>{formatDistance(source.distance)}</span>
      </p>

      <Field label="Start">
        {(id) => (
          <NumberInput
            id={id}
            value={Number(source.startOffset.toFixed(2))}
            min={0}
            max={3600}
            step={0.1}
            unit="s"
            onChange={(startOffset) => updateSource(source.id, { startOffset })}
          />
        )}
      </Field>

      <Field label="Gain">
        {(id) => (
          <Slider
            id={id}
            value={db}
            min={MIN_DB}
            max={MAX_DB}
            step={0.5}
            display={formatDb(db)}
            onChange={(next) => updateSource(source.id, { gain: dbToGain(next) })}
          />
        )}
      </Field>

      <Field label="Loop">
        {(id) => (
          <Switch
            id={id}
            checked={source.loop}
            onChange={(loop) => updateSource(source.id, { loop })}
          />
        )}
      </Field>

      <button
        className="button button--danger inspector__delete"
        onClick={() => removeSource(source.id)}
      >
        <TrashIcon />
        Delete source
      </button>
    </aside>
  );
}
