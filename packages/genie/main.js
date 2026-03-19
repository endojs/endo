// @ts-check
/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */

/**
 * Genie main module — integrates the genie agent (src/agent) into the
 * Endo daemon's mail messaging system.
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
import { makeAgent } from '@endo/genie';

/** @import { FarRef } from '@endo/eventual-send' */

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
 * Follows the guest's inbox, forwards each inbound message to the genie
 * agent as a chat prompt, and relays incremental status + final response
 * back through the daemon mail system.
 *
 * @param {FarRef<object>} guestPowers - Guest powers from the Endo daemon
 * @param {Promise<object> | object | undefined} _context - Context (unused for now)
 * @returns {object} The Genie exo object
 */
export const make = (guestPowers, _context) => {
  /** @type {any} */
  const powers = guestPowers;

  /**
   * Process a single inbound message by running a genie chat round and
   * relaying events back to the sender via daemon mail.
   *
   * @param {object} inboxMessage - The inbound daemon message
   * @param {bigint} inboxMessage.number - Message number for reply/dismiss
   * @param {string[]} inboxMessage.strings - Text fragments of the message
   * @param {string} inboxMessage.from - Sender formula ID
   */
  const processMessage = async inboxMessage => {
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

    console.log(`[genie] Processing message #${number}: ${prompt.slice(0, 120)}...`);

    // Create a genie agent for this round.
    // No tools are wired yet — this scaffold focuses on the mail integration.
    const agent = makeAgent({
      hostname: 'endo-daemon',
      currentTime: new Date().toISOString(),
    });

    // Track whether we have sent a "Thinking..." status so we can avoid
    // spamming duplicate status messages.
    let sentThinking = false;

    try {
      // Iterate the async generator returned by chatRound.
      for await (const event of agent.chatRound({ prompt })) {
        switch (event.type) {
          // -----------------------------------------------------------------
          // 1. Reasoning / thinking phases → send "Thinking..." status
          // -----------------------------------------------------------------
          case 'assistant_delta': {
            // We receive streaming text deltas here. Since we cannot stream
            // through the daemon mail system, we send a single "Thinking..."
            // status message to indicate the agent is working.
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

          // -----------------------------------------------------------------
          // 2. Tool calls → send "Calling tool <name> <args>..." status
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
            const status = event.error ? 'failed' : 'completed';
            console.log(`[genie] Tool ${event.toolName} ${status}`);
            break;
          }

          // -----------------------------------------------------------------
          // 3. Final assistant message → send the full buffered response
          // -----------------------------------------------------------------
          case 'Message': {
            if (event.role === 'assistant' && event.content) {
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
      console.error(`[genie] Unhandled error during chat round:`, errorMessage);
      await E(powers).reply(
        number,
        [`Genie error: ${errorMessage}`],
        [],
        [],
      );
    }
  };

  /**
   * Main message loop — follows the guest inbox and dispatches each
   * inbound message to processMessage.
   */
  const runLoop = async () => {
    // Announce ourselves to the host.
    await E(powers).send('@host', ['Genie agent ready.'], [], []);

    const selfId = await E(powers).identify('@self');
    const messageIterator = makeRefIterator(E(powers).followMessages());

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
        await processMessage(msg);
      } catch (err) {
        const errorMessage = /** @type {Error} */ (err).message || String(err);
        console.error(`[genie] Failed to process message #${msg.number}:`, errorMessage);
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
        return 'Genie AI agent. Send messages to interact with the LLM agent.';
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
harden(make);
