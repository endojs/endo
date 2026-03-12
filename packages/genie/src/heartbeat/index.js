// @ts-check
import { EventEmitter } from 'events';
import { access, open, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

import { runAgentRound } from '../agent/index.js';
/** @import { Agent as PiAgent } from '@mariozechner/pi-agent-core' */

/**
 * @typedef {object} HeartbeatEvent
 * @property {number} ts - Timestamp in milliseconds
 * @property {string} status - Heartbeat status
 * @property {number} elapsed - Elapsed time in milliseconds
 * @property {string|null} preview - Preview of the response
 * @property {string|null} reason - Reason for skip/failure
 */

/**
 * @typedef {object} HeartbeatRunner
 * @property {number} interval - Heartbeat interval in milliseconds
 * @property {number} timeout - Maximum time per heartbeat run in milliseconds
 * @property {string} workspacePath - Path to workspace
 * @property {{start: string, end: string}|null} activeHours - Active hours range
 * @property {boolean} running - Whether the heartbeat is currently running
 * @property {(piAgent: PiAgent) => Promise<void>} start - Start the heartbeat loop
 * @property {() => void} stop - Stop the heartbeat loop
 * @property {() => boolean} inActiveHours - Check if currently in active hours
 * @property {EventEmitter} emitter - Event emitter for lifecycle events
 * @property {(response: string, status: string, elapsed: number) => HeartbeatEvent} _handleHeartbeatResponse - Handle heartbeat response
 * @property {(elapsed: number) => HeartbeatEvent} _handleTimeout - Handle timeout
 * @property {(piAgent: PiAgent, prompt: string) => Promise<[string, string]>} runOnceInternal - Internal heartbeat execution
 * @property {(piAgent: PiAgent) => Promise<HeartbeatEvent>} runOnce - Main heartbeat execution
 */

/**
 * Heartbeat status enum
 */
const HeartbeatStatus = harden({
  Ok: 'ok',
  Failed: 'failed',
  Skipped: 'skipped',
  SkippedMayTry: 'skipped_may_try',
  TimedOut: 'timed_out',
});

/**
 * HEARTBEAT_OK_TOKEN - Response that indicates heartbeat completed successfully
 */
const HEARTBEAT_OK_TOKEN = /** @type {const} */ ('HEARTBEAT_OK');
harden(HEARTBEAT_OK_TOKEN);

/**
 * Represents a single heartbeat event
 *
 * @param {number} ts
 * @param {string} status
 * @param {object} [options]
 * @param {number} [options.elapsed]
 * @param {string} [options.preview]
 * @param {string} [options.reason]
 * @returns {HeartbeatEvent}
 */
function makeHeartbeatEvent(ts, status, options = {}) {
  const { elapsed, preview, reason } = options;
  return harden({
    ts, // timestamp in milliseconds
    status,
    elapsed: elapsed || 0,
    preview: preview || null,
    reason: reason || null,
  });
}
harden(makeHeartbeatEvent);

/**
 * Helper function: Get last line from a file efficiently
 * Uses fs.promises API for better performance and error handling
 *
 * @param {string} filePath - Path to the file
 * @returns {Promise<string|null>} - Last line text or null if file doesn't exist or is empty
 */
async function getLastLine(filePath) {
  try {
    const fileHandle = await open(filePath, 'r');
    const fileStat = await fileHandle.stat();

    // If file is empty or too small, return null
    if (fileStat.size === 0) {
      await fileHandle.close();
      return null;
    }

    await fileHandle.close();

    // Read line by line to find the last line
    const file = createReadStream(filePath, {
      encoding: 'utf8',
      autoClose: true,
    });

    const rl = createInterface({
      input: file,
      crlfDelay: Infinity,
    });

    let lastLine = null;
    for await (const line of rl) {
      lastLine = line;
    }
    rl.close();

    return lastLine || null;
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Helper function: Check if file has non-whitespace content
 * Uses streaming to avoid loading entire file into memory
 *
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} - True if file contains non-whitespace content
 */
async function hasContent(filePath) {
  try {
    const file = createReadStream(filePath, { encoding: 'utf8' });

    const rl = createInterface({
      input: file,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (/\S/.test(line)) {
        rl.close();
        return true;
      }
    }
    rl.close();

    return false;
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

/**
 * Build a heartbeat prompt for the agent
 *
 * @param {boolean} workspaceIsGit
 * @returns {string}
 */
function buildHeartbeatPrompt(workspaceIsGit) {
  function* body() {
    // yield `**Autonomous Mode**`;
    yield `Read HEARTBEAT.md if it exists.`;
    yield `Follow it strictly, and work on any current pending tasks — ones marked with a \`[ ]\` .`;
    yield `Mark completed tasks with [x] — do NOT delete or clear tasks.`;
    yield `Do not infer or repeat old tasks from prior chats.`;
    yield `Provide any feedback by editing its heartbeat task, do not reply with questions or feedback, edit HEARTBEAT.md instead.`;
    if (workspaceIsGit) {
      yield 'After completing tasks that modify files, commit the changes with a descriptive message.';
    }
    yield `Reply with just "${HEARTBEAT_OK_TOKEN}" unless you encounter errors.`;
  }
  return Array.from(body()).join('\n');
}
harden(buildHeartbeatPrompt);

/**
 * Check if heartbeat response indicates success
 *
 * @param {string} response
 * @returns {boolean}
 */
function isHeartbeatOk(response) {
  const trimmed = response.trim().toLowerCase();
  return (
    trimmed == HEARTBEAT_OK_TOKEN ||
    trimmed.includes('ok') ||
    trimmed.includes('heartbeat complete') ||
    trimmed.includes('tasks completed')
  );
}
harden(isHeartbeatOk);

/**
 * Factory function that creates a HeartbeatRunner instance
 *
 * Creates a configurable heartbeat monitor that:
 * - Runs at configurable intervals
 * - Reads HEARTBEAT.md to identify tasks
 * - Emits heartbeat events for monitoring
 *
 * @param {object} config - Configuration object
 * @param {number} config.interval - Heartbeat interval in milliseconds (default: 30 minutes)
 * @param {number} config.timeout - Maximum time per heartbeat run in milliseconds (default: half of interval)
 * @param {string} config.workspacePath - Path to workspace (default: process.cwd())
 * @param {{start: string, end: string}} config.activeHours - Optional active hours range (e.g., {start: "09:00", end: "22:00"})
 * @param {number} config.overdueDelay - Delay when heartbeat is overdue in milliseconds (default: 0)
 * @returns {HeartbeatRunner} - Returns a HeartbeatRunner instance
 */
function makeHeartbeatRunner(config) {
  const configObj = config || {};
  const interval = configObj.interval || 30 * 60 * 1000; // default 30 minutes
  const timeout = configObj.timeout || interval / 2; // default half the interval
  const activeHours = configObj.activeHours || null;
  const overdueDelay = configObj.overdueDelay || 0;

  const workspacePath = configObj.workspacePath || process.cwd();

  let pendingHeartbeat = null;

  let timer = null;
  let running = false;

  // Create an event emitter for lifecycle events
  const emitter = new EventEmitter();

  /**
   * Get delay until first tick based on last heartbeat
   *
   * Reads last heartbeat event from disk to calibrate
   *
   * @returns {Promise<number>}
   */
  const computeFirstDelay = async () => {
    try {
      const heartBeatLogPath = `${workspacePath}/.heartbeats.log`;

      // Use efficient last-line reading
      const lastLine = await getLastLine(heartBeatLogPath);

      if (lastLine) {
        try {
          const lastHeartbeat = JSON.parse(lastLine);
          const expectedMaxHeartbeat = interval * 2; // Allow generous window

          const timeSinceLastHeartbeat = Date.now() - lastHeartbeat.ts;

          if (timeSinceLastHeartbeat < expectedMaxHeartbeat) {
            // Heartbeat is relatively recent, start sooner
            const delay = Math.max(0, expectedMaxHeartbeat - timeSinceLastHeartbeat);
            console.log('[Heartbeat] Last heartbeat was', timeSinceLastHeartbeat, 'ms ago');
            return delay;
          }
        } catch (err) {
          console.warn('[Heartbeat] Failed to parse last heartbeat event:', /** @type {Error} */ (err).message);
        }
      }
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') {
        console.warn('[Heartbeat] Failed to read heartbeat log:', /** @type {Error} */ (err).message);
        return interval;
      }
    }
    console.log('[Heartbeat] Heartbeat overdue, waiting', overdueDelay, 'ms');
    return overdueDelay;
  };

  /**
   * Start the heartbeat loop.
   *
   * @param {PiAgent} piAgent - An initialised PiAgent instance used for every tick.
   */
  const start = async (piAgent) => {
    if (running) {
      console.warn('[Heartbeat] Already running, skipping start');
      return;
    }

    running = true;
    console.log(`[Heartbeat] Starting with interval: ${interval}ms, timeout: ${timeout}ms`);

    // Get first delay (may be async)
    const initialDelay = await computeFirstDelay();
    console.log(`[Heartbeat] First tick scheduled after: ${initialDelay}ms`);

    // Set up timer
    timer = setInterval(() => runOnce(piAgent), interval);

    // Run first tick after delay
    setTimeout(() => runOnce(piAgent), initialDelay);
  };

  /**
   * Stop the heartbeat loop
   */
  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    running = false;
    console.log('[Heartbeat] Stopped');
  };

  /**
   * Check if we're in active hours
   *
   * @returns {boolean}
   */
  const inActiveHours = () => {
    if (!activeHours) {
      return true; // No active hours configured
    }

    const now = new Date();
    const [startHour, startMin] = activeHours.start.split(':').map(Number);
    const [endHour, endMin] = activeHours.end.split(':').map(Number);

    const rangeStart = new Date();
    rangeStart.setHours(startHour, startMin, 0, 0);

    const rangeEnd = new Date();
    rangeEnd.setHours(endHour, endMin, 0, 0);

    if (rangeStart <= rangeEnd) {
      // Normal range (e.g., 09:00 to 22:00)
      return now >= rangeStart && now <= rangeEnd;
    } else {
      // Overnight range (e.g., 22:00 to 06:00)
      return now >= rangeStart || now <= rangeEnd;
    }
  };

  /**
   * Internal heartbeat execution.
   *
   * Checks for a non-empty HEARTBEAT.md, then runs a single agent
   * round using the supplied prompt and collects the assistant's
   * final reply.
   *
   * @param {PiAgent} piAgent - An initialised PiAgent instance.
   * @param {string} prompt - The heartbeat prompt to send.
   * @returns {Promise<[string, string]>}
   */
  const runOnceInternal = async (piAgent, prompt) => {
    const heartbeatPath = `${workspacePath}/HEARTBEAT.md`;

    // Check if HEARTBEAT.md exists
    try {
      const fileStats = await stat(heartbeatPath);

      // First check if file is empty without reading content (efficient)
      if (fileStats.size === 0) {
        console.log('[Heartbeat] Skipping: empty HEARTBEAT.md');
        return [HEARTBEAT_OK_TOKEN, HeartbeatStatus.Skipped];
      }

      // Efficient check for content beyond whitespace using streaming
      const hasContentResult = await hasContent(heartbeatPath);

      if (!hasContentResult) {
        console.log('[Heartbeat] Skipping: whitespace-only HEARTBEAT.md');
        return [HEARTBEAT_OK_TOKEN, HeartbeatStatus.Skipped];
      }
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
        console.log('[Heartbeat] Skipping: no HEARTBEAT.md');
        return [HEARTBEAT_OK_TOKEN, HeartbeatStatus.Skipped];
      }
      throw err;
    }

    // Drive the agent round and collect the final assistant text.
    let assistantText = '';
    for await (const event of runAgentRound(piAgent, prompt)) {
      switch (event.type) {
        case 'Message': {
          if (event.role === 'assistant' && event.content) {
            assistantText = event.content;
          }
          break;
        }
        case 'Error': {
          console.error(`[Heartbeat] Agent error: ${event.type} ${event.message}`, event.cause);
          return [event.message, HeartbeatStatus.Failed];
        }
        default:
          break;
      }
    }

    return [assistantText || HEARTBEAT_OK_TOKEN, HeartbeatStatus.Ok];
  };

  /**
   * Handle heartbeat response
   *
   * @param {string} response
   * @param {string} status
   * @param {number} elapsed
   * @returns {HeartbeatEvent}
   */
  const handleHeartbeatResponse = (response, status, elapsed) => {
    const preview = response.length > 200
      ? response.substring(0, 200) + '...'
      : response;

    const isOk = isHeartbeatOk(response);
    if (isOk) {
      console.log('[Heartbeat] OK');
    } else {
      console.log('[Heartbeat] Response not OK:', response);
    }

    return makeHeartbeatEvent(Date.now(), status, {
      elapsed,
      preview,
    });
  };

  /**
   * Handle timeout
   *
   * @param {number} elapsed
   * @returns {HeartbeatEvent}
   */
  const handleTimeout = (elapsed) => {
    const timestamp = Date.now();
    console.warn(`[Heartbeat] Tick timed out after ${elapsed}ms (deadline: ${timeout}ms)`);
    console.log('[Heartbeat] Waiting for next tick');

    return makeHeartbeatEvent(timestamp, HeartbeatStatus.TimedOut, {
      elapsed,
      reason: `exceeded deadline of ${timeout}ms`,
    });
  };

  /**
   * Check whether a directory contains a `.git` folder.
   *
   * @param {string} dir
   * @returns {Promise<boolean>}
   */
  const isGitRepo = async (dir) => {
    try {
      await access(`${dir}/.git`);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Main heartbeat execution loop.
   *
   * Builds the heartbeat prompt, runs the agent with a timeout
   * guard, and emits the resulting heartbeat event.
   *
   * @param {PiAgent} piAgent - An initialised PiAgent instance.
   * @returns {Promise<HeartbeatEvent>}
   */
  const runOnce = async (piAgent) => {
    const tickStart = Date.now();
    console.log(`[Heartbeat] Tick starting at: ${new Date().toISOString()}`);

    // Check active hours
    if (!inActiveHours()) {
      const event = makeHeartbeatEvent(tickStart, HeartbeatStatus.Skipped, {
        reason: 'outside active hours',
      });
      emitter.emit('heartbeat', event);
      return event;
    }

    // Build the prompt for this tick.
    const workspaceIsGit = await isGitRepo(workspacePath);
    const heartbeatPrompt = buildHeartbeatPrompt(workspaceIsGit);

    // Run heartbeat with timeout
    const runStart = Date.now();
    const timedResult = await Promise.race([
      runOnceInternal(piAgent, heartbeatPrompt).then((res) => ({
        success: true,
        data: res,
      })),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeout),
      ),
    ]);
    const elapsed = Date.now() - runStart;

    if (timedResult.success) {
      const [response, status] = timedResult.data;
      return handleHeartbeatResponse(response, status, elapsed);
    } else {
      return handleTimeout(elapsed);
    }
  };

  return harden({
    // Configuration and state
    interval,
    timeout,
    workspacePath,
    activeHours,
    running,

    // Methods
    start,
    stop,
    inActiveHours,

    // Event emitter
    emitter,

    // Legacy helper methods
    _handleHeartbeatResponse: handleHeartbeatResponse,
    _handleTimeout: handleTimeout,
    runOnceInternal,
    runOnce,
  });
}
harden(makeHeartbeatRunner);

// ES6 Exports for module compatibility
export {
  makeHeartbeatRunner,
  HeartbeatStatus,
  makeHeartbeatEvent,
  buildHeartbeatPrompt,
  isHeartbeatOk,
  HEARTBEAT_OK_TOKEN,
  getLastLine,
  hasContent,
};
