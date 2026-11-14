/**
 * Coordinate systems used by Earshot.
 *
 * Polar (stored in scenes):
 *   angle    — degrees, clockwise from straight ahead. 0 = front, 90 = right,
 *              180 = behind, 270 = left. Always normalised to [0, 360).
 *   distance — metres from the listener.
 *
 * Radar (the on-screen circle, unit radius):
 *   +x is right, +y is DOWN (screen convention), so "front" is (0, -1).
 *   The outer ring (radius 1) corresponds to the scene's maximum distance.
 *
 * Web Audio (right-handed, the default AudioListener):
 *   The listener sits at the origin facing −Z with +Y up, so
 *   front = −Z, right = +X, behind = +Z, left = −X.
 */

export interface Polar {
  angle: number;
  distance: number;
}

export interface Point2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Sources closer than this collapse into the head, where HRTFs are undefined. */
export const MIN_DISTANCE = 0.25;

const DEG = Math.PI / 180;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Normalise any angle in degrees to [0, 360). */
export function normalizeAngle(degrees: number): number {
  const wrapped = degrees % 360;
  const positive = wrapped < 0 ? wrapped + 360 : wrapped;
  // Guard against -0 and floating point results that round up to 360.
  return positive >= 360 || positive === 0 ? 0 : positive;
}

/** Snap an angle to the nearest multiple of `step` degrees. */
export function snapAngle(degrees: number, step: number): number {
  if (!(step > 0)) return normalizeAngle(degrees);
  return normalizeAngle(Math.round(degrees / step) * step);
}

export function clampDistance(distance: number, maxDistance: number): number {
  return clamp(distance, MIN_DISTANCE, Math.max(MIN_DISTANCE, maxDistance));
}

/** Polar position → point on the unit radar (y down). */
export function polarToRadar(polar: Polar, maxDistance: number): Point2 {
  const r = clamp(polar.distance / maxDistance, 0, 1);
  const a = polar.angle * DEG;
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
}

/** Point on the unit radar (y down) → polar position. Points outside the ring are pulled in. */
export function radarToPolar(point: Point2, maxDistance: number): Polar {
  const r = Math.min(1, Math.hypot(point.x, point.y));
  const angle = r === 0 ? 0 : normalizeAngle(Math.atan2(point.x, -point.y) / DEG);
  return { angle, distance: r * maxDistance };
}

/** Polar position → Web Audio panner position (listener at origin facing −Z). */
export function polarToAudio(polar: Polar): Vec3 {
  const a = polar.angle * DEG;
  return {
    x: polar.distance * Math.sin(a),
    y: 0,
    z: -polar.distance * Math.cos(a),
  };
}

/** Web Audio position → polar position (height is ignored). */
export function audioToPolar(position: Vec3): Polar {
  const distance = Math.hypot(position.x, position.z);
  const angle = distance === 0 ? 0 : normalizeAngle(Math.atan2(position.x, -position.z) / DEG);
  return { angle, distance };
}

const DIRECTIONS = [
  'front',
  'front right',
  'right',
  'behind right',
  'behind',
  'behind left',
  'left',
  'front left',
] as const;

export type Direction = (typeof DIRECTIONS)[number];

/** Plain-English name of the nearest of eight directions, for labels and ARIA. */
export function describeDirection(angle: number): Direction {
  const index = Math.round(normalizeAngle(angle) / 45) % DIRECTIONS.length;
  return DIRECTIONS[index] ?? 'front';
}
