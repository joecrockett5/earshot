import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  /** Directory holding the built frontend, or null to serve the API only. */
  webDir: string | null;
  maxUploadBytes: number;
  logLevel: string;
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

function positiveNumber(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return value;
}

/** Read configuration from environment variables, applying documented defaults. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = positiveNumber('PORT', env.PORT, 8080);
  if (!Number.isInteger(port) || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${env.PORT}"`);
  }
  const logLevel = (env.LOG_LEVEL ?? 'info').toLowerCase();
  if (!LOG_LEVELS.includes(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${env.LOG_LEVEL}"`);
  }
  // The entry script lives in apps/server/{src,dist}; the built frontend is a sibling app.
  const defaultWebDir = path.resolve(path.dirname(process.argv[1] ?? '.'), '../../web/dist');
  return {
    port,
    host: env.HOST ?? '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR ?? '/data'),
    webDir: path.resolve(env.WEB_DIR ?? defaultWebDir),
    maxUploadBytes: Math.round(
      positiveNumber('MAX_UPLOAD_MB', env.MAX_UPLOAD_MB, 50) * 1024 * 1024,
    ),
    logLevel,
  };
}
