// @ts-check
/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */

/**
 * Genie main module — integrates the genie agent (src/agent) into the
 * Endo daemon's mail messaging system.
 *
 * This is the unconfined worklet counterpart of `dev-repl.js`: it wires
 * up the same tools and PiAgent, but communicates via Endo host mail
 * instead of stdin/stdout.
 *
 * On startup the module sends a configuration form to `@host`.  Once the
 * form is submitted (either manually or by `setup.js` auto-submission),
 * the agent is created with the submitted model and workspace, and the
 * message loop begins.
 *
 * Because the daemon does not yet support streaming, this module:
 *  1. Sends incremental "Thinking..." status messages during reasoning.
 *  2. Sends "Calling tool <name> <args>..." messages on tool invocations.
 *  3. Buffers assistant response tokens and sends the completed response
 *     as a single final message.
 */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { registerBuiltInApiProviders } from '@mariozechner/pi-ai';
import { makePiAgent, runAgentRound } from '@endo/genie';

import { bash, makeCommandTool } from './src/tools/command.js';
import { makeFileTools } from './src/tools/filesystem.js';
import { makeMemoryTools } from './src/tools/memory.js';
import { webFetch } from './src/tools/web-fetch.js';
import { webSearch } from './src/tools/web-search.js';

/** @import { FarRef } from '@endo/eventual-send' */
/** @import { Tool } from './src/tools/types.js' */

// Register built-in API providers so getModel lookups work for known providers.
registerBuiltInApiProviders();

// ============================================================================
// Interface Definition
// ============================================================================

const GenieInterface = M.interface('Genie', {
  help: M.call().optional(M.string()).returns(M.string()),
});

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Creates the Genie daemon guest.
 *
 * Sends a configuration form to `@host`, waits for a submission with
 * model and workspace settings, then follows the guest's inbox and
 * forwards each inbound message to the genie agent as a chat prompt,
 * relaying incremental status + final response back through the daemon
 * mail system.
 *
 * @param {FarRef<object>} guestPowers - Guest powers from the Endo daemon
 * @param {Promise<object> | object | undefined} _context - Context (unused for now)
 * @returns {object} The Genie exo object
 */
