/* global process, setTimeout, clearTimeout, setInterval, clearInterval, Buffer */
/* eslint-disable no-await-in-loop */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { makePromiseKit } from '@endo/promise-kit';
import { makeEndoClient } from '@endo/daemon';
import { whereEndoState, whereEndoSock } from '@endo/where';
import { E } from '@endo/far';
import { withInterrupt } from '../context.js';

const delay = async (ms, cancelled) => {
  // Do not attempt to set up a timer if already cancelled.
  await Promise.race([cancelled, undefined]);
  return new Promise((resolve, reject) => {
    const handle = setTimeout(resolve, ms);
    cancelled.catch(error => {
      reject(error);
      clearTimeout(handle);
    });
  });
};

/**
 * Find all log files in the state directory.
 * Matches *.log at top level and worker/*/worker.log
 *
 * @param {string} statePath
 * @returns {Promise<string[]>}
 */
const findLogFiles = async statePath => {
  const logFiles = [];

  // Find *.log at top level
  try {
    const entries = await fs.promises.readdir(statePath, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.log')) {
        logFiles.push(path.join(statePath, entry.name));
      }
    }
  } catch {
    // State directory may not exist yet
  }

  // Find worker/*/worker.log
  const workerDir = path.join(statePath, 'worker');
  try {
    const workerEntries = await fs.promises.readdir(workerDir, {
      withFileTypes: true,
    });
    for (const entry of workerEntries) {
      if (entry.isDirectory()) {
        const workerLogPath = path.join(workerDir, entry.name, 'worker.log');
        try {
          await fs.promises.access(workerLogPath, fs.constants.R_OK);
          logFiles.push(workerLogPath);
        } catch {
          // Worker log doesn't exist
        }
      }
    }
  } catch {
    // Worker directory may not exist
  }

  return logFiles;
};

/**
 * Get a short display name for a log file.
 *
 * @param {string} logPath
 * @param {string} statePath
 * @returns {string}
 */
const getLogDisplayName = (logPath, statePath) => {
  const relative = path.relative(statePath, logPath);
  // For worker logs, show abbreviated hash
  const workerMatch = relative.match(/^worker\/([a-f0-9]+)\/worker\.log$/);
  if (workerMatch) {
    return `worker/${workerMatch[1].slice(0, 8)}`;
  }
  return relative;
};

/**
 * Follow all log files concurrently, printing new lines with headers.
 *
 * @param {object} options
 * @param {string} options.statePath
 * @param {Promise<Error>} options.cancelled
 * @param {number} options.pollIntervalMs
 */
const followAllLogs = async ({ statePath, cancelled, pollIntervalMs }) => {
  /** @type {Map<string, number>} */
  const filePositions = new Map();
  /** @type {Map<string, fs.StatWatcher>} */
  const watchers = new Map();
  /** @type {string | null} */
  let lastLogSource = null;
  let running = true;

  cancelled.catch(() => {
    running = false;
  });

  /**
   * Read and print new content from a log file.
   *
   * @param {string} logPath
   */
  const readNewContent = async logPath => {
    try {
      const stats = await fs.promises.stat(logPath);
      const currentPos = filePositions.get(logPath) || 0;

      if (stats.size > currentPos) {
        const fd = await fs.promises.open(logPath, 'r');
        try {
          const buffer = Buffer.alloc(stats.size - currentPos);
          await fd.read(buffer, 0, buffer.length, currentPos);
          const content = buffer.toString('utf8');

          if (content.length > 0) {
            const displayName = getLogDisplayName(logPath, statePath);

            // Print header if source changed
            if (lastLogSource !== logPath) {
              process.stdout.write(`\n==> ${displayName} <==\n`);
              lastLogSource = logPath;
            }

            process.stdout.write(content);
          }

          filePositions.set(logPath, stats.size);
        } finally {
          await fd.close();
        }
      }
    } catch {
      // File may have been removed or rotated
    }
  };

  /**
   * Start watching a log file.
   *
   * @param {string} logPath
   */
  const watchFile = logPath => {
    if (watchers.has(logPath)) {
      return;
    }

    // Initialize position at current file size to avoid dumping existing content
    fs.promises
      .stat(logPath)
      .then(stats => {
        if (!filePositions.has(logPath)) {
          filePositions.set(logPath, stats.size);
        }
      })
      .catch(() => {
        // File doesn't exist yet
        filePositions.set(logPath, 0);
      });

    const watcher = fs.watchFile(logPath, { interval: pollIntervalMs }, () => {
      if (running) {
        readNewContent(logPath);
      }
    });
    watchers.set(logPath, watcher);
  };

  /**
   * Scan for new log files and start watching them.
   */
  const scanAndWatch = async () => {
    const logFiles = await findLogFiles(statePath);
    for (const logPath of logFiles) {
      watchFile(logPath);
    }
  };

  // Initial scan
  await scanAndWatch();

  // Periodically scan for new log files (new workers)
  const scanInterval = setInterval(scanAndWatch, pollIntervalMs * 2);

  // Wait for cancellation
  try {
    await cancelled;
  } catch {
    // Expected cancellation
  } finally {
    clearInterval(scanInterval);
    for (const [logPath] of watchers) {
      fs.unwatchFile(logPath);
    }
    watchers.clear();
  }
};

