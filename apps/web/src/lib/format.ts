/** `m:ss.t` — minutes, seconds and tenths, e.g. 75.25 → "1:15.2". */
export function formatTime(seconds: number): string {
  const tenths = Math.max(0, Math.floor(seconds * 10 + 1e-6));
  const minutes = Math.floor(tenths / 600);
  const rest = tenths - minutes * 600;
  const whole = Math.floor(rest / 10);
  return `${minutes}:${String(whole).padStart(2, '0')}.${rest % 10}`;
}

/** Up to `digits` decimals with trailing zeros removed, e.g. 2.50 → "2.5". */
export function formatNumber(value: number, digits = 1): string {
  return String(Number(value.toFixed(digits)));
}

export function formatDistance(metres: number): string {
  return `${formatNumber(metres, metres < 10 ? 1 : 0)} m`;
}

export function formatAngle(degrees: number): string {
  return `${Math.round(degrees) % 360}°`;
}

export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, 1e-4));
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

export function formatDb(db: number): string {
  const rounded = Math.round(db * 10) / 10;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return `${sign}${Math.abs(rounded).toFixed(1)} dB`;
}

/** A source label from an uploaded file's name: no extension, tidy, bounded. */
export function labelFromFilename(name: string): string {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ');
  const tidy = base.replace(/\s+/g, ' ').trim().slice(0, 40).trim();
  return tidy || 'Clip';
}

/** A safe download file name from a Sound's name. */
export function fileSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .slice(0, 60);
  return slug || 'earshot';
}
