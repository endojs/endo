// @ts-nocheck - PiAgent and runAgentRound generics don't compose cleanly here
/**
 * Per-round runner for the Lal agent.
 *
 * Consumes the event stream `runAgentRound` yields for one chat round on a
 * constructed `PiAgent` and prints lal's standard diagnostic console output
 * (tool calls, tool results, assistant prose, errors).
 */

import { passableAsJustin } from '@endo/marshal';

import { runAgentRound } from './agent-round.js';

/**
 * Run one chat round on the PiAgent, forwarding tool-call activity to
 * the console and dispatching tool errors via the LLM transcript.
 *
 * @param {any} piAgent
 * @param {string} prompt - User-role content for this round.
 * @returns {Promise<void>}
 */
export const runRound = async (piAgent, prompt) => {
  for await (const event of runAgentRound(piAgent, prompt)) {
    switch (event.type) {
      case 'ToolCallStart': {
        const argsPreview = (() => {
          try {
            const s =
              typeof event.args === 'string'
                ? event.args
                : passableAsJustin(harden(event.args ?? {}), false);
            return s.length > 200 ? `${s.slice(0, 200)}...` : s;
          } catch {
            return '(args)';
          }
        })();
        console.log(`[tool] ${event.toolName}(${argsPreview})`);
        break;
      }
      case 'ToolCallEnd': {
        if ('error' in event && event.error) {
          console.error(
            `[tool] ${event.toolName} error: ${event.error.message}`,
          );
        } else {
          const out = (() => {
            try {
              return passableAsJustin(event.result, false);
            } catch {
              return String(event.result);
            }
          })();
          console.log(`[tool] ${event.toolName} -> ${out}`);
        }
        break;
      }
      case 'Message': {
        if (event.role === 'assistant' && event.content) {
          // The LLM's text response is logged for visibility; lal's
          // protocol is tool-call-only, so any prose surfaces here as a
          // debugging breadcrumb rather than being sent to a peer.
          console.log(`[assistant] ${event.content}`);
        }
        break;
      }
      case 'Error': {
        console.error(`[agent] LLM error: ${event.message}`);
        throw event.cause || new Error(event.message);
      }
      default:
        break;
    }
  }
};
harden(runRound);
