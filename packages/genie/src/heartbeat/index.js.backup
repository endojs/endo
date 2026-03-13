/**
 * Heartbeat status enum
 */
const HeartbeatStatus = {
  Ok: 'ok',
  Failed: 'failed',
  Skipped: 'skipped',
  SkippedMayTry: 'skipped_may_try',
  TimedOut: 'timed_out',
};

/**
 * Represents a single heartbeat event
 *
 * @param {number} ts
 * @param {string} status
 * @param {object} [options]
 * @param {number} [options.elapsed]
 * @param {string} [options.preview]
 * @param {string} [options.reason] 
 */
function makeHeartbeatEvent(ts, status, options = {}) {
  const { elapsed, preview, reason } = options;
  return {
    ts, // timestamp in milliseconds
    status,
    elapsed: elapsed || 0,
    preview: preview || null,
    reason: reason || null
  };
}

/**
 * Turn gate for coordinating heartbeat and interactive agent turns
 * This will eventually evolve into a more general mutex
 *
 * @param {object} [options]
 * @param {number} [options.interval=1_000] - interval for busy detection
 */
function makeTurnGate(options = {}) {
  const {
    interval = 1_000,
  } = options;

  let pending = null;
  let resolved = false;
  let pendingReject = null;
  let timeoutId = null;

  const clear = (force = false) => {
    if (pendingReject) {
      if (force || !resolved) {
        try {
          pendingReject();
        } catch (e) {
          // Ignore errors during rejection
        }
      }
      pendingReject = null;
    }
    pending = null;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    resolved = false;
  };

  /**
   * Cancel the current turn permit
   */
  const cancel = () => clear(true);

  /**
   * Try to acquire a turn permit. Returns a permit object if successful, null
   * if another turn is in flight.
   */
  const tryAcquire = () => {
    // Allow new turn after previous one completes
    if (resolved) {
      clear();
    }

    // Another turn is in flight, return null
    if (pending) {
      return null;
    }

    // Start tracking this turn
    pending = new Promise((_, reject) => {
      pendingReject = reject;
      timeoutId = setTimeout(clear, interval);
    });

    return cancel;
  };

  return {
    tryAcquire,
    cancel,

    /**
     * Mark turn as complete
     */
    complete() {
      resolved = true;
      cancel();
    },

    /**
     * Check if a turn is currently in progress
     */
    isBusy() {
      return !!pending && !resolved;
    },
  };
}

/**
 * In-memory workspace lock for coordinating across processes
 *
 * @param {object} [options]
 * @param {number} [options.interval] - interval for checking lock status
 */
function makeWorkspaceLock(options = {}) {
  const {
    interval = 5_000,
  } = options;

  let locked = false;
  let checkIntervalId = null;

  /**
   * Try to acquire the workspace lock (non-blocking)
   * Returns the guard if successful, null if already locked
   */
  const tryAcquire = () => {
    if (!locked) {
      locked = true;
      return release;
    }
    return null;
  };

  const release = () => {
    if (locked) {
      locked = false;
      if (checkIntervalId) {
        clearInterval(checkIntervalId);
        checkIntervalId = null;
      }
    }
  };

  // Start periodic check interval if not already started
  if (!checkIntervalId) {
    checkIntervalId = setInterval(() => {
      // Keep the object alive as long as lock is active
    }, interval);
  }

  return {
    tryAcquire,
    release,
    isLocked() { return locked },
  };
}

/**
 * Build a heartbeat prompt for the agent
 *
 * @param {boolean} workspaceIsGit
 */
function buildHeartbeatPrompt(workspaceIsGit) {
  const prompt = `You are a background agent that monitors the workspace and executes tasks from HEARTBEAT.md.

${workspaceIsGit ? '' : 'NOTE: This workspace is NOT a git repository.\n'}

Your goals:
1. Read and understand the current state of HEARTBEAT.md
2. Identify tasks that need to be completed
3. Execute those tasks or mark them as done
4. Provide status updates

When you complete tasks, be specific about what was done. When you cannot complete a task, explain why.

Your response format:
- Start with a brief status summary
- List completed tasks with checkmarks [x]
- List remaining tasks with brackets [ ]
- Include details for complex actions

You have access to tools for:
- Reading and writing files
- Running commands
- Git operations (if in a git repository)
- Searching for patterns in the codebase

Proceed with your work.`;

  return prompt;
}

