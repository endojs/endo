// @ts-check
// One Floot turn against a ClaudeClient capability (@endo/claude-sandbox):
// send the user text with `E(client).send(prompt)`, consume the returned
// buffered reply reader with `iterateReader`, and translate the raw
// `claude -p --output-format stream-json` events into Floot's normalized
// ReplyEvent writer calls (src/stream.js).
//
// The CLI runs its own agentic loop inside the sandbox — tools execute there,
// and conversation continuity lives in the sandboxed workspace (`--continue`).
// So unlike the API provider path (agent.js's tool-round loop), a Claude-CLI
// turn is a single send: Floot's tool loop, tool discovery, and
// conversation-context assembly are all bypassed, and the events streamed back
// (text, tool_use, tool_result, result) are surfaced for display only.
//
// Abort: when the Floot reply consumer stops (UI Stop / barge-in), the reply
// channel's onClose aborts `signal`; we close the CLI reader in response,
// which kills the in-flight `claude -p` process in the sandbox.

import { E } from '@endo/eventual-send';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

/**
 * Render a claude tool_result content payload as plain text. The CLI emits
 * either a string or an array of content blocks ({ type: 'text', text }).
 *
 * @param {unknown} content
 * @returns {string}
 */
const renderToolResultText = content => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(block =>
        block && typeof block === 'object' && 'text' in block
          ? `${/** @type {{ text: unknown }} */ (block).text}`
          : '',
      )
      .join('');
  }
  return content === undefined ? '' : JSON.stringify(content);
};

/**
 * Stateful translator from raw `claude -p` stream-json events to Floot
 * ReplyEvent writer calls. Exported for unit testing; `runClaudeTurn` drives
 * it against a live reader.
 *
 * @param {object} writer - makeReplyChannel writer
 *   (setPhase/delta/toolCall/toolResult/usage/final/end/abort callers own
 *   final/usage/end — the translator only reports; see finish()).
 * @returns {{
 *   handle: (event: any) => void,
 *   finish: () => {
 *     finalText: string,
 *     usage: { inputTokens: number, outputTokens: number } | undefined,
 *     errorReason: string | undefined,
 *   },
 * }}
 */
export const makeClaudeEventTranslator = writer => {
  const w = /** @type {any} */ (writer);
  // claude's tool_result events carry only tool_use_id; remember each
  // tool_use's name so the paired result can be labeled for the UI.
  /** @type {Map<string, string>} */
  const toolNames = new Map();
  // Text streamed across assistant events. The `result` event's summary text
  // takes precedence when present (it is the CLI's own notion of the final
  // answer for the turn).
  let streamed = '';
  /** @type {string | undefined} */
  let resultText;
  /** @type {string | undefined} */
  let errorReason;
  /** @type {{ inputTokens: number, outputTokens: number } | undefined} */
  let usage;

  const handle = event => {
    if (!event || typeof event !== 'object') return;
    switch (event.type) {
      case 'system': {
        // Lifecycle diagnostics (subtype 'init' etc.) — surface as a phase so
        // the UI shows sandbox startup instead of dead air.
        if (event.subtype === 'init') w.setPhase('claude session starting');
        break;
      }
      case 'assistant': {
        const blocks = event.message?.content;
        if (!Array.isArray(blocks)) break;
        for (const block of blocks) {
          if (block?.type === 'text' && block.text) {
            streamed += `${block.text}`;
            w.delta(`${block.text}`);
          } else if (block?.type === 'tool_use') {
            const id = `${block.id || ''}`;
            const name = `${block.name || 'tool'}`;
            toolNames.set(id, name);
            w.toolCall({ id, name, args: JSON.stringify(block.input ?? {}) });
          }
        }
        break;
      }
      case 'user': {
        // Tool results echo back as user-role events in the stream-json wire.
        const blocks = event.message?.content;
        if (!Array.isArray(blocks)) break;
        for (const block of blocks) {
          if (block?.type === 'tool_result') {
            const id = `${block.tool_use_id || ''}`;
            w.toolResult({
              id,
              name: toolNames.get(id) || 'tool',
              result: renderToolResultText(block.content),
            });
          }
        }
        break;
      }
      case 'result': {
        if (typeof event.result === 'string' && event.result !== '') {
          resultText = event.result;
        }
        if (event.usage && typeof event.usage === 'object') {
          usage = {
            inputTokens: Number(event.usage.input_tokens) || 0,
            outputTokens: Number(event.usage.output_tokens) || 0,
          };
        }
        if (event.is_error) {
          // A failed turn (subtype error_max_turns / error_during_execution,
          // or a claude-side error) must not read as success: `result` is
          // often absent on these, so the turn would otherwise finish with
          // whatever text happened to stream and be persisted as a normal
          // assistant reply. Record it; runClaudeTurn raises it.
          errorReason =
            resultText ||
            (typeof event.subtype === 'string' && event.subtype) ||
            'claude reported an error';
        }
        break;
      }
      default:
      // Unknown event types (future CLI versions) are ignored, not fatal.
    }
  };

  const finish = () =>
    harden({
      finalText: resultText !== undefined ? resultText : streamed,
      usage,
      errorReason,
    });

  return harden({ handle, finish });
};
harden(makeClaudeEventTranslator);

/**
 * Run one turn against a ClaudeClient: send the prompt, stream the reply
 * events through `writer`, and resolve with the final text and token usage
 * once the CLI turn completes.
 *
 * The reader's in-band terminals map to outcomes: `{ type: 'end' }` resolves
 * the turn; `{ type: 'abort', reason }` rejects it (the caller aborts the
 * writer). When `signal` fires first, the reader is closed — killing the
 * in-flight `claude -p` — and the turn resolves quietly with whatever text
 * had streamed (the caller checks `signal.aborted` and discards).
 *
 * @param {object} options
 * @param {any} options.client - ClaudeClient capability (may be remote).
 * @param {string} options.text - Assembled user message.
 * @param {object} options.writer - makeReplyChannel writer.
 * @param {AbortSignal} [options.signal]
 * @param {string} [options.model] - Optional model override for this turn.
 * @returns {Promise<{
 *   finalContent: string,
 *   usage: { inputTokens: number, outputTokens: number } | undefined,
 * }>}
 */
export const runClaudeTurn = async ({
  client,
  text,
  writer,
  signal,
  model,
}) => {
  const translator = makeClaudeEventTranslator(writer);
  const reader = await E(client).send(text, model ? { model } : {});
  const iterator = iterateReader(/** @type {any} */ (reader));
  const onAbort = () => {
    // Close the CLI reader: the responder's close watcher fires its onClose,
    // killing the in-flight `claude -p` process in the sandbox.
    iterator.return().catch(() => {});
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    for await (const rawEvent of iterator) {
      // stream-json events are opaque records on the wire; the translator is
      // the only place that knows their shape.
      const event = /** @type {any} */ (rawEvent);
      if (event?.type === 'end') break;
      if (event?.type === 'abort') {
        throw Error(`${event.reason || 'claude turn aborted'}`);
      }
      translator.handle(event);
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
  }
  const { finalText, usage, errorReason } = translator.finish();
  if (errorReason !== undefined && !signal?.aborted) {
    // The CLI reported a failed turn. Raise it so the caller aborts the reply
    // wire rather than persisting a partial turn as a successful answer — the
    // same outcome the API path produces when a provider call throws.
    throw Error(`claude turn failed: ${errorReason}`);
  }
  return harden({ finalContent: finalText, usage });
};
harden(runClaudeTurn);
