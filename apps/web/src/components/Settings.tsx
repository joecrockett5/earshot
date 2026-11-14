import {
  BIT_DEPTHS,
  DISTANCE_MODELS,
  type DistanceModel,
  type PanningModel,
  SAMPLE_RATES,
  hasLoop,
} from '@earshot/shared';
import { useEffect, useRef } from 'react';
import { formatNumber } from '../lib/format';
import { setSettingsOpen, setTheme, updateSettings } from '../state/actions';
import { type Theme, useStore } from '../state/store';
import { Field, NumberInput, Segmented, Slider } from './controls';
import { CloseIcon } from './icons';

const PANNING_OPTIONS: { value: PanningModel; label: string }[] = [
  { value: 'HRTF', label: 'HRTF' },
  { value: 'equalpower', label: 'Equal-power' },
];

const DISTANCE_LABELS: Record<DistanceModel, string> = {
  inverse: 'Inverse',
  linear: 'Linear',
  exponential: 'Exponential',
};

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

/** Everything that is not needed minute to minute, behind the settings button. */
export function Settings() {
  const open = useStore((s) => s.settingsOpen);
  const scene = useStore((s) => s.scene);
  const theme = useStore((s) => s.theme);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const settings = scene?.settings;

  return (
    <dialog
      ref={dialogRef}
      className="drawer"
      aria-labelledby="settings-title"
      onClose={() => setSettingsOpen(false)}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) setSettingsOpen(false);
      }}
    >
      {open && settings && scene && (
        <div className="drawer__panel">
          <header className="drawer__header">
            <h2 id="settings-title">Settings</h2>
            <button
              className="icon-button"
              aria-label="Close settings"
              onClick={() => setSettingsOpen(false)}
            >
              <CloseIcon />
            </button>
          </header>

          <div className="drawer__body">
            <section>
              <h3>Space</h3>
              <Field
                label="Panning"
                hint="HRTF is binaural 3D. Equal-power is ordinary left–right stereo."
              >
                {() => (
                  <Segmented
                    label="Panning model"
                    value={settings.panningModel}
                    options={PANNING_OPTIONS}
                    onChange={(panningModel) => updateSettings({ panningModel })}
                  />
                )}
              </Field>
              <Field
                label="Distance model"
                hint="How quickly sounds get quieter as they move away."
              >
                {() => (
                  <Segmented
                    label="Distance model"
                    value={settings.distanceModel}
                    options={DISTANCE_MODELS.map((value) => ({
                      value,
                      label: DISTANCE_LABELS[value],
                    }))}
                    onChange={(distanceModel) => updateSettings({ distanceModel })}
                  />
                )}
              </Field>
              <Field label="Radar radius" hint="Distance of the outer ring.">
                {(id) => (
                  <NumberInput
                    id={id}
                    value={settings.maxDistance}
                    min={1}
                    max={100}
                    step={1}
                    unit="m"
                    onChange={(maxDistance) => updateSettings({ maxDistance })}
                  />
                )}
              </Field>
              <Field label="Room reverb" hint="A little helps sounds sit outside your head.">
                {(id) => (
                  <Slider
                    id={id}
                    value={Math.round(settings.reverb * 100)}
                    min={0}
                    max={100}
                    step={1}
                    display={`${Math.round(settings.reverb * 100)}%`}
                    onChange={(percent) => updateSettings({ reverb: percent / 100 })}
                  />
                )}
              </Field>
            </section>

            <section>
              <h3>Editing</h3>
              <Field label="Snap angle" hint="Step used while holding Shift.">
                {(id) => (
                  <NumberInput
                    id={id}
                    value={settings.snapAngle}
                    min={1}
                    max={90}
                    step={1}
                    unit="°"
                    onChange={(snapAngle) => updateSettings({ snapAngle })}
                  />
                )}
              </Field>
            </section>

            <section>
              <h3>Export</h3>
              <Field label="Bit depth">
                {() => (
                  <Segmented
                    label="Export bit depth"
                    value={settings.exportBitDepth}
                    options={BIT_DEPTHS.map((value) => ({ value, label: `${value}-bit` }))}
                    onChange={(exportBitDepth) => updateSettings({ exportBitDepth })}
                  />
                )}
              </Field>
              <Field label="Sample rate">
                {() => (
                  <Segmented
                    label="Export sample rate"
                    value={settings.exportSampleRate}
                    options={SAMPLE_RATES.map((value) => ({
                      value,
                      label: `${formatNumber(value / 1000)} kHz`,
                    }))}
                    onChange={(exportSampleRate) => updateSettings({ exportSampleRate })}
                  />
                )}
              </Field>
              <Field
                label="Length with loops"
                hint={
                  hasLoop(scene)
                    ? 'A source is looping, so the Sound runs for this long.'
                    : 'Only used when a source is set to loop.'
                }
              >
                {(id) => (
                  <NumberInput
                    id={id}
                    value={settings.loopDuration}
                    min={1}
                    max={3600}
                    step={1}
                    unit="s"
                    onChange={(loopDuration) => updateSettings({ loopDuration })}
                  />
                )}
              </Field>
            </section>

            <section>
              <h3>Appearance</h3>
              <Field label="Theme">
                {() => (
                  <Segmented
                    label="Theme"
                    value={theme}
                    options={THEME_OPTIONS}
                    onChange={setTheme}
                  />
                )}
              </Field>
            </section>

            <section>
              <details className="tips">
                <summary>Headphone tips</summary>
                <ul>
                  <li>
                    Wear both earbuds. The effect is built from differences between your two ears.
                  </li>
                  <li>
                    On AirPods, turn off <em>Spatialize Stereo</em> and head tracking for exported
                    files, or they are spatialised twice.
                  </li>
                  <li>
                    Turn off any “surround”, “3D” or “Dolby” virtualiser in your OS or headset.
                  </li>
                  <li>
                    Sharp, full-range sounds (knocks, clicks, speech, footsteps) are much easier to
                    place than hums and bass.
                  </li>
                  <li>
                    Front and behind can be hard to tell apart. That is a limit of generic HRTFs,
                    not of your ears; a little reverb helps.
                  </li>
                  <li>Stereo speakers will not reproduce the effect.</li>
                </ul>
              </details>
            </section>
          </div>
        </div>
      )}
    </dialog>
  );
}
