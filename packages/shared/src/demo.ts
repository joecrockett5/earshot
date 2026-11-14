import type { Source } from './schema';

export interface DemoClip {
  /** File name under `/demo/` in the web app. */
  file: string;
  placement: Pick<Source, 'label' | 'angle' | 'distance' | 'startOffset' | 'gain' | 'loop'>;
}

export const DEMO_SOUND_NAME = 'Demo — someone at the door';

/**
 * The built-in demo scene: a quiet room, footsteps approaching on the left,
 * a chime off to the right, and a knock directly behind the listener.
 */
export const DEMO_CLIPS: readonly DemoClip[] = [
  {
    file: 'hum.wav',
    placement: { label: 'Hum', angle: 315, distance: 6, startOffset: 0, gain: 0.7, loop: false },
  },
  {
    file: 'footsteps.wav',
    placement: {
      label: 'Footsteps',
      angle: 250,
      distance: 3.5,
      startOffset: 0.5,
      gain: 1,
      loop: false,
    },
  },
  {
    file: 'chime.wav',
    placement: {
      label: 'Chime',
      angle: 60,
      distance: 4.5,
      startOffset: 2.5,
      gain: 0.8,
      loop: false,
    },
  },
  {
    file: 'knock.wav',
    placement: { label: 'Knock', angle: 180, distance: 2.5, startOffset: 5, gain: 1, loop: false },
  },
];