/**
 * Print all log files once (non-follow mode).
 *
 * @param {string} statePath
 */
const printAllLogs = async statePath => {
  const logFiles = await findLogFiles(statePath);

  // Sort by modification time, oldest first
  const filesWithStats = await Promise.all(
    logFiles.map(async logPath => {
      try {
        const stats = await fs.promises.stat(logPath);
        return { logPath, mtime: stats.mtime };
      } catch {
        return null;
      }
    }),
  );

  const sortedFiles = filesWithStats
    .filter(Boolean)
    .sort((a, b) => a.mtime - b.mtime);

  for (const { logPath } of sortedFiles) {
    const displayName = getLogDisplayName(logPath, statePath);
    process.stdout.write(`\n==> ${displayName} <==\n`);

    try {
      const content = await fs.promises.readFile(logPath, 'utf8');
      process.stdout.write(content);
      if (!content.endsWith('\n')) {
        process.stdout.write('\n');
      }
    } catch {
      process.stdout.write('(unable to read)\n');
    }
  }
};

export const log = async ({ follow, ping, all }) =>
  withInterrupt(async ({ cancelled }) => {
    await null;
    const logCheckIntervalMs = ping !== undefined ? Number(ping) : 5_000;

    const { username, homedir } = os.userInfo();
    const temp = os.tmpdir();
    const info = {
      user: username,
      home: homedir,
      temp,
    };

    const statePath = whereEndoState(process.platform, process.env, info);
    const sockPath = whereEndoSock(process.platform, process.env, info);

    // Handle --all flag with pure JavaScript implementation
    if (all) {
      if (follow) {
        await followAllLogs({
          statePath,
          cancelled,
          pollIntervalMs: logCheckIntervalMs,
        });
      } else {
        await printAllLogs(statePath);
      }
      return;
    }

    // Original behavior for single log file
    const logPath = path.join(statePath, 'endo.log');

    do {
      // Scope cancellation and propagate.
      const { promise: followCancelled, reject: cancelFollower } =
        makePromiseKit();
      cancelled.catch(cancelFollower);

      (async () => {
        const client = await makeEndoClient(
          'log-follower-probe',
          sockPath,
          followCancelled,
        ).catch(error => {
          console.error(`Endo offline: ${error.message}`);
        });
        if (client === undefined) {
          return;
        }
        const { getBootstrap } = client;
        const bootstrap = await getBootstrap().catch(error => {
          console.error(`Endo offline: ${error.message}`);
        });
        if (bootstrap === undefined) {
          return;
        }
        for (;;) {
          await delay(logCheckIntervalMs, followCancelled);
          await E(bootstrap).ping();
        }
      })().catch(cancelFollower);

      await new Promise((resolve, reject) => {
        const args = follow ? ['-f'] : [];
        const child = spawn('tail', [...args, logPath], {
          stdio: ['inherit', 'inherit', 'inherit'],
        });
        child.on('error', reject);
        child.on('exit', resolve);
        followCancelled.catch(() => {
          child.kill();
        });
      });

      if (follow) {
        await delay(logCheckIntervalMs, cancelled);
      }
    } while (follow);
  });
