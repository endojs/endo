// @ts-nocheck - E() generics don't work well with JSDoc types for remote objects
/* eslint-disable no-await-in-loop */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { makeLocalTree } from '@endo/platform/fs/node';

import { Agent as PiAgent } from '@earendil-works/pi-agent-core';
import { registerBuiltInApiProviders } from '@earendil-works/pi-ai';

import { systemPrompt } from './prompts/system.js';
import { tools } from './tools/index.js';
import { makeExecuteTool, toAgentTool } from './tool-dispatch.js';
import {
  resolveModelString,
  setProviderApiKey,
  resolveModel,
  getOllamaApiKey,
} from './model-resolution.js';
import { runRound } from './round-runner.js';

// Re-export the tool-dispatch surface so tests that already import these
// from `./agent.js` continue to work without churn.
export { makeExecuteTool, toAgentTool };

/** @import { FarRef } from '@endo/eventual-send' */
/** @import { GuestPowers, InboxMessage, LalContext } from './agent.types.js' */

// Register pi-ai's built-in API providers (anthropic, openai, google,
// openrouter, mistral, deepseek, groq, xai, github-copilot, and ~20 others)
// so getModel(provider, modelId) lookups succeed for any caller-supplied
// "provider/modelId" string. Ollama is *not* in this registry; lal handles
// "ollama/<id>" specially in `resolveWorkerModel` below by constructing a
// custom Model that points at a local OpenAI-compatible Ollama endpoint.
registerBuiltInApiProviders();

// ============================================================================
// Interface Definition
// ============================================================================

const LalInterface = M.interface('Lal', {
  help: M.call().optional(M.string()).returns(M.string()),
});

// ============================================================================
// Worker Loop
// ============================================================================

/**
 * Spawn a worker loop that follows a guest's inbox and processes messages
 * using a pi-agent-core–backed PiAgent. The PiAgent's internal message
 * state is the durable transcript for the worker's lifetime; cross-restart
 * conversation continuity is intentionally not preserved by this migration
 * (see the PR body's *Memory migration* section).
 *
 * @param {any} powers - Guest powers (manager's own or a sub-guest's)
 * @param {Promise<object> | object | null | undefined} context
 * @param {{ LAL_HOST?: string, LAL_MODEL?: string, LAL_AUTH_TOKEN?: string }} workerEnv
 * @returns {Promise<void>}
 */
