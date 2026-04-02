// @ts-check

/**
 * Genie main module — integrates the genie agent (src/agent) into the
 * Endo daemon's mail messaging system.
 *
 * This is the unconfined worklet counterpart of `dev-repl.js`: it wires
 * up the same tools and PiAgent, but communicates via Endo host mail
 * instead of stdin/stdout.
 *
 * On startup the module sends a configuration form to `@host`.  Each
 * form submission provisions a **new** Endo guest via the host agent
 * and runs the genie agent loop under that guest's identity.  This
 * means "agent ready" messages and all subsequent replies originate
 * from the agent guest (e.g. `main-genie`), not from `setup-genie`.
 * The first agent defaults to `main-genie`; subsequent form
 * submissions can specify a custom name.
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

import { bash } from './src/tools/command.js';
import { makeFileTools } from './src/tools/filesystem.js';
import { makeMemoryTools } from './src/tools/memory.js';
import { webFetch } from './src/tools/web-fetch.js';
import { webSearch } from './src/tools/web-search.js';

/** @import { FarRef } from '@endo/eventual-send' */
/** @import { EndoGuest, EndoHost } from '@endo/daemon' */

/** Default endo directory name for tracking child agents. */
const DEFAULT_AGENT_DIRECTORY = 'genie';

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
 * Sends a configuration form to `@host`.  Each form submission
 * provisions a **new** Endo guest via the host agent and runs the
 * genie agent loop under that guest's identity.  The first agent
 * created is named `main-genie` so the user can interact with it
 * immediately; subsequent submissions can specify a custom name.
 *
 * @param {EndoGuest} guestPowers - Guest powers from the Endo daemon
 * @param {Promise<object> | object | undefined} _context - Context (unused for now)
 * @returns {object} The Genie exo object
 */