export const make = (guestPowers, _context) => {
  /** @type {any} */
  const powers = guestPowers;

  /**
   * Build the tool registry, mirroring the set available in dev-repl.js.
   *
   * @param {string} workspaceDir - Root directory for file tools
   * @returns {Record<string, Tool>}
   */
  const buildTools = workspaceDir => {
    const { readFile, writeFile, editFile } = makeFileTools({
      root: workspaceDir,
    });

    const { memoryGet, memorySet, memorySearch } = makeMemoryTools({
      root: workspaceDir,
    });

    const git = makeCommandTool({
      name: 'git',
      program: 'git',
      description:
        'Runs git version control commands (status, log, diff, commit, etc.).',
      allowPath: true,
      policies: [],
    });

    return harden({
      bash,
      readFile,
      writeFile,
      editFile,
      memoryGet,
      memorySet,
      memorySearch,
      git,
      webFetch,
      webSearch,
    });
  };

  /**
   * Process a single inbound message by running a genie chat round and
   * relaying events back to the sender via daemon mail.
   *
   * @param {object} piAgent - The PiAgent instance
   * @param {object} inboxMessage - The inbound daemon message
   * @param {bigint} inboxMessage.number - Message number for reply/dismiss
   * @param {string[]} inboxMessage.strings - Text fragments of the message
   * @param {string} inboxMessage.from - Sender formula ID
   */
  const processMessage = async (piAgent, inboxMessage) => {
    const { number, strings } = inboxMessage;

    // Reconstruct the user prompt from the message text fragments.
    const prompt = strings.join('').trim();
    if (!prompt) {
      await E(powers).reply(
        number,
        ['(empty message — nothing to do)'],
        [],
        [],
      );
      return;
    }

    console.log(
      `[genie] Processing message #${number}: ${prompt.slice(0, 120)}...`,
    );

    // Track whether we have sent a "Thinking..." status so we can avoid
    // spamming duplicate status messages.
    let sentThinking = false;

    try {
      // Iterate the async generator returned by runAgentRound.
      for await (const event of runAgentRound(piAgent, prompt)) {
        switch (event.type) {
          // -----------------------------------------------------------------
          // 1. Reasoning / thinking phases -> send "Thinking..." status
          // -----------------------------------------------------------------
          case 'Thinking':
            // falls through — both thinking and text deltas signal activity
          case 'Message': {
            // For streaming deltas (assistant_delta role) and thinking
            // events, send a single "Thinking..." status so the user
            // knows the agent is working.
            if (
              event.type === 'Thinking' ||
              (event.type === 'Message' && event.role === 'assistant_delta')
            ) {
              if (!sentThinking) {
                sentThinking = true;
                await E(powers).reply(
                  number,
                  ['Thinking...'],
                  [],
                  [],
                );
              }
              break;
            }

            // Final assistant message -> send the full buffered response
            if (
              event.type === 'Message' &&
              event.role === 'assistant' &&
              event.content
            ) {
              await E(powers).reply(
                number,
                [event.content],
                [],
                [],
              );
            }
            break;
          }

          // -----------------------------------------------------------------
          // 2. Tool calls -> send "Calling tool <name> <args>..." status
          // -----------------------------------------------------------------
          case 'ToolCallStart': {
            const argsPreview = (() => {
              try {
                const s = JSON.stringify(event.args);
                return s.length > 120 ? `${s.slice(0, 120)}...` : s;
              } catch {
                return '(args)';
              }
            })();
            await E(powers).reply(
              number,
              [`Calling tool ${event.toolName} ${argsPreview}...`],
              [],
              [],
            );
            break;
          }

          case 'ToolCallEnd': {
            const status = 'error' in event && event.error ? 'failed' : 'completed';
            console.log(`[genie] Tool ${event.toolName} ${status}`);
            break;
          }

          // -----------------------------------------------------------------
          // Errors
          // -----------------------------------------------------------------
          case 'Error': {
            console.error(`[genie] Agent error: ${event.message}`);
            await E(powers).reply(
              number,
              [`Error: ${event.message}`],
              [],
              [],
            );
            break;
          }

          default:
            break;
        }
      }
    } catch (err) {
      const errorMessage = /** @type {Error} */ (err).message || String(err);
      console.error(
        `[genie] Unhandled error during chat round:`,
        errorMessage,
      );
      await E(powers).reply(
        number,
        [`Genie error: ${errorMessage}`],
        [],
        [],
      );
    }
  };

  /**
   * Main loop — sends a configuration form to `@host`, waits for
   * submission, then follows the guest inbox and dispatches each
   * inbound message to processMessage.
   */
  const runLoop = async () => {
    // Send the configuration form to HOST.
    await E(powers).form(
      '@host',
      'Configure Genie agent',
      harden([
        {
          name: 'model',
          label: 'Model',
          example: 'ollama/llama3.2',
        },
        {
          name: 'workspace',
          label: 'Workspace directory',
          example: '/home/user/project',
        },
      ]),
    );

    const selfId = await E(powers).locate('@self');

    // Pre-scan existing messages to find our latest form messageId so that
    // old value messages (from prior sessions) that reply to an earlier form
    // are not accidentally matched when the iterator replays history.
    /** @type {string | undefined} */
    let formMessageId;
    const existingMessages = /** @type {any[]} */ (
      await E(powers).listMessages()
    );
    for (const msg of existingMessages) {
      if (msg.from === selfId && msg.type === 'form') {
        formMessageId = msg.messageId;
      }
    }

    const messageIterator = makeRefIterator(E(powers).followMessages());

    // -----------------------------------------------------------------------
    // Phase 1: Wait for form submission to get configuration
    // -----------------------------------------------------------------------
    /** @type {{ model: string, workspace: string } | undefined} */
    let config;

    while (!config) {
      const { value: message, done } = await messageIterator.next();
      if (done) return;

      const msg = /** @type {any} */ (message);

      // Capture the form's messageId from our own outbound message.
      if (msg.from === selfId && msg.type === 'form') {
        formMessageId = msg.messageId;
        continue;
      }

      // Only accept value messages that reply to our form.
      if (msg.type !== 'value') continue;
      if (msg.replyTo !== formMessageId) continue;

      try {
        config =
          /** @type {{ model: string, workspace: string }} */ (
            await E(powers).lookupById(msg.valueId)
          );
        console.log(
          `[genie] Configuration received: model=${config.model}, workspace=${config.workspace}`,
        );
      } catch (err) {
        const errorMessage =
          /** @type {Error} */ (err).message || String(err);
        console.error('[genie] Form submission error:', errorMessage);
        try {
          await E(powers).reply(
            msg.number,
            [`Error processing configuration: ${errorMessage}`],
            [],
            [],
          );
        } catch {
          // Best-effort reply.
        }
      }
    }

    // -----------------------------------------------------------------------
    // Phase 2: Create the agent with tools
    // -----------------------------------------------------------------------
    const workspaceDir = config.workspace || process.cwd();
    const tools = buildTools(workspaceDir);

    const piAgent = await makePiAgent({
      hostname: 'endo-daemon',
      currentTime: new Date().toISOString(),
      workspaceDir,
      model: config.model || undefined,

      /**
       * List available tools in the ToolSpec format expected by makeAgent.
       *
       * @returns {Array<{ name: string, summary: string }>}
       */
      listTools() {
        return Object.entries(tools).map(([name, tool]) => ({
          name,
          summary: tool.help(),
        }));
      },

      /**
       * Execute a tool by name.
       *
       * @param {string} name
       * @param {any} toolArgs
       * @returns {Promise<any>}
       */
      async execTool(name, toolArgs) {
        const tool = tools[name];
        if (!tool) {
          throw new Error(`Unknown tool: ${name}`);
        }
        return tool.execute(toolArgs);
      },
    });

    // Announce readiness to the host.
    await E(powers).send(
      '@host',
      [`Genie agent ready (model: ${config.model}, workspace: ${workspaceDir}).`],
      [],
      [],
    );

    // -----------------------------------------------------------------------
    // Phase 3: Message processing loop
    // -----------------------------------------------------------------------
    while (true) {
      const { value: message, done } = await messageIterator.next();
      if (done) break;

      const msg =
        /** @type {{ from: string, number: bigint, type?: string, strings: string[], messageId?: string, replyTo?: string }} */ (
          message
        );

      // Skip our own outbound messages.
      if (msg.from === selfId) continue;

      console.log(
        `[genie] New message #${msg.number} (type: ${msg.type || 'package'})`,
      );

      try {
        await processMessage(piAgent, msg);
      } catch (err) {
        const errorMessage =
          /** @type {Error} */ (err).message || String(err);
        console.error(
          `[genie] Failed to process message #${msg.number}:`,
          errorMessage,
        );
      }

      // Dismiss the message after processing.
      try {
        await E(powers).dismiss(msg.number);
      } catch {
        // Best-effort dismiss.
      }
    }
  };

  // Kick off the main loop (fire-and-forget within the daemon worker).
  runLoop().catch(err => {
    console.error('[genie] Main loop error:', err);
  });

  return makeExo('Genie', GenieInterface, {
    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return 'Genie AI agent. Submit the configuration form, then send messages to interact.';
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
harden(make);