export const spawnWorkerLoop = async (powers, context, workerEnv) => {
  const getCancelled = async () => {
    if (!context) return null;
    const resolvedContext = await context;
    if (!resolvedContext) return null;
    if (typeof resolvedContext.whenCancelled === 'function') {
      return E(resolvedContext).whenCancelled();
    }
    if (resolvedContext.cancelled) {
      return resolvedContext.cancelled;
    }
    return null;
  };

  // Resolve the model string for pi-ai. lal historically selected a provider
  // from LAL_HOST and a model from LAL_MODEL. The pi-ai registry takes a
  // single "provider/modelId" string instead; we keep accepting the legacy
  // LAL_* variables and translate them.
  const model = resolveModelString(workerEnv);
  if (workerEnv.LAL_AUTH_TOKEN) {
    setProviderApiKey(model, workerEnv.LAL_AUTH_TOKEN);
  }

  // Bind the tool dispatcher to this guest's powers, then build the
  // AgentTool array pi-agent-core consumes directly. We construct the
  // PiAgent in-line (rather than via a higher-level harness helper) so that
  //   (a) we are free to seed `initialState.messages` from prior
  //       transcripts when cross-restart continuity lands (see PR body),
  //   (b) we control the system prompt verbatim (no policy suffix or
  //       security-notes wrapping is applied), and
  //   (c) the per-tool parameter schema lives at the tool boundary,
  //       which lets `@endo/patterns` validation guard inbound args.
  const executeTool = makeExecuteTool(powers);
  const agentTools = tools.map(({ name, summary }) =>
    toAgentTool(name, summary, executeTool),
  );

  const resolvedModel = await resolveModel(model);
  const isOllama = resolvedModel.name?.startsWith('ollama/');

  const piAgent = new PiAgent({
    initialState: {
      systemPrompt,
      model: resolvedModel,
      tools: agentTools,
      messages: [],
      thinkingLevel: resolvedModel.reasoning ? 'medium' : 'off',
    },
    convertToLlm: msgs =>
      msgs.filter(
        m =>
          m.role === 'user' ||
          m.role === 'assistant' ||
          m.role === 'toolResult',
      ),
    toolExecution: 'sequential',
    ...(isOllama ? { getApiKey: async _provider => getOllamaApiKey() } : {}),
  });

  /**
   * Run one chat round on the PiAgent, forwarding tool-call activity to
   * the console (via `round-runner.js`).
   *
   * @param {string} prompt - User-role content for this round.
   */
  const runOneRound = prompt => runRound(piAgent, prompt);

  /**
   * Build the user-role content for an inbound message. lal's prompt is
   * intentionally minimal: the LLM is expected to call listMessages() to
   * inspect the inbox itself.
   *
   * @returns {string}
   */
  const formatInboundMessage = () =>
    'You have new mail. Check your messages and respond appropriately.';

  /**
   * Run the agent loop, processing incoming messages.
   *
   * @returns {Promise<void>}
   */
  const runAgent = async () => {
    // Announce ourselves with a call to action.
    await E(powers).send(
      '@host',
      [
        "Hello! I'm ready to help.\n\n" +
          'Send me a message to get started — in Chat, type ' +
          '`@` followed by my name and your request.\n\n' +
          'A few things to try:\n' +
          '- Ask me what I can do\n' +
          '- Ask me to list your inventory\n' +
          '- Ask me to help write a program\n\n' +
          'Type `/help` to see all available Chat commands.',
      ],
      [],
      [],
    );

    /** @type {string | undefined} */
    const selfLocator = await E(powers).locate('@self');
    const cancelled = await getCancelled();
    const cancelledSignal = cancelled
      ? cancelled.then(
          () => ({ cancelled: true }),
          () => ({ cancelled: true }),
        )
      : null;

    // Follow messages and route each to the correct transcript chain.
    //
    // Re-emission of an already-processed inbound number indicates the
    // sender called daemon `editMessage`: a partial submission that has
    // settled, or an amendment of an already-settled message.  We do
    // not start a fresh transcript turn for such re-emissions; the
    // agent can call `messageHistory(n)` to retrieve the prior text
    // if it needs to reason about the change.
    /** @type {Set<bigint>} */
    const seenInboundNumbers = new Set();

    const messageIterator = iterateReader(E(powers).followMessages());
    while (true) {
      const nextMessage = messageIterator.next();
      const raced = cancelledSignal
        ? await Promise.race([
            cancelledSignal,
            nextMessage.then(result => ({ cancelled: false, result })),
          ])
        : { cancelled: false, result: await nextMessage };
      if (raced.cancelled) {
        try {
          await messageIterator.return?.();
        } catch {
          // ignore iterator return errors on cancellation
        }
        break;
      }
      const { value: message, done } = raced.result;
      if (done) {
        break;
      }
      const inboxMessage =
        /** @type {InboxMessage & {type?: string, messageId?: string, replyTo?: string, done?: boolean}} */ (
          message
        );
      const {
        from: fromLocator,
        number,
        type,
        done: messageDone = true,
      } = inboxMessage;

      // Skip our own outbound messages; only act on inbound mail.
      // eslint-disable-next-line @endo/restrict-comparison-operands
      if (fromLocator !== selfLocator) {
        // Skip partial (in-flight) submissions: wait until the sender
        // marks the message done before spinning up an LLM turn.
        if (messageDone === false) {
          console.log(
            `[mail] Message #${number} is not yet done; deferring until settled`,
          );
          // eslint-disable-next-line no-continue
          continue;
        }
        if (seenInboundNumbers.has(number)) {
          console.log(
            `[mail] Message #${number} was edited after settlement; ` +
              `not rerunning. Use messageHistory(${number}) for the prior text.`,
          );
          // eslint-disable-next-line no-continue
          continue;
        }
        seenInboundNumbers.add(number);
        console.log(
          `[mail] New message #${number} (type: ${type || 'package'})`,
        );
        try {
          await runOneRound(formatInboundMessage());
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error('[agent] LLM error, notifying sender:', errorMessage);
          try {
            await E(powers).reply(
              number,
              [`LLM provider error: ${errorMessage}`],
              [],
              [],
            );
          } catch (replyError) {
            console.error('[agent] Failed to notify sender:', replyError);
          }
        }
      }
    }
  };

  await runAgent();
};
harden(spawnWorkerLoop);

// ============================================================================
// Manager / Entry Point
// ============================================================================

/**
 * Creates a Lal agent manager.
 *
 * Sends a configuration form to HOST on startup. Each form submission
 * creates a new guest profile and spawns a worker loop for it.
 *
 * @param {FarRef<GuestPowers>} guestPowers - Guest powers from the Endo daemon
 * @param {Promise<LalContext> | LalContext | undefined} _context - Context for cancellation support
 * @returns {object} The Lal exo object
 */
