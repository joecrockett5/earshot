import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies the documented defaults', () => {
    const config = loadConfig({});
    expect(config.port).toBe(8080);
    expect(config.dataDir).toBe(path.resolve('/data'));
    expect(config.maxUploadBytes).toBe(50 * 1024 * 1024);
    expect(config.logLevel).toBe('info');
  });

  it('reads overrides from the environment', () => {
    const config = loadConfig({
      PORT: '9000',
      DATA_DIR: '/srv/earshot',
      MAX_UPLOAD_MB: '2.5',
      LOG_LEVEL: 'DEBUG',
      WEB_DIR: '/srv/web',
    });
    expect(config).toMatchObject({
      port: 9000,
      dataDir: path.resolve('/srv/earshot'),
      maxUploadBytes: 2.5 * 1024 * 1024,
      logLevel: 'debug',
      webDir: path.resolve('/srv/web'),
    });
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['PORT', '80.5'],
    ['MAX_UPLOAD_MB', '-1'],
    ['MAX_UPLOAD_MB', '0'],
    ['LOG_LEVEL', 'loud'],
  ])('rejects %s=%s', (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(name);
  });
});