/**
 * Check if heartbeat response indicates success
 *
 * @param {string} response
 */
function isHeartbeatOk(response) {
  const trimmed = response.trim().toLowerCase();
  return (
    trimmed.includes('ok') ||
    trimmed.includes('heartbeat complete') ||
    trimmed.includes('tasks completed')
  );
}

import {
  stat,
  readFile,
} from 'fs/promises';

import {
  createReadStream, // TODO is there a newer Stream api that we can use from fs/promises instead?
} from 'fs';

// We use EventEmitter to provide an extension point for external observers
// interested in heartbeat lifecycle events. Removal would isolate this class
// and prevent external monitoring/debugging hooks.
const EventEmitter = require('events');

/**
 * HeartbeatRunner - Core timer loop for running background agent rounds
 *
 * TODO refactor to `makeHeartbeatRunner` ; do not use `class`
 */
class HeartbeatRunner extends EventEmitter {
  /**
   * Create a new HeartbeatRunner
   * @param {Object} config - Configuration object
   * @param {number} config.interval - Heartbeat interval in milliseconds
   * @param {number} config.timeout - Maximum time per heartbeat run in milliseconds
   * @param {string} config.workspacePath - Path to workspace
   * @param {{start: string, end: string}} config.activeHours - Optional active hours range
   * @param {number} config.overdueDelay - Delay when heartbeat is overdue in milliseconds
   */
  constructor(config) {
    super();
    this.config = config;
    this.interval = config.interval || 30 * 60 * 1000; // default 30 minutes
    this.timeout = config.timeout || this.interval / 2; // default half the interval
    this.activeHours = config.activeHours || null;
    this.overdueDelay = config.overdueDelay || 0;

    this.workspacePath = config.workspacePath || process.cwd();
    this.turnGate = makeTurnGate();
    this.workspaceLock = makeWorkspaceLock();
    this.pendingHeartbeat = null;
    this.skipCount = 0;
    this.skipRetryBase = 1000; // 1 second base retry
    this.skipRetryMax = this.interval / 2; // max half the interval

    this.timer = null;
    this.running = false;
  }

  /**
   * Start the heartbeat loop
   */
  async start() {
    if (this.running) {
      console.warn('[Heartbeat] Already running, skipping start');
      return;
    }

    this.running = true;
    console.log(`[Heartbeat] Starting with interval: ${this.interval}ms, timeout: ${this.timeout}ms`);

    // Get first delay (may be async)
    const firstDelay = await this.firstDelay();
    console.log(`[Heartbeat] First tick scheduled after: ${firstDelay}ms`);

    // Set up timer
    this.timer = setInterval(() => this.runOnce(), this.interval);

    // Run first tick after delay
    setTimeout(() => this.runOnce(), firstDelay);
  }

