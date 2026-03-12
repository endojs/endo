import { EventEmitter } from 'events';

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
 * Helper function: Get last line from a file efficiently
 * Uses fs.promises API for better performance and error handling
 *
 * @param {string} filePath - Path to the file
 * @returns {Promise<string|null>} - Last line text or null if file doesn't exist or is empty
 */
async function getLastLine(filePath) {
  try {
    const { OpenFileHandle, createReadStream } = await import('fs/promises');
    
    const fileHandle = await OpenFileHandle(filePath, 'r');
    const stat = await fileHandle.stat();
    
    // If file is empty or too small, return null
    if (stat.size === 0) {
      await fileHandle.close();
      return null;
    }

    // Move to end of file
    await fileHandle.seek(stat.size - 1, 'start');

    // Read line by line from the end
    const file = createReadStream(filePath, { 
      encoding: 'utf8',
      autoClose: true 
    });
    
    const readline = (await import(' readline')).createInterface({
      input: file,
      crlfDelay: Infinity
    });

    let lastLine = null;
    for await (const line of readline) {
      lastLine = line;
    }
    readline.close();

    return lastLine || null;
  } catch (err) {
    if (err.code === 'ENOENT') {
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
    const { OpenFileHandle, createReadStream } = await import('fs/promises');
    
    const fileHandle = await OpenFileHandle(filePath, 'r');
    const file = createReadStream(filePath, { encoding: 'utf8' });
    
    const readline = (await import('readline')).createInterface({
      input: file,
      crlfDelay: Infinity
    });

    for await (const line of readline) {
      if (/\S/.test(line)) {
        readline.close();
        return true;
      }
    }
    readline.close();

    return false;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
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

/**
 * Factory function that creates a HeartbeatRunner instance
 *
 * Creates a configurable heartbeat monitor that:
 * - Runs at configurable intervals
 * - Reads HEARTBEAT.md to identify tasks
 * - Coordinates with workspace lock
 * - Emits heartbeat events for monitoring
 *
 * @param {Object} config - Configuration object
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
  const workspaceLock = makeWorkspaceLock();

  let pendingHeartbeat = null;
  let skipCount = 0;
  let skipRetryBase = 1000; // 1 second base retry
  let skipRetryMax = interval / 2; // max half the interval

  let timer = null;
  let running = false;

  // Create an event emitter for lifecycle events
  const emitter = new EventEmitter();

  /**
   * Start the heartbeat loop
   */
  const start = async () => {
    if (running) {
      console.warn('[Heartbeat] Already running, skipping start');
      return;
    }

    running = true;
    console.log(`[Heartbeat] Starting with interval: ${interval}ms, timeout: ${timeout}ms`);

    // Get first delay (may be async)
    const firstDelay = await firstDelay();
    console.log(`[Heartbeat] First tick scheduled after: ${firstDelay}ms`);

    // Set up timer
    timer = setInterval(() => runOnce(), interval);

    // Run first tick after delay
    setTimeout(() => runOnce(), firstDelay);
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
   * Get delay until first tick based on last heartbeat
   *
   * Reads last heartbeat event from disk to calibrate
   */
  const firstDelay = async () => {
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
          console.warn('[Heartbeat] Failed to parse last heartbeat event:', err.message);
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[Heartbeat] Failed to read heartbeat log:', err.message);
        return interval;
      }
    }
    console.log('[Heartbeat] Heartbeat overdue, waiting', overdueDelay, 'ms');
    return overdueDelay;
  };

  /**
   * Check if we're in active hours
   */
  const inActiveHours = () => {
    if (!activeHours) {
      return true; // No active hours configured
    }

    const now = new Date();
    const [startHour, startMin] = activeHours.start.split(':').map(Number);
    const [endHour, endMin] = activeHours.end.split(':').map(Number);

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
  };

  /**
   * Adjust retry delay for transient skips
   */
  const adjustRetryDelay = () => {
    if (skipCount > 0) {
      const retryDelay = Math.min(
        skipRetryBase * Math.pow(2, skipCount),
        skipRetryMax
      );
      if (timer) {
        // Clear and reschedule with new delay
        clearInterval(timer);
        timer = setInterval(() => runOnce(), retryDelay);
      }
      console.log(`[Heartbeat] Transient skip, retry quickly after: ${retryDelay}ms`);
      skipCount = 0;
    }
  };

  /**
   * Internal heartbeat execution
   */
  const runOnceInternal = async () => {
    const heartbeatPath = `${workspacePath}/HEARTBEAT.md`;

    // Check if HEARTBEAT.md exists
    try {
      const { stat } = await import('fs/promises');
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
      if (err.code === 'ENOENT') {
        console.log('[Heartbeat] Skipping: no HEARTBEAT.md');
        return [HEARTBEAT_OK_TOKEN, HeartbeatStatus.Skipped];
      }
      throw err;
    }

    // At this point, HEARTBEAT.md exists and has content
    // This is where agent execution would happen
    // For now, we return a placeholder
    console.log('[Heartbeat] Running HEARTBEAT.md');
    console.log('[Heartbeat] Agent integration ready for session API');

    return [
      'TODO: Agent execution not yet implemented. Replace with actual agent session execution.',
      HeartbeatStatus.Ok
    ];
  };

  /**
   * Handle heartbeat response
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
   */
  const handleTimeout = (elapsed) => {
    const timestamp = Date.now();
    console.warn(`[Heartbeat] Tick timed out after ${elapsed}ms (deadline: ${timeout}ms)`);
    skipCount = 0;
    console.log('[Heartbeat] Waiting for next tick');

    return makeHeartbeatEvent(timestamp, HeartbeatStatus.TimedOut, {
      elapsed,
      reason: `exceeded deadline of ${timeout}ms`,
    });
  };

  /**
   * Main heartbeat execution loop
   */
  const runOnce = async () => {
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

    // Check workspace lock
    const releaseWorkspace = workspaceLock.tryAcquire();
    if (!releaseWorkspace) {
      const event = makeHeartbeatEvent(tickStart, HeartbeatStatus.SkippedMayTry, {
        reason: 'workspace locked',
      });
      emitter.emit('heartbeat', event);
      skipCount++;
      adjustRetryDelay();
      return event;
    }

    try {
      // Run heartbeat with timeout
      const start = Date.now();
      const timedResult = await Promise.race([
        runOnceInternal().then((res) => ({ success: true, data: res })),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeout)
        ),
      ]);
      const elapsed = Date.now() - start;

      // Refactored method now returns event object directly
      if (timedResult.success) {
        return handleHeartbeatResponse(timedResult.data.response, timedResult.data.status, elapsed);
      } else {
        return handleTimeout(elapsed);
      }
    } finally {
      releaseWorkspace();
    }
  };

  return {
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
    adjustRetryDelay,

    // Event emitter
    emitter,

    // Legacy helper methods
    _handleHeartbeatResponse: handleHeartbeatResponse,
    _handleTimeout: handleTimeout,
    runOnceInternal,
    runOnce,
  };
}

/**
 * HEARTBEAT_OK_TOKEN - Response that indicates heartbeat completed successfully
 */
const HEARTBEAT_OK_TOKEN = 'HEARTBEAT_OK';

// ES6 Exports for module compatibility
export {
  makeHeartbeatRunner,
  HeartbeatStatus,
  makeHeartbeatEvent,
  makeWorkspaceLock,
  buildHeartbeatPrompt,
  isHeartbeatOk,
  HEARTBEAT_OK_TOKEN,
  getLastLine,
  hasContent,
};