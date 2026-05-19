// @ts-check

/**
 * @typedef {object} MockTraceRound
 * @property {{ message: object }} response
 */

/**
 * @typedef {object} MockTrace
 * @property {string} id
 * @property {string[]} [expectedToolNames]
 * @property {{ messages: object[] }} [providerRequest]
 * @property {{ ok: boolean, status?: number, message?: object | string }} [providerResult]
 * @property {MockTraceRound[]} [rounds]
 */

/**
 * @param {unknown} value
 * @returns {unknown}
 */
const cloneJson = value => JSON.parse(JSON.stringify(value));

/**
 * Look up a trace by id in a parsed fixture file. The fixture file is
 * authored alongside tests, so we trust its shape rather than guarding
 * defensively.
 *
 * @param {{ traces: MockTrace[] }} fixtures
 * @param {string} fixtureId
 * @returns {MockTrace}
 */
export const findMockTrace = (fixtures, fixtureId) => {
  const trace = fixtures.traces.find(entry => entry.id === fixtureId);
  if (!trace) {
    throw new Error(`Mock LLM fixture not found: ${fixtureId}`);
  }
  return trace;
};
harden(findMockTrace);

/**
 * Create a deterministic provider that replays assistant messages from a
 * captured trace. The `calls` array is intentionally mutable so tests can
 * inspect the harness-to-provider requests after replay.
 *
 * @param {{ trace: MockTrace }} options
 * @returns {{ calls: Array<{ messages: object[], tools: object[] }>, chat: (messages: object[], tools: object[]) => Promise<{ message: object }> }}
 */
export const makeMockProvider = ({ trace }) => {
  const rounds = trace.rounds || [];
  let index = 0;
  /** @type {Array<{ messages: object[], tools: object[] }>} */
  const calls = [];

  return {
    calls,
    async chat(messages, tools) {
      calls.push({
        messages: /** @type {object[]} */ (cloneJson(messages)),
        tools: /** @type {object[]} */ (cloneJson(tools)),
      });
      const round = rounds[index];
      index += 1;
      if (!round) {
        throw new Error(
          `Mock LLM fixture "${trace.id}" exhausted after ${rounds.length} round(s)`,
        );
      }
      return /** @type {{ message: object }} */ (cloneJson(round.response));
    },
  };
};
harden(makeMockProvider);
