import { describe, expect, it } from 'vitest';
import {
  MIN_DISTANCE,
  audioToPolar,
  clampDistance,
  describeDirection,
  normalizeAngle,
  polarToAudio,
  polarToRadar,
  radarToPolar,
  snapAngle,
} from './coords';

describe('normalizeAngle', () => {
  it('wraps into [0, 360)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(725)).toBe(5);
    expect(Object.is(normalizeAngle(-0), 0)).toBe(true);
    expect(normalizeAngle(-1e-14)).toBeLessThan(360);
  });
});

describe('snapAngle', () => {
  it('snaps to the nearest step', () => {
    expect(snapAngle(22, 15)).toBe(15);
    expect(snapAngle(23, 15)).toBe(30);
    expect(snapAngle(355, 15)).toBe(0);
    expect(snapAngle(-10, 15)).toBe(345);
  });

  it('leaves the angle alone for a non-positive step', () => {
    expect(snapAngle(22, 0)).toBe(22);
  });
});

describe('polar → radar', () => {
  const max = 10;
  it.each([
    ['front', 0, { x: 0, y: -1 }],
    ['right', 90, { x: 1, y: 0 }],
    ['behind', 180, { x: 0, y: 1 }],
    ['left', 270, { x: -1, y: 0 }],
  ])('puts %s on the correct edge of the radar', (_name, angle, expected) => {
    const point = polarToRadar({ angle, distance: max }, max);
    expect(point.x).toBeCloseTo(expected.x, 10);
    expect(point.y).toBeCloseTo(expected.y, 10);
  });

  it('scales distance against the outer ring and clamps beyond it', () => {
    expect(polarToRadar({ angle: 90, distance: 5 }, 10).x).toBeCloseTo(0.5, 10);
    expect(polarToRadar({ angle: 90, distance: 50 }, 10).x).toBeCloseTo(1, 10);
  });
});

describe('polar → Web Audio', () => {
  it.each([
    ['front', 0, { x: 0, z: -2 }],
    ['right', 90, { x: 2, z: 0 }],
    ['behind', 180, { x: 0, z: 2 }],
    ['left', 270, { x: -2, z: 0 }],
  ])('maps %s to the listener-relative axis', (_name, angle, expected) => {
    const position = polarToAudio({ angle, distance: 2 });
    expect(position.x).toBeCloseTo(expected.x, 10);
    expect(position.y).toBe(0);
    expect(position.z).toBeCloseTo(expected.z, 10);
  });

  it('agrees with the radar: radar-up is −Z and radar-right is +X', () => {
    const up = polarToAudio(radarToPolar({ x: 0, y: -1 }, 10));
    expect(up.z).toBeCloseTo(-10, 10);
    expect(up.x).toBeCloseTo(0, 10);
    const right = polarToAudio(radarToPolar({ x: 1, y: 0 }, 10));
    expect(right.x).toBeCloseTo(10, 10);
    expect(right.z).toBeCloseTo(0, 10);
  });
});

describe('round trips', () => {
  const angles = [0, 1, 15, 45, 89.5, 90, 135, 180, 200.25, 270, 314, 359.9];
  const distances = [0.25, 1, 3.3, 7.5, 10];

  it('radar ↔ polar preserves angle and distance', () => {
    for (const angle of angles) {
      for (const distance of distances) {
        const back = radarToPolar(polarToRadar({ angle, distance }, 10), 10);
        expect(back.angle).toBeCloseTo(angle, 8);
        expect(back.distance).toBeCloseTo(distance, 8);
      }
    }
  });

  it('Web Audio ↔ polar preserves angle and distance', () => {
    for (const angle of angles) {
      for (const distance of distances) {
        const back = audioToPolar(polarToAudio({ angle, distance }));
        expect(back.angle).toBeCloseTo(angle, 8);
        expect(back.distance).toBeCloseTo(distance, 8);
      }
    }
  });

  it('treats the exact centre as front at zero distance', () => {
    expect(radarToPolar({ x: 0, y: 0 }, 10)).toEqual({ angle: 0, distance: 0 });
    expect(audioToPolar({ x: 0, y: 0, z: 0 })).toEqual({ angle: 0, distance: 0 });
  });

  it('pulls points outside the radar back onto the outer ring', () => {
    const polar = radarToPolar({ x: 3, y: 0 }, 10);
    expect(polar.angle).toBeCloseTo(90, 10);
    expect(polar.distance).toBe(10);
  });
});

describe('helpers', () => {
  it('clampDistance keeps sources out of the head and inside the ring', () => {
    expect(clampDistance(0, 10)).toBe(MIN_DISTANCE);
    expect(clampDistance(4, 10)).toBe(4);
    expect(clampDistance(40, 10)).toBe(10);
  });

  it('describeDirection names the nearest of eight directions', () => {
    expect(describeDirection(0)).toBe('front');
    expect(describeDirection(350)).toBe('front');
    expect(describeDirection(92)).toBe('right');
    expect(describeDirection(180)).toBe('behind');
    expect(describeDirection(225)).toBe('behind left');
    expect(describeDirection(270)).toBe('left');
  });
});
