import { type ReactNode, useEffect, useId, useState } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}

/** A labelled row: label on the left, control on the right. */
export function Field({ label, hint, children }: FieldProps) {
  const id = useId();
  return (
    <div className="field">
      <div className="field__text">
        <label htmlFor={id} id={`${id}-label`}>
          {label}
        </label>
        {hint && <p className="field__hint">{hint}</p>}
      </div>
      <div className="field__control">{children(id)}</div>
    </div>
  );
}

interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** A small set of mutually exclusive choices, as a radio group. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  const name = useId();
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className="segmented__option">
          <input
            type="radio"
            name={name}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

interface NumberInputProps {
  id?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  ariaLabel?: string;
  onChange: (value: number) => void;
}

/**
 * A number box that only commits valid, in-range values, so half-typed input
 * never reaches the scene. Reverts to the last good value on blur.
 */
export function NumberInput({
  id,
  value,
  min,
  max,
  step,
  unit,
  ariaLabel,
  onChange,
}: NumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  return (
    <span className="number">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft}
        min={min}
        max={max}
        step={step}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
          setDraft(String(value));
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number(event.target.value);
          if (
            event.target.value.trim() !== '' &&
            Number.isFinite(next) &&
            next >= min &&
            next <= max
          ) {
            onChange(next);
          }
        }}
      />
      {unit && <span className="number__unit">{unit}</span>}
    </span>
  );
}

interface SliderProps {
  id?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Text shown beside the slider and announced to assistive tech. */
  display: string;
  ariaLabel?: string;
  onChange: (value: number) => void;
}

export function Slider({ id, value, min, max, step, display, ariaLabel, onChange }: SliderProps) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <span className="slider">
      <input
        id={id}
        type="range"
        aria-label={ariaLabel}
        aria-valuetext={display}
        value={value}
        min={min}
        max={max}
        step={step}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output className="slider__value">{display}</output>
    </span>
  );
}

interface SwitchProps {
  id?: string;
  checked: boolean;
  ariaLabel?: string;
  onChange: (checked: boolean) => void;
}

export function Switch({ id, checked, ariaLabel, onChange }: SwitchProps) {
  return (
    <input
      id={id}
      className="switch"
      type="checkbox"
      role="switch"
      aria-label={ariaLabel}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

interface NameInputProps {
  value: string;
  ariaLabel: string;
  className?: string;
  maxLength?: number;
  autoFocus?: boolean;
  onCommit: (value: string) => void;
  onDone?: () => void;
}

/** A text box for names: commits on Enter or blur, ignores empty input, Escape cancels. */
export function NameInput({
  value,
  ariaLabel,
  className,
  maxLength = 80,
  autoFocus,
  onCommit,
  onDone,
}: NameInputProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const finish = (commit: boolean) => {
    const next = draft.trim();
    if (commit && next && next !== value) onCommit(next);
    else setDraft(value);
    setEditing(false);
    onDone?.();
  };

  return (
    <input
      className={className}
      type="text"
      aria-label={ariaLabel}
      value={draft}
      maxLength={maxLength}
      autoFocus={autoFocus}
      spellCheck={false}
      autoComplete="off"
      onFocus={(event) => {
        setEditing(true);
        if (autoFocus) event.target.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          event.stopPropagation();
          setDraft(value);
          // Blur after the draft has been reset so the cancelled text is not committed.
          const input = event.currentTarget;
          window.setTimeout(() => input.blur());
        }
      }}
    />
  );
}
