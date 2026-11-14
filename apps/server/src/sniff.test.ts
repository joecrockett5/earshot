import { describe, expect, it } from 'vitest';
import { isAcceptableContentType, sniffAudio } from './sniff';

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(
    values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])),
  );

describe('sniffAudio', () => {
  it.each([
    ['wav', bytes('RIFF', 0, 0, 0, 0, 'WAVE')],
    ['flac', bytes('fLaC', 0, 0, 0, 34)],
    ['ogg', bytes('OggS', 0, 2)],
    ['m4a', bytes(0, 0, 0, 0x20, 'ftypM4A ')],
    ['mp3', bytes('ID3', 4, 0, 0)],
    ['mp3', bytes(0xff, 0xfb, 0x90, 0x00)],
    ['aac', bytes(0xff, 0xf1, 0x50, 0x80)],
    ['webm', bytes(0x1a, 0x45, 0xdf, 0xa3)],
  ])('recognises %s', (ext, data) => {
    expect(sniffAudio(data)?.ext).toBe(ext);
  });

  it.each([
    ['empty input', bytes()],
    ['plain text', bytes('hello world!')],
    ['a RIFF file that is not WAVE', bytes('RIFF', 0, 0, 0, 0, 'AVI ')],
    ['PNG', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a)],
    ['HTML', bytes('<!doctype html>')],
    ['an invalid MPEG layer', bytes(0xff, 0xe1, 0, 0)],
  ])('rejects %s', (_name, data) => {
    expect(sniffAudio(data)).toBeNull();
  });
});

describe('isAcceptableContentType', () => {
  it('allows audio types and the generic types browsers fall back to', () => {
    for (const type of [
      'audio/wav',
      'audio/x-m4a',
      'AUDIO/MPEG',
      'audio/ogg; codecs=opus',
      'video/mp4',
      'application/ogg',
      'application/octet-stream',
      undefined,
      '',
    ]) {
      expect(isAcceptableContentType(type)).toBe(true);
    }
  });

  it('rejects everything else', () => {
    for (const type of ['text/html', 'image/png', 'application/json', 'video/quicktime']) {
      expect(isAcceptableContentType(type)).toBe(false);
    }
  });
});
