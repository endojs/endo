// @ts-check

import harden from '@endo/harden';

/**
 * @template Chunk
 * @typedef {(tail: string[]) => AsyncGenerator<Chunk>} SpecialHandler
 */

/**
 * @template Chunk
 * @typedef {object} SpecialsDispatcherOptions
 * @property {string} prefix
 *   - Leading character(s) that identify an input as a special command (`'.'`
 *     in dev-repl, `'/'` in main.js).
 * @property {Record<string, SpecialHandler<Chunk>>} handlers
 *   - Map of command name (no prefix) to handler.
 *     The command name is the first whitespace-delimited token after the prefix.
 * @property {SpecialHandler<Chunk>} [onUnknown]
 *   - Optional fallback handler invoked when a special input's head does not
 *     match any entry in `handlers`.
 *     Receives `[head, ...tail]` so the fallback can include the unknown
 *     command name in its output.
 *     If omitted, `dispatch` silently ignores unknown commands.
 */

/**
 * @template Chunk
 * @typedef {object} SpecialsDispatcher
 * @property {(input: string) => boolean} isSpecial
 *   - Returns `true` when `input` starts with the configured prefix.
 * @property {(input: string) => AsyncGenerator<Chunk>} dispatch
 *   - Route `input` to the matching handler.
 *     Throws when `input` is not a special command (callers should guard with `isSpecial`).
 * @property {() => string[]} listCommands
 *   - Snapshot of registered handler names in insertion order
 *     (does **not** include the prefix).
 *     Useful for `/help` / `.help` listings.
 */

/**
 * Split a special command body into `[head, ...tail]`, tolerating arbitrary
 * whitespace (including runs) between tokens and leading or trailing
 * whitespace.  Empty tokens are dropped.
 *
 * @param {string} body
 * @returns {string[]}
 */
const splitTokens = body => body.split(/\s+/).filter(token => token.length > 0);

/**
 * Specials dispatcher — prefix-parameterised command registry shared by
 * `dev-repl.js` (prefix `.`) and `main.js` (prefix `/`).
 *
 * Each handler is an `async function*(...tail: string[])` generator yielding
 * `Chunk` values.
 *
 * `Chunk` is a type parameter so each deployment can pick its own output
 * representation:
 * - `dev-repl` yields ANSI-coloured strings for stdout
 * - while `main.js` yields plain strings that are fanned out through
 *    `E(agentPowers).reply(...)`.
 * - a future usage could yield `{ strings, blobs, packages }` tuples without
 *   disturbing the dispatcher.
 *
 * @template Chunk
 * @param {SpecialsDispatcherOptions<Chunk>} options
 * @returns {SpecialsDispatcher<Chunk>}
 */
export const makeSpecialsDispatcher = ({ prefix, handlers, onUnknown }) => {
  if (typeof prefix !== 'string' || prefix.length === 0) {
    throw new Error(
      'makeSpecialsDispatcher: prefix must be a non-empty string',
    );
  }

  /** @param {string} input */
  const isSpecial = input =>
    typeof input === 'string' && input.startsWith(prefix);

  /**
   * @param {string} input
   * @returns {AsyncGenerator<Chunk>}
   */
  async function* dispatch(input) {
    if (!isSpecial(input)) {
      throw new Error(
        `makeSpecialsDispatcher.dispatch: not a special command (prefix ${JSON.stringify(prefix)}): ${JSON.stringify(input)}`,
      );
    }
    const body = input.slice(prefix.length);
    const tokens = splitTokens(body);
    if (tokens.length === 0) {
      // A bare prefix with no command name is a no-op.
      return;
    }
    const [head, ...tail] = tokens;
    const handler = handlers[head];
    if (handler) {
      yield* handler(tail);
      return;
    }
    if (onUnknown) {
      // Pass `[head, ...tail]` so the fallback can include the unknown
      // command name in its output — mirrors the classic "Unknown
      // command: foo" affordance.
      yield* onUnknown([head, ...tail]);
    }
  }

  const listCommands = () => Object.keys(handlers);

  return harden({ isSpecial, dispatch, listCommands });
};
harden(makeSpecialsDispatcher);
