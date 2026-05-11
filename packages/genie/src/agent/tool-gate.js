// @ts-check

/**
 * Tool-gate — track whether a sub-agent actually called the tools we
 * expected during a multi-attempt prompt loop.
 *
 * The gate is consumed by the observer and reflector sub-agents: they
 * hand every {@link ChatEvent} to {@link ToolGate.update}, and after a
 * round check {@link ToolGate.done} to decide whether another retry
 * prompt is needed.  {@link ToolGate.pending} lists the
 * `(toolName, expectedArg)` pairs still missing so the retry prompt can
 * name them explicitly.
 *
 * ## Spec shape
 *
 * ```js
 * const gate = makeToolGate({
 *   memorySet: {
 *     argKey: 'path',
 *     expected: ['memory/observations.md', 'memory/reflections.md'],
 *   },
 * });
 * ```
 *
 * The outer object's keys are tool names.  For each tool:
 * - `argKey` names the argument we want to match (e.g. `'path'`),
 * - `expected` lists the allowed argument values that the sub-agent
 *   must cover (as an array — a single-element array is fine).
 *
 * A tool is "done" once every value in its `expected` list has been
 * observed flowing through a successful `ToolCallStart` →
 * `ToolCallEnd` pair.  The gate is "done" when every tool is done.
 *
 * ## Previously-known bugs (now fixed)
 *
 * - `argVal === 'string' && argVal` was a typeof-check typo; the gate
 *   never recorded a successful call.  Fixed: `typeof argVal ===
 *   'string'`.
 * - `args[argName] in did` looked up the argument value against the
 *   outer tool-name map rather than the per-tool expected-value map.
 *   Fixed: look up in `did[toolName]`.
 * - `default: doing = ''` inside the event switch clobbered in-flight
 *   doing-state on any intervening event (e.g. a `Message` arriving
 *   between `ToolCallStart` and `ToolCallEnd`), causing the matching
 *   `ToolCallEnd` to miss.  Fixed: the `default` branch no longer
 *   clears `doing`; callers use {@link ToolGate.reset} explicitly when
 *   they want to clear in-flight state between retry rounds.
 *
 * ## Generalisation
 *
 * The shape covers both current call sites uniformly:
 * - reflector: `memorySet` with `argKey: 'path'` and a two-element
 *   `expected` list (`observations.md`, `reflections.md`),
 * - observer: `memorySet` with `argKey: 'path'` and a one-element
 *   `expected` list (`observations.md`).
 *
 * See `PLAN/genie_loop_architecture.md` § "Tool gate" for the design
 * context.
 */

import harden from '@endo/harden';

/** @import { ChatEvent } from './index.js' */

/**
 * @typedef {object} ToolExpectation
 * @property {string} argKey - Argument key the sub-agent must match
 *   against (e.g. `'path'`).
 * @property {string[]} expected - Allowed values of `argKey`.  Every
 *   value must be observed in a successful tool call for the gate to
 *   be "done" for this tool.
 */

/**
 * @typedef {Record<string, ToolExpectation>} ToolGateSpec
 */

/**
 * @typedef {object} ToolGate
 * @property {() => boolean} done - Whether every expected
 *   `(toolName, argValue)` pair has been observed.
 * @property {(event: ChatEvent) => void} update - Feed one
 *   {@link ChatEvent} to the gate.  Drives the
 *   `ToolCallStart` → `ToolCallEnd` state machine.
 * @property {() => Generator<[string, string]>} pending - Iterate the
 *   `(toolName, missingArgValue)` pairs still outstanding.
 * @property {() => void} reset - Clear in-flight "doing" state
 *   between retry rounds.  Does not touch the `did` map — already-
 *   recorded successful calls remain recorded.
 */

/**
 * Create a tool-gate.  See the module docblock for the spec shape and
 * the returned API.
 *
 * @param {ToolGateSpec} spec
 * @returns {ToolGate}
 */
const makeToolGate = spec => {
  /**
   * Per-tool map of `expectedValue -> observedBool`.  Populated from
   * `spec` at construction time; mutated as successful calls are
   * recorded.
   *
   * @type {Record<string, Record<string, boolean>>}
   */
  const did = {};
  for (const [toolName, { expected }] of Object.entries(spec)) {
    /** @type {Record<string, boolean>} */
    const toolDid = {};
    for (const value of expected) {
      toolDid[value] = false;
    }
    did[toolName] = toolDid;
  }

  // Name of the tool currently mid-call (between Start and End).
  let doingTool = '';
  // Expected-argument value currently mid-call.
  let doing = '';

  const done = () => {
    for (const toolName of Object.keys(did)) {
      const toolDid = did[toolName];
      for (const value of Object.keys(toolDid)) {
        if (!toolDid[value]) return false;
      }
    }
    return true;
  };

  const reset = () => {
    doingTool = '';
    doing = '';
  };

  /** @param {ChatEvent} event */
  const update = event => {
    switch (event.type) {
      case 'ToolCallStart': {
        const { toolName } = event;
        if (done() || !(toolName in did)) {
          return;
        }
        const toolDid = did[toolName];
        const { argKey } = spec[toolName];
        let { args } = event;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            // Leave as string; the next check will reject it.
          }
        }
        if (!args || typeof args !== 'object' || !(argKey in args)) {
          return;
        }
        const argVal = args[argKey];
        if (typeof argVal === 'string' && argVal in toolDid) {
          doingTool = toolName;
          doing = argVal;
        }
        return;
      }
      case 'ToolCallEnd': {
        if (!doing || event.toolName !== doingTool) {
          return;
        }
        if ('error' in event) {
          // Failed call — clear the in-flight state but do not record
          // it as done; a retry round may attempt the same pair again.
          reset();
          return;
        }
        did[doingTool][doing] = true;
        doing = '';
        doingTool = '';
        break;
      }
      default: {
        // Intentionally do NOT clear `doing` on intervening events
        // (e.g. `Message`, `Thinking`).  The previous implementation
        // cleared here, which caused the matching `ToolCallEnd` to
        // miss whenever a Message arrived mid-call.
      }
    }
  };

  /** @returns {Generator<[string, string]>} */
  function* pending() {
    for (const [toolName, toolDid] of Object.entries(did)) {
      for (const [value, observed] of Object.entries(toolDid)) {
        if (!observed) {
          yield [toolName, value];
        }
      }
    }
  }

  return harden({
    done,
    update,
    pending,
    reset,
  });
};
harden(makeToolGate);

export { makeToolGate };
