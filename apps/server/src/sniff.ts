export interface AudioFormat {
  /** Extension used for the stored file. Never derived from the upload's filename. */
  ext: string;
  mime: string;
}

export const AUDIO_FORMATS = {
  wav: { ext: 'wav', mime: 'audio/wav' },
  mp3: { ext: 'mp3', mime: 'audio/mpeg' },
  ogg: { ext: 'ogg', mime: 'audio/ogg' },
  flac: { ext: 'flac', mime: 'audio/flac' },
  m4a: { ext: 'm4a', mime: 'audio/mp4' },
  aac: { ext: 'aac', mime: 'audio/aac' },
  webm: { ext: 'webm', mime: 'audio/webm' },
} as const satisfies Record<string, AudioFormat>;

/** How many leading bytes `sniffAudio` needs to see. */
export const SNIFF_BYTES = 12;

function ascii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Identify an audio container from its first bytes. Returns null for anything
 * that is not a format Earshot accepts, whatever its name or declared type.
 */
export function sniffAudio(bytes: Uint8Array): AudioFormat | null {
  if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WAVE')) return AUDIO_FORMATS.wav;
  if (ascii(bytes, 0, 'fLaC')) return AUDIO_FORMATS.flac;
  if (ascii(bytes, 0, 'OggS')) return AUDIO_FORMATS.ogg;
  if (ascii(bytes, 4, 'ftyp')) return AUDIO_FORMATS.m4a;
  if (ascii(bytes, 0, 'ID3')) return AUDIO_FORMATS.mp3;
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return AUDIO_FORMATS.webm;
  }
  const b0 = bytes[0];
  const b1 = bytes[1];
  if (b0 === 0xff && b1 !== undefined && (b1 & 0xe0) === 0xe0) {
    // MPEG audio frame sync. Layer bits 00 with a 12-bit sync is ADTS AAC.
    const layer = (b1 >> 1) & 0x03;
    if (layer === 0) return (b1 & 0xf0) === 0xf0 ? AUDIO_FORMATS.aac : null;
    return AUDIO_FORMATS.mp3;
  }
  return null;
}

/**
 * Whether a declared upload content type is plausible for audio. Browsers send
 * `application/octet-stream` (or nothing) for types the OS does not know, and
 * `video/mp4` for some .m4a files, so those pass here and are settled by the
 * magic-byte check.
 */
export function isAcceptableContentType(mime: string | undefined): boolean {
  if (!mime) return true;
  const type = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  return (
    type.startsWith('audio/') ||
    type === 'video/mp4' ||
    type === 'video/webm' ||
    type === 'application/ogg' ||
    type === 'application/octet-stream'
  );
}
