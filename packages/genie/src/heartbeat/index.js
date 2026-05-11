// @ts-check
import { access, writeFile } from 'fs/promises';
import { join } from 'path';

import harden from '@endo/harden';

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
 * @param {object} params
 * @param {string} params.workspaceDir — TODO this should be a VFS abstraction similar to the tools module
 * @param {PiAgent} params.piAgent
 * @param {() => number} [params.now]
 */
async function* runHeartbeat({
  workspaceDir,
  piAgent,
  now = Date.now, // TODO maybe abstract
}) {
  const tickStart = now();

  const workspaceIsGit = await isGitRepo(workspaceDir);
  const prompt = buildHeartbeatPrompt(workspaceIsGit);

  let responseText = '';

  try {
    for await (const event of runAgentRound(piAgent, prompt)) {
      yield event;
      switch (event.type) {
        case 'Message': {
          if (event.role === 'assistant' && event.content) {
            responseText += event.content;
          }
          break;
        }
        case 'Error': {
          responseText = `Error: ${event.message}`;
          break;
        }
        default:
          break;
      }
    }
  } catch (err) {
    const errorMessage = /** @type {Error} */ (err).message || String(err);
    responseText = `Heartbeat error: ${errorMessage}`;
  }

  const tickEnd = now();
  const elapsed = tickEnd - tickStart;
  const status = isHeartbeatOk(responseText)
    ? HeartbeatStatus.Ok
    : HeartbeatStatus.Failed;
  const heartbeatEvent = makeHeartbeatEvent(tickEnd, status, {
    elapsed,
    response: responseText,
  });

  const statusPath = join(workspaceDir, '.heartbeats.log');
  try {
    await writeFile(statusPath, `${JSON.stringify(heartbeatEvent)}\n`, 'utf-8');
  } catch (err) {
    console.error(
      `[genie] Failed to record heartbeat heartbeatEvent:`,
      /** @type {Error} */ (err).message,
    );
  }

  return heartbeatEvent;
}

/**
 * Check whether a workspace directory is a git repository.
 *
 * @param {string} dir
 * @returns {Promise<boolean>}
 */
const isGitRepo = async dir => {
  await Promise.resolve();
  try {
    await access(join(dir, '.git'));
    return true;
  } catch {
    return false;
  }
};

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
 * @param {string} [options.response]
 * @param {string} [options.reason]
 * @returns {HeartbeatEvent}
 */
function makeHeartbeatEvent(ts, status, options = {}) {
  const { elapsed, response, reason } = options;
  return harden({
    ts, // timestamp in milliseconds
    status,
    elapsed: elapsed || 0,
    preview: response || null,
    reason: reason || null,
  });
}
harden(makeHeartbeatEvent);

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
    trimmed === HEARTBEAT_OK_TOKEN ||
    trimmed.includes('ok') ||
    trimmed.includes('heartbeat complete') ||
    trimmed.includes('tasks completed')
  );
}
harden(isHeartbeatOk);

// ES6 Exports for module compatibility
export {
  runHeartbeat,
  HeartbeatStatus,
  makeHeartbeatEvent,
  buildHeartbeatPrompt,
  isHeartbeatOk,
  HEARTBEAT_OK_TOKEN,
};