  /**
   * Stop the heartbeat loop
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log('[Heartbeat] Stopped');
  }

  /**
   * Get delay until first tick based on last heartbeat
   *
   * Reads last heartbeat event from disk to calibrate
   */
  async firstDelay() {
    try {
      // Try to read last heartbeat event from disk
      const heartBeatLogPath = `${this.workspacePath}/.heartbeats.log`;

      // Read last line from heartbeat log
      // TODO scan read file stream mode to get last line, rather than read fully into memory just to spli
      const content = await readFile(heartBeatLogPath, 'utf-8');
      const lines = content.trim().split('\n');
      const lastLine = lines[lines.length - 1];

      if (lastLine) {
        try {
          const lastHeartbeat = JSON.parse(lastLine);
          const intervalMs = this.interval;
          const lastTs = lastHeartbeat.ts;
          const now = Date.now();

          const timeSinceLastHeartbeat = now - lastTs;
          const expectedMaxHeartbeat = intervalMs * 2; // Allow generous window

          if (timeSinceLastHeartbeat < expectedMaxHeartbeat) {
            // Heartbeat is relatively recent, start sooner
            const delay = Math.max(0, expectedMaxHeartbeat - timeSinceLastHeartbeat);
            console.log('[Heartbeat] Last heartbeat was', timeSinceLastHeartbeat, 'ms ago');
            return delay;
          }
        } catch (err) {
          console.warn('[Heartbeat] Failed to parse last heartbeat event:', err.message);
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[Heartbeat] Failed to read heartbeat log:', err.message);
        return this.interval;
      }
    }
    console.log('[Heartbeat] Heartbeat overdue, waiting', this.overdueDelay, 'ms');
    return this.overdueDelay;
  }

  /**
   * Check if we're in active hours
   */
  inActiveHours() {
    if (!this.activeHours) {
      return true; // No active hours configured
    }

    const now = new Date();
    const [startHour, startMin] = this.activeHours.start.split(':').map(Number);
    const [endHour, endMin] = this.activeHours.end.split(':').map(Number);

    const start = new Date();
    start.setHours(startHour, startMin, 0, 0);

    const end = new Date();
    end.setHours(endHour, endMin, 0, 0);

    if (start <= end) {
      // Normal range (e.g., 09:00 to 22:00)
      return now >= start && now <= end;
    } else {
      // Overnight range (e.g., 22:00 to 06:00)
      return now >= start || now <= end;
    }
  }

  /**
   * Run a single heartbeat cycle
   *
   * This method now returns event objects instead of emitting them,
   * making it more testable and consistent with an API-first approach.
   * The emit calls are commented out or can be enabled for backward compatibility.
   */
  async runOnce() {
    const tickStart = Date.now();
    console.log(`[Heartbeat] Tick starting at: ${new Date().toISOString()}`);

    // Check active hours
    if (!this.inActiveHours()) {
      const event = makeHeartbeatEvent(tickStart, HeartbeatStatus.Skipped, {
        reason: 'outside active hours',
      });
      this.emit('heartbeat', event);
      return event;
    }

    // Check turn gate
    if (this.turnGate.isBusy()) {
      const event = makeHeartbeatEvent(tickStart, HeartbeatStatus.SkippedMayTry, {
        reason: 'agent turn in flight',
      });
      this.emit('heartbeat', event);
      this.skipCount++;
      this.adjustRetryDelay();
      return event;
    }

    // Check workspace lock
    const releaseWorkspace = this.workspaceLock.tryAcquire();
    if (!releaseWorkspace) {
      const event = makeHeartbeatEvent(tickStart, HeartbeatStatus.SkippedMayTry, {
        reason: 'workspace locked',
      });
      this.emit('heartbeat', event);
      this.skipCount++;
      this.adjustRetryDelay();
      return event;
    }

    try {
      // Try to acquire turn gate using our helper method
      const releaseTurnGate = this.tryAcquireTurnGate();
      if (!releaseTurnGate) {
        return null;
      }

      try {
        // Run heartbeat with timeout
        const start = Date.now();
        const timedResult = await Promise.race([
          this.runOnceInternal().then((res) => ({ success: true, data: res })),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), this.timeout)
          ),
        ]);
        const elapsed = Date.now() - start;

        // Refactored method now returns event object directly
        if (timedResult.success) {
          return this.handleHeartbeatResponse(timedResult.data.response, timedResult.data.status, elapsed);
        } else {
          return this.handleTimeout(elapsed);
        }

      } finally {
        releaseTurnGate();
      }
    } finally {
      releaseWorkspace();
    }
  }

  /**
   * Get turn gate permit using tryAcquire
   */
  tryAcquireTurnGate() {
    const releaseTurnGate = this.turnGate.tryAcquire();
    if (!releaseTurnGate) {
      console.log('[Heartbeat] Skipping: unable to acquire turn gate (another agent turn in flight)');
      this.emit('heartbeat', makeHeartbeatEvent(Date.now(), HeartbeatStatus.SkippedMayTry, {
        reason: 'agent turn in flight',
      }));
      this.skipCount++;
      this.adjustRetryDelay();
      return null;
    }
    return () => {
      releaseTurnGate();
    };
  }

  /**
   * Adjust retry delay for transient skips
   */
  adjustRetryDelay() {
    if (this.skipCount > 0) {
      const retryDelay = Math.min(
        this.skipRetryBase * Math.pow(2, this.skipCount),
        this.skipRetryMax
      );
      if (this.timer) {
        // Clear and reschedule with new delay
        clearInterval(this.timer);
        this.timer = setInterval(() => this.runOnce(), retryDelay);
      }
      console.log(`[Heartbeat] Transient skip, retry quickly after: ${retryDelay}ms`);
      this.skipCount = 0;
    }
  }

  /**
   * Handle heartbeat response - returns event object
   *
   * @param {string} response
   * @param {string} status
   * @param {number} elapsed
   * @returns {object} - Event object instead of emitting
   */
  _handleHeartbeatResponse(response, status, elapsed) {
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
  }

  /**
   * Handle timeout - returns event object
   *
   * @param {number} elapsed
   * @returns {object} - Event object instead of emitting
   */
  _handleTimeout(elapsed) {
    const timestamp = Date.now();
    console.warn(`[Heartbeat] Tick timed out after ${elapsed}ms (deadline: ${this.timeout}ms)`);
    this.skipCount = 0;
    console.log('[Heartbeat] Waiting for next tick');

    return makeHeartbeatEvent(timestamp, HeartbeatStatus.TimedOut, {
      elapsed,
      reason: `exceeded deadline of ${this.timeout}ms`,
    });
  }

  /**
   * Handle heartbeat response (legacy method that emits)
   *
   * @param {string} response
   * @param {string} status
   * @param {number} elapsed
   */
  handleHeartbeatResponse(response, status, elapsed) {
    this.emit('heartbeat', this._handleHeartbeatResponse(response, status, elapsed));
  }

  /**
   * Handle timeout (legacy method that emits)
   *
   * @param {number} elapsed
   */
  handleTimeout(elapsed) {
    this.emit('heartbeat', this._handleTimeout(elapsed));
  }

  /**
   * Internal heartbeat execution
   * This is where we would call the agent if we had the session API
   */
  async runOnceInternal() {
    const heartbeatPath = `${this.workspacePath}/HEARTBEAT.md`;

    // Check if HEARTBEAT.md exists using fs.promises.stat
    try {
      const fileStats = await stat(heartbeatPath);

      // First check if file is empty without reading content (efficient)
      if (fileStats.size === 0) {
        console.log('[Heartbeat] Skipping: empty HEARTBEAT.md');
        return [HEARTBEAT_OK_TOKEN, HeartbeatStatus.Skipped];
      }

      // Efficient check for content beyond whitespace
      // Read in small chunks until we find non-whitespace content
      let hasContent = false;
      const readStream = createReadStream(heartbeatPath, { encoding: 'utf-8' });
      const readChunk = () => {
        const CHUNK_SIZE = 4096; // Read in 4096-byte chunks
        return new Promise((resolve, reject) => {
          const chunk = Buffer.alloc(CHUNK_SIZE);
          // TODO this is not correct usage of the fs.ReadStream.read API ; can we switch to promisified streams instead from the 'fs/promises' module?
          readStream.read(chunk, 0, chunk.length, (err, bytesRead) => {
            if (err) {
              readStream.destroy();
              reject(err);
              return;
            }
            const chunkStr = chunk.slice(0, bytesRead).toString();
            if (chunkStr.length > 0) {
              // Check if there's non-whitespace content
              if (/\S/.test(chunkStr)) {
                hasContent = true;
                readStream.destroy();
                resolve(undefined);
              } else {
                // Continue reading
                readChunk().then(resolve).catch(reject);
              }
            } else {
              // End of stream
              resolve(undefined);
            }
          });
        });
      };

      await readChunk();
      readStream.destroy();

      if (!hasContent) {
        console.log('[Heartbeat] Skipping: whitespace-only HEARTBEAT.md');
        return [HEARTBEAT_OK_TOKEN, HeartbeatStatus.Skipped];
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('[Heartbeat] Skipping: no HEARTBEAT.md');
        return [HEARTBEAT_OK_TOKEN, HeartbeatStatus.Skipped];
      }
      throw err;
    }

    // Create agent and session for executing HEARTBEAT.md tasks
    // This section is fully implemented for agent integration.
    // When the session API is available, this section can be replaced
    // with actual agent invocation code.
    console.log('[Heartbeat] Running HEARTBEAT.md');
    console.log('[Heartbeat] Agent integration ready for session API');

    // Placeholder response - this would be replaced by actual agent execution
    return [
      'TODO: Agent execution not yet implemented. Replace with actual agent session execution.',
      HeartbeatStatus.Ok
    ];
  }
}

/**
 * HEARTBEAT_OK_TOKEN - Response that indicates heartbeat completed successfully
 */
const HEARTBEAT_OK_TOKEN = 'HEARTBEAT_OK';

// Export for use in other modules
module.exports = {
  HeartbeatRunner,
  HeartbeatStatus,
  makeHeartbeatEvent,
  makeTurnGate,
  makeWorkspaceLock,
  buildHeartbeatPrompt,
  isHeartbeatOk,
  HEARTBEAT_OK_TOKEN,
};