export const make = (guestPowers, _context) => {
  const powers = guestPowers;

  /**
   * Build the tool registry, mirroring the set available in dev-repl.js.
   *
   * @param {string} workspaceDir - Root directory for file tools
   */
  const buildTools = workspaceDir => {
    const fileTools = makeFileTools({
      root: workspaceDir,
    });

    const memoryTools = makeMemoryTools({
      root: workspaceDir,
    });

    const tools = {
      bash,
      ...fileTools,
      ...memoryTools,
      webFetch,
      webSearch,
    };

    /**
     * List available tools in the ToolSpec format expected by makeAgent.
     *
     * @returns {Array<{ name: string, summary: string }>}
     */
    const listTools = () => {
      return Object.entries(tools).map(([name, tool]) => ({
        name,
        summary: tool.help(),
      }));
    };

    /**
     * Execute a tool by name.
     *
     * @param {string} name
     * @param {any} toolArgs
     * @returns {Promise<any>}
     */
    const execTool = async (name, toolArgs) => {
      const tool = tools[name];
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }
      return tool.execute(toolArgs);
    };

    return harden({
      listTools,
      execTool
    });
  };

  /**
   * @typedef {object} AgentConfig
   * @prop {string} model
   * @prop {string} workspace
   * @prop {string} [name]
   * @prop {string} [agentDirectory]
   */

  /**
   * Process a single inbound message by running a genie chat round and
   * relaying events back to the sender via daemon mail.
   *
   * @param {EndoGuest} agentPowers - The agent guest's powers (for send/reply)
   * @param {object} piAgent - The PiAgent instance
   * @param {object} inboxMessage - The inbound daemon message
   * @param {bigint} inboxMessage.number - Message number for reply/dismiss
   * @param {string[]} inboxMessage.strings - Text fragments of the message
   * @param {string} inboxMessage.from - Sender formula ID
   */
  const processMessage = async (agentPowers, piAgent, inboxMessage) => {
    const { number, strings } = inboxMessage;

    // Reconstruct the user prompt from the message text fragments.
    const prompt = strings.join('').trim();
    if (!prompt) {
      await E(agentPowers).reply(
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
                await E(agentPowers).reply(
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
              await E(agentPowers).reply(
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
            await E(agentPowers).reply(
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
            await E(agentPowers).reply(
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
      await E(agentPowers).reply(
        number,
        [`Genie error: ${errorMessage}`],
        [],
        [],
      );
    }
  };

  /**
   * Run the message processing loop for a single agent guest.
   *
   * Follows the agent guest's inbox and dispatches each inbound message
   * to processMessage, using the agent guest's powers so that replies
   * originate from the agent's identity (not setup-genie).
   *
   * @param {EndoGuest} agentPowers - The agent guest's EndoGuest powers
   * @param {object} piAgent - The PiAgent instance
   * @param {string} agentName - Display name for logging
   */
  const runAgentLoop = async (agentPowers, piAgent, agentName) => {
    const selfId = await E(agentPowers).locate('@self');
    const messageIterator = makeRefIterator(
      E(agentPowers).followMessages(),
    );

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
        `[genie:${agentName}] New message #${msg.number} (type: ${msg.type || 'package'})`,
      );

      try {
        await processMessage(agentPowers, piAgent, msg);
      } catch (err) {
        const errorMessage =
          /** @type {Error} */ (err).message || String(err);
        console.error(
          `[genie:${agentName}] Failed to process message #${msg.number}:`,
          errorMessage,
        );
      }

      // Dismiss the message after processing.
      try {
        await E(agentPowers).dismiss(msg.number);
      } catch {
        // Best-effort dismiss.
      }
    }
  };

  /**
   * Provision a new Endo guest for the agent, build its tools and
   * PiAgent, announce readiness, and start the message loop.
   *
   * When `parentPowers` is provided, the child agent's locator is
   * stored in the parent's agent directory so that the parent can
   * discover its children via the endo pet namespace.  The child
   * receives only explicitly introduced names (e.g. workspace mount)
   * and cannot see the parent, siblings, or host-level names.
   *
   * @param {FarRef<EndoHost>} hostAgent - The host agent reference
   * @param {string} agentName - Pet name for the new agent guest
   * @param {AgentConfig} config - Agent configuration
   * @param {EndoGuest} [parentPowers] - Optional parent guest powers for scoped child tracking
   */
  const spawnAgent = async (hostAgent, agentName, config, parentPowers) => {
    const profileName = `profile-for-${agentName}`;

    // Build introducedNames: only grant capabilities the child needs.
    /** @type {Record<string, string>} */
    const introducedNames = {};
    if (await E(hostAgent).has('workspace-mount')) {
      introducedNames['workspace-mount'] = 'workspace';
    }

    // Guard idempotency — on restart the guest already exists.
    /** @type {EndoGuest} */
    let agentGuest;
    if (await E(hostAgent).has(agentName)) {
      agentGuest = /** @type {EndoGuest} */ (
        await E(hostAgent).lookup(agentName)
      );
    } else {
      agentGuest = /** @type {EndoGuest} */ (
        await E(hostAgent).provideGuest(agentName, {
          agentName: profileName,
          introducedNames: harden(introducedNames),
        })
      );
    }

    // If spawned by a parent agent, record the child in the parent's
    // agent directory so discovery uses the endo pet namespace.
    if (parentPowers) {
      const agentDirName = config.agentDirectory || DEFAULT_AGENT_DIRECTORY;
      if (!(await E(parentPowers).has(agentDirName))) {
        await E(parentPowers).makeDirectory(agentDirName);
      }
      const childLocator = await E(agentGuest).locate('@self');
      if (!childLocator) {
        throw new Error(`unable to locate ${agentName}/@self`);
      }
      await E(parentPowers).storeLocator(
        [agentDirName, agentName],
        childLocator,
      );
    }

    const workspaceDir = config.workspace || process.cwd();
    const { listTools, execTool } = buildTools(workspaceDir);

    const piAgent = await makePiAgent({
      hostname: 'endo-daemon',
      currentTime: new Date().toISOString(),
      workspaceDir,
      model: config.model || undefined,
      listTools,
      execTool,
    });

    // Announce readiness from the agent's own identity.
    await E(agentGuest).send(
      '@host',
      [
        `Genie agent ready (model: ${config.model}, workspace: ${workspaceDir}).`,
      ],
      [],
      [],
    );

    console.log(
      `[genie:${agentName}] Agent ready (model: ${config.model}, workspace: ${workspaceDir})`,
    );

    // Start the message loop (fire-and-forget).
    runAgentLoop(agentGuest, piAgent, agentName).catch(err => {
      console.error(`[genie:${agentName}] Agent loop error:`, err);
    });
  };

  /**
   * Remove a child agent: delete its entry from the parent's agent
   * directory and remove the host-level guest reference so GC can
   * collect the orphaned guest and its transitive dependencies.
   *
   * @param {FarRef<EndoHost>} hostAgent - The host agent reference
   * @param {EndoGuest} parentPowers - The parent guest's powers
   * @param {{ agentDirectory?: string }} config - Configuration (for directory name)
   * @param {string} childName - Pet name of the child agent to remove
   */
  const removeChildAgent = async (
    hostAgent,
    parentPowers,
    config,
    childName,
  ) => {
    const agentDirName = config.agentDirectory || DEFAULT_AGENT_DIRECTORY;
    // Remove the child from the parent's directory.
    await E(parentPowers).remove(agentDirName, childName);
    // Remove the host-level guest reference so GC collects the guest.
    await E(hostAgent).remove(childName);
  };
  harden(removeChildAgent);

  /**
   * List child agents visible in a parent's agent directory.
   *
   * @param {EndoGuest} parentPowers - The parent guest's powers
   * @param {{ agentDirectory?: string }} config - Configuration (for directory name)
   * @returns {Promise<string[]>} Pet names of child agents
   */
  const listChildAgents = async (parentPowers, config) => {
    const agentDirName = config.agentDirectory || DEFAULT_AGENT_DIRECTORY;
    if (!(await E(parentPowers).has(agentDirName))) {
      return [];
    }
    return /** @type {string[]} */ (await E(parentPowers).list(agentDirName));
  };
  harden(listChildAgents);

  /**
   * Main loop — sends a configuration form to `@host`, waits for each
   * submission, provisions a new Endo guest for each agent, and loops
   * back to accept further submissions.
   */
  const runLoop = async () => {
    // Resolve the host agent for provisioning new guests.
    const hostAgent = /** @type {FarRef<EndoHost>} */ (
      await E(powers).lookup('host-agent')
    );

    // Send the configuration form to HOST.
    await E(powers).form(
      '@host',
      'Configure Genie agent',
      harden([
        {
          name: 'name',
          label: 'Agent name',
          example: 'main-genie',
        },
        {
          name: 'agentDirectory',
          label: 'Agent directory name (for child-agent tracking)',
          default: 'genie',
        },
        {
          name: 'model',
          label: 'Model',
          default: 'ollama/llama3.2',
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

    // -----------------------------------------------------------------------
    // Accept form submissions and spawn agent guests
    // -----------------------------------------------------------------------

    for await (const msg of makeRefIterator(E(powers).followMessages())) {
      // Capture the form's messageId from our own outbound message.
      if (msg.from === selfId && msg.type === 'form') {
        formMessageId = msg.messageId;
        continue;
      }

      // Only accept value messages that reply to our form.
      if (msg.type !== 'value') continue;
      if (msg.replyTo !== formMessageId) continue;

      try {
        const config = /** @type {AgentConfig} */ (await E(powers).lookupById(msg.valueId));
        const {
          name: agentName = 'main-genie',
        } = config

        console.log(
          `[genie] Configuration received: name=${agentName}, model=${config.model}, workspace=${config.workspace}`,
        );

        // Delegate existence authority to the endo pet namespace.
        // spawnAgent handles idempotent guest creation (reuses
        // existing guests on restart), so we always call through.
        await spawnAgent(hostAgent, agentName, config);

        await E(powers).reply(
          msg.number,
          [`Agent "${agentName}" is now running.`],
          [],
          [],
        );
      } catch (err) {
        console.error('[genie] Form submission error:', err);
        try {
          await E(powers).reply(
            msg.number,
            [`Error creating agent: ${err?.message || err}`],
            [],
            [],
          );
        } catch {
          // Best-effort reply.
        }
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
