import { describe, expect, it } from 'vitest';
import {
  dbToGain,
  fileSlug,
  formatAngle,
  formatDb,
  formatDistance,
  formatNumber,
  formatTime,
  gainToDb,
  labelFromFilename,
} from './format';

describe('format helpers', () => {
  it('formatTime shows minutes, seconds and tenths', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(3.46)).toBe('0:03.4');
    expect(formatTime(75.25)).toBe('1:15.2');
    expect(formatTime(0.3)).toBe('0:00.3');
    expect(formatTime(-2)).toBe('0:00.0');
  });

  it('formatNumber trims trailing zeros', () => {
    expect(formatNumber(2.5)).toBe('2.5');
    expect(formatNumber(10)).toBe('10');
    expect(formatNumber(7.04)).toBe('7');
  });

  it('formats distances and angles', () => {
    expect(formatDistance(2.54)).toBe('2.5 m');
    expect(formatDistance(25.4)).toBe('25 m');
    expect(formatAngle(359.7)).toBe('0°');
    expect(formatAngle(89.6)).toBe('90°');
  });

  it('converts between gain and decibels', () => {
    expect(gainToDb(1)).toBeCloseTo(0);
    expect(gainToDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(dbToGain(6)).toBeCloseTo(1.995, 3);
    expect(dbToGain(gainToDb(0.3))).toBeCloseTo(0.3);
    expect(gainToDb(0)).toBe(-80);
  });

  it('formatDb uses a true minus sign and one decimal', () => {
    expect(formatDb(0)).toBe('0.0 dB');
    expect(formatDb(3)).toBe('+3.0 dB');
    expect(formatDb(-6.04)).toBe('−6.0 dB');
  });

  it('labelFromFilename drops the extension and tidies', () => {
    expect(labelFromFilename('door_knock.wav')).toBe('door knock');
    expect(labelFromFilename('  Rain   on roof.FLAC')).toBe('Rain on roof');
    expect(labelFromFilename('.mp3')).toBe('Clip');
    expect(labelFromFilename('x'.repeat(80)).length).toBe(40);
  });

  it('fileSlug makes a safe file name', () => {
    expect(fileSlug('Demo — someone at the door')).toBe('demo-someone-at-the-door');
    expect(fileSlug('../../etc/passwd')).toBe('etcpasswd');
    expect(fileSlug('***')).toBe('earshot');
  });
});
