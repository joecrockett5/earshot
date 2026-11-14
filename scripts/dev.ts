/**
 * Development entry point: runs the API server (restarting on change) and the
 * Vite dev server side by side. Vite proxies `/api` to the server.
 *
 *   npm run dev
 */
import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const env = {
  ...process.env,
  PORT: process.env.PORT ?? '8080',
  DATA_DIR: process.env.DATA_DIR ?? path.join(root, 'data'),
};

const children: ChildProcess[] = [
  spawn('npx', ['tsx', 'watch', 'apps/server/src/index.ts'], { cwd: root, env, stdio: 'inherit' }),
  spawn('npx', ['vite', '--host'], { cwd: path.join(root, 'apps/web'), env, stdio: 'inherit' }),
];

let stopping = false;
function stop(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}

for (const child of children) child.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