export const make = (guestPowers, _context) => {
  /** @type {any} */
  const powers = guestPowers;

  // Send the configuration form to HOST for adding agents.
  const runManager = async () => {
    await E(powers).form(
      '@host',
      'Add an agent',
      harden([
        { name: 'name', label: 'Agent name' },
        {
          name: 'host',
          label: 'API host',
          default: 'http://localhost:11434/v1',
          example: 'https://api.anthropic.com for Anthropic',
        },
        {
          name: 'model',
          label: 'Model name',
          default: 'qwen3',
          example: 'claude-sonnet-4-6-20250514 for Anthropic',
        },
        {
          name: 'authToken',
          label: 'API auth token',
          default: 'ollama',
          example: 'sk-ant-... for Anthropic',
          secret: true,
        },
      ]),
    );

    // Resolve the host agent reference for provideGuest calls.
    const agent = await E(powers).lookup('host-agent');
    const selfLocator = await E(powers).locate('@self');
    const activeWorkers = new Map();

    // Check in the primer directory as a content-addressed readable-tree.
    // Stored once in the host namespace; each sub-guest gets a reference.
    const primerDirPath = new URL('./primer', import.meta.url).pathname;
    const localPrimerTree = makeLocalTree(primerDirPath);
    await E(agent).storeTree(localPrimerTree, 'lal-primer');
    const primerTreeId = await E(agent).identify('lal-primer');
    console.log(`[lal] Primer tree checked in (${primerTreeId})`);

    /**
     * Ensure the sub-guest has a `primer` reference.
     * @param {any} guest
     */
    const provisionPrimer = async guest => {
      const hasPrimer = await E(guest).has('primer');
      if (!hasPrimer) {
        await E(guest).storeIdentifier('primer', primerTreeId);
        console.log('[lal] Primer provisioned for guest');
      }
    };

    // Pre-scan existing messages to find our latest form messageId so that
    // old value messages (from prior sessions) that reply to an earlier form
    // are not accidentally matched when the iterator replays history.
    /** @type {string | undefined} */
    let formMessageId;
    const existingMessages = /** @type {any[]} */ (
      await E(powers).listMessages()
    );
    for (const msg of existingMessages) {
      // eslint-disable-next-line @endo/restrict-comparison-operands
      if (msg.from === selfLocator && msg.type === 'form') {
        formMessageId = msg.messageId;
      }
    }

    const messageIterator = iterateReader(E(powers).followMessages());
    while (true) {
      const { value: message, done } = await messageIterator.next();
      if (done) break;

      const msg = /** @type {any} */ (message);

      // Capture the form's messageId from our own outbound message.
      // eslint-disable-next-line @endo/restrict-comparison-operands
      if (msg.from === selfLocator && msg.type === 'form') {
        formMessageId = msg.messageId;
      } else if (
        msg.type === 'value' &&
        // eslint-disable-next-line @endo/restrict-comparison-operands
        msg.replyTo === formMessageId
      ) {
        // Only process value messages that reply to our form.
        try {
          // Resolve the submitted values from the value message.
          const config =
            /** @type {{ name: string, host: string, model: string, authToken: string }} */ (
              await E(powers).lookupById(msg.valueId)
            );

          const { name } = config;

          if (activeWorkers.has(name)) {
            // A worker is already running for this name.
            await E(powers).reply(
              msg.number,
              [`Agent "${name}" already exists.`],
              [],
              [],
            );
          } else {
            // Create the guest profile via the host agent.
            // provideGuest returns the full EndoGuest (not the handle).
            // Guard with has() so restart re-uses the existing guest;
            // re-running provideGuest on an existing name throws
            // "Formula already exists".
            let guest;
            if (await E(agent).has(name)) {
              guest = await E(agent).lookup(name);
            } else {
              guest = await E(agent).provideGuest(name, {
                agentName: `profile-for-${name}`,
              });
            }

            // Ensure the sub-guest has the primer directory.
            await provisionPrimer(guest);

            // Spawn a worker loop for this guest.
            const workerP = spawnWorkerLoop(guest, null, {
              LAL_HOST: config.host,
              LAL_MODEL: config.model,
              LAL_AUTH_TOKEN: config.authToken,
            });
            activeWorkers.set(name, workerP);
            workerP.catch(error => {
              console.error(`[lal] Worker "${name}" error:`, error);
              activeWorkers.delete(name);
            });

            await E(powers).reply(
              msg.number,
              [`Agent "${name}" is now running.`],
              [],
              [],
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error('[lal] Form submission error:', errorMessage);
          try {
            await E(powers).reply(
              msg.number,
              [`Error creating agent: ${errorMessage}`],
              [],
              [],
            );
          } catch {
            // Best-effort reply.
          }
        }
      }
    }
  };

  runManager().catch(error => {
    console.error('[lal] Manager error:', error);
  });

  return makeExo('Lal', LalInterface, {
    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return 'Lal agent manager. Submit the configuration form to add agents.';
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
