// @ts-nocheck
import fs from 'fs';
import path from 'path';

const logsDir = path.join(new URL('.', import.meta.url).pathname, 'logs');
const logFile = path.join(logsDir, 'jaine.log');

fs.mkdirSync(logsDir, { recursive: true });

const stream = fs.createWriteStream(logFile, { flags: 'a' });

const formatArgs = args =>
  args.map(a => (typeof a === 'string' ? a : String(a))).join(' ');

const timestamp = () => new Date().toISOString();

const originalLog = globalThis.console.log.bind(globalThis.console);
const originalError = globalThis.console.error.bind(globalThis.console);

let initialized = false;

/**
 * Create (or return) the singleton file-backed logger.
 * Assign to a local `const console` to shadow the global and
 * capture all existing console.log / console.error calls.
 *
 * @returns {{ log: (...args: unknown[]) => void, error: (...args: unknown[]) => void }}
 */
export const createLogger = () => {
  if (!initialized) {
    initialized = true;
    stream.write(
      `\n${'='.repeat(60)}\n` +
        `${timestamp()} Jaine session started\n` +
        `${'='.repeat(60)}\n`,
    );
  }

  return harden({
    log(...args) {
      const msg = formatArgs(args);
      stream.write(`${timestamp()} ${msg}\n`);
      originalLog(...args);
    },
    error(...args) {
      const msg = formatArgs(args);
      stream.write(`${timestamp()} [ERROR] ${msg}\n`);
      originalError(...args);
    },
  });
};
harden(createLogger);
