// @ts-check
/* global process */

/**
 * Structured logger that writes to both stderr and a log file.
 *
 * @module
 */

import fs from 'fs';
import path from 'path';

/**
 * @typedef {object} Logger
 * @property {(...args: unknown[]) => void} log
 * @property {(...args: unknown[]) => void} error
 * @property {(...args: unknown[]) => void} warn
 */

/**
 * Format a log line with ISO timestamp and level.
 *
 * @param {string} level
 * @param {unknown[]} args
 * @returns {string}
 */
const formatLine = (level, args) => {
  const timestamp = new Date().toISOString();
  const message = args
    .map(a => (typeof a === 'string' ? a : String(a)))
    .join(' ');
  return `[${timestamp}] [${level}] ${message}\n`;
};

/**
 * Create a logger that writes timestamped lines to both stderr and a
 * log file.
 *
 * @param {string} logPath - Absolute path to the log file.
 * @returns {Logger}
 */
const makeLogger = logPath => {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const fd = fs.openSync(logPath, 'a');

  /** @type {(level: string, args: unknown[]) => void} */
  const write = (level, args) => {
    const line = formatLine(level, args);
    process.stderr.write(line);
    fs.writeSync(fd, line);
  };

  const logger = {
    log: /** @param {unknown[]} args */ (...args) => write('info', args),
    error: /** @param {unknown[]} args */ (...args) => write('error', args),
    warn: /** @param {unknown[]} args */ (...args) => write('warn', args),
  };

  return logger;
};

export { makeLogger };
