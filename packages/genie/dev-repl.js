#!/usr/bin/env node
// @ts-check
/* global process */
/* eslint-disable no-await-in-loop */

/**
 * Genie Development REPL
 *
 * A simple command-line REPL that runs the @endo/genie agent outside the Endo
 * daemon, for easier development, debugging, and testing.
 *
 * Instead of requiring daemon powers (mailbox, guest inbox, etc.), this
 * harness wires up the agent directly with real tool implementations and
 * a readline-based interactive loop.
 *
 * Usage:
 *   node dev-repl.js [-m provider/modelId] [-w /path] [--no-tools] [-v] [-s substring|fts5] [--quiet-background]
 *   node dev-repl.js -c "prompt text" [-m provider/modelId] [-w /path]
 *
 * Flags:
 *   --quiet-background   Suppress automatic observer/reflector event
 *                        output in the REPL (use the `.background on`
 *                        dot-command to re-enable at runtime).
 *
 * Environment:
 *   ${provider}_API_KEY — Required by some providers
 */

// SES harden polyfill — must come before any @endo imports.
// Imported as a side-effect module so it runs before ES module graph evaluation.
import '@endo/init/debug.js';

import { createRequire } from 'module';
import readline, { createInterface } from 'readline';
/** @import { Interface as ReadlineInterface } from 'readline' */

import { registerBuiltInApiProviders } from '@mariozechner/pi-ai';
/** @import { Agent as PiAgent } from '@mariozechner/pi-agent-core' */

import {
  buildGenieTools,
  BUILTIN_HELP_DESCRIPTIONS,
  DEFAULT_MODEL_STRING,
  formatHelpLines,
  makeBuiltinSpecials,
  makeGenieAgents,
  makeSpecialsDispatcher,
  runAgentRound,
  runGenieLoop,
} from './src/index.js';

/** @import { SpecialsIO } from './src/loop/builtin-specials.js' */
/** @import { SpecialHandler } from './src/loop/specials.js' */
/** @import { GenieIO, InboundPrompt } from './src/loop/io.js' */
/** @import { AgentError, ChatEvent } from './src/agent/index.js' */
import { makeFTS5Backend } from './src/tools/fts5-backend.js';
import { initWorkspace, isWorkspace } from './src/workspace/init.js';

// `createRequire` avoids the experimental-flag / assertion-style JSON import
// syntax and works uniformly under @endo/init's SES shim.
const { version: GENIE_VERSION } = /** @type {{ version: string }} */ (
  createRequire(import.meta.url)('./package.json')
);

/**
 * @param {never} nope
 * @param {string} wat
 */
function inconceivable(nope, wat) {
  throw new Error(`inconceivable ${wat}: ${nope}`);
}

// Register built-in API providers so getModel lookups work for known providers
registerBuiltInApiProviders();

/** @param {AgentError} err */
function* errorLines(err) {
  const { cause, message } = err;
  yield* `${message} — ${cause}`.split(/\n/);
  if (cause.stack) {
    for (const line of cause.stack.split(/\n/)) {
      yield `  ${line}`;
    }
  } else {
    yield '  <STACK REDACTED>';
  }
}

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const ITALIC = '\x1b[3m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// Background sub-agent event printer
// ---------------------------------------------------------------------------

/**
 * @param {string} s
 * @param {number} [n]
 * @returns {string}
 */
const truncatePreview = (s, n = 80) => {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

/**
 * Render a single `ChatEvent` from a sub-agent (observer / reflector)
 * into a single-line preview terminated with `\n`, prefixed with a
 * dim `[label]` tag so the user can tell which sub-agent emitted it.
 *
 * Streaming deltas (`assistant_delta`, `thinking_delta`) and the echoed
 * `UserMessage` are intentionally dropped — only high-signal events
 * show up in the background stream.
 *
 * @param {ChatEvent} event
 * @param {string} label
 * @returns {string} Rendered chunk (may be empty).
 */
const renderBackgroundEvent = (event, label) => {
  const prefix = `${DIM}[${label}]${RESET} `;
  switch (event.type) {
    case 'ToolCallStart': {
      let argsPreview = '(…)';
      try {
        argsPreview = truncatePreview(JSON.stringify(event.args), 80);
      } catch {
        // pass
      }
      return `${prefix}${YELLOW}⚡ ${event.toolName}${RESET} ${DIM}${argsPreview}${RESET}\n`;
    }
    case 'ToolCallEnd': {
      if ('error' in event) {
        return `${prefix}${RED}✗ failed: ${event.error}${RESET}\n`;
      }
      return `${prefix}${GREEN}✓ done${RESET}\n`;
    }
    case 'Thinking': {
      if (event.redacted) {
        return `${prefix}${DIM}${ITALIC}${MAGENTA}💭 (thinking redacted)${RESET}\n`;
      }
      if (event.role === 'thinking') {
        return `${prefix}${DIM}${ITALIC}${MAGENTA}💭 ${truncatePreview(event.content, 120)}${RESET}\n`;
      }
      return '';
    }
    case 'Message': {
      if (event.role === 'assistant' && event.content) {
        return `${prefix}${BOLD}${CYAN}${label}>${RESET} ${event.content}\n`;
      }
      return '';
    }
    case 'Error': {
      return Array.from(errorLines(event)).join('');
    }
    case 'UserMessage':
      // Sub-agent prompts are noisy and duplicate the outer context — skip.
      return '';
    default:
      return '';
  }
};

/**
 * @typedef {object} BackgroundPrinterOptions
 * @property {ReadlineInterface} [rl] - Optional readline
 *   interface used to clear & redraw the prompt when events print
 *   while the user is idle at the prompt.
 * @property {boolean} [quiet] - Start in "quiet" mode (events are
 *   silently dropped rather than printed).  Can be toggled at runtime
 *   via `setQuiet()`.
 */

/**
 * @typedef {object} BackgroundPrinter
 * @property {() => void} setBusy - Transition to "busy" state.
 *   Events arriving from now on are queued instead of printed.
 * @property {() => void} setIdle - Transition to "idle" state and
 *   flush any queued events.
 * @property {(q: boolean) => void} setQuiet - Toggle quiet mode.
 * @property {() => boolean} isQuiet - Current quiet-mode flag.
 * @property {(label: string) => void} mute - Temporarily drop events
 *   for the given label (used when a dot-command is driving the
 *   sub-agent's stream directly, to avoid duplicate output).
 * @property {(label: string) => void} unmute - Resume forwarding
 *   events for the given label.
 * @property {(subagent: { subscribe: (handler: (event: ChatEvent) => void) => () => void }, label: string) => () => void} subscribe
 *   - Subscribe to a sub-agent's event stream under the given label,
 *   returning an unsubscribe function.
 */

/**
 * Create a background-event printer that routes observer / reflector
 * events to stdout with readline-aware coexistence.
 *
 * See `TADA/53_genie_obs_bg_stream.md` § "Design notes"; briefly:
 * - `idle` — the REPL is waiting at the readline prompt.
 *   Events print inline: we clear the current prompt line, write the event
 *   preview, then ask readline to redraw the prompt (preserving any
 *   partially-typed input).
 * - `busy` — the main agent is streaming or a dot-command is actively
 *   rendering output.  Events are queued and flushed when the REPL returns to
 *   idle.
 *
 * A `mute(label)` hook lets the REPL suppress a sub-agent's background output
 * while a caller-driven dot-command is consuming the same events via the
 * returned iterable — otherwise the user would see them twice.
 *
 * @param {BackgroundPrinterOptions} [options]
 * @returns {BackgroundPrinter}
 */
const makeBackgroundPrinter = ({ rl, quiet = false } = {}) => {
  /** @type {'idle' | 'busy'} */
  let state = 'busy'; // start busy until the REPL signals idle

  /** @type {Set<string>} */
  const muted = new Set();

  /** @type {Array<{ label: string, event: ChatEvent }>} */
  const queue = [];

  /**
   * Redraw the readline prompt + input buffer after writing background text.
   * Uses `_refreshLine()` when available
   * (private but widely used in Node REPL tooling)
   * and falls back to `rl.prompt(true)` otherwise.
   */
  const refreshPrompt = () => {
    if (!rl) return;
    /** @type {any} */
    const anyRl = rl;
    // eslint-disable-next-line no-underscore-dangle
    if (typeof anyRl._refreshLine === 'function') {
      // eslint-disable-next-line no-underscore-dangle
      anyRl._refreshLine();
    } else {
      rl.prompt(true);
    }
  };

  /**
   * Write background text to stdout,
   * taking care not to corrupt the readline prompt line.
   * In idle state we pause readline,
   * clear the current line, write the text,
   * resume readline, and redraw the prompt.
   * In busy state we just append to stdout —
   * the consumer has already set that state,
   * so nothing is being drawn below.
   *
   * @param {string} text
   */
  const writeChunks = text => {
    if (!text) return;
    if (rl && state === 'idle') {
      rl.pause();
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      process.stdout.write(text);
      rl.resume();
      refreshPrompt();
    } else {
      process.stdout.write(text);
    }
  };

  const flush = () => {
    while (queue.length) {
      const item = /** @type {{ label: string, event: ChatEvent }} */ (
        queue.shift()
      );
      if (muted.has(item.label)) {
        // eslint-disable-next-line no-continue
        continue;
      }
      const text = renderBackgroundEvent(item.event, item.label);
      if (text) writeChunks(text);
    }
  };

  /**
   * @param {string} label
   * @param {ChatEvent} event
   */
  const enqueue = (label, event) => {
    if (quiet || muted.has(label)) return;
    if (state === 'idle') {
      const text = renderBackgroundEvent(event, label);
      if (text) writeChunks(text);
    } else {
      queue.push({ label, event });
    }
  };

  return harden({
    setBusy: () => {
      state = 'busy';
    },
    setIdle: () => {
      state = 'idle';
      flush();
    },
    setQuiet: q => {
      quiet = q;
    },
    isQuiet: () => quiet,
    mute: label => {
      muted.add(label);
    },
    unmute: label => {
      muted.delete(label);
    },
    subscribe: (subagent, label) =>
      subagent.subscribe(
        /** @param {ChatEvent} event */ event => enqueue(label, event),
      ),
  });
};
harden(makeBackgroundPrinter);

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/**
 * Get the value of a CLI flag, supporting both long and short forms.
 *
 * @param {string[]} args
 * @param {string} longFlag
 * @param {string} [shortFlag]
 * @returns {string | undefined}
 */
function getFlag(args, longFlag, shortFlag) {
  let idx = args.indexOf(longFlag);
  if (idx === -1 && shortFlag) {
    idx = args.indexOf(shortFlag);
  }
  if (idx === -1) return undefined;
  return args[idx + 1];
}

/**
 * Check if a boolean flag is present (long or short form).
 *
 * @param {string[]} args
 * @param {string} longFlag
 * @param {string} [shortFlag]
 * @returns {boolean}
 */
function hasFlag(args, longFlag, shortFlag) {
  return (
    args.includes(longFlag) || (shortFlag ? args.includes(shortFlag) : false)
  );
}

// ---------------------------------------------------------------------------
// Prompt runner (async generator)
// ---------------------------------------------------------------------------

/**
 * Render a stream of ChatEvent objects into ANSI-formatted output chunks.
 *
 * Pure rendering: takes an async iterable of events and yields display
 * strings.  Returns the assistant's final text reply (empty string when
 * no assistant message was received).
 *
 * @param {AsyncIterable<ChatEvent>} events
 * @param {object} [options]
 * @param {boolean} [options.verbose]
 * @param {boolean} [options.echoUser]
 * @param {string} [options.label] - Label prefix for the assistant's
 *   final Message line (default `'genie'`).  Use e.g. `'observer'` to
 *   distinguish sub-agent output in the REPL.
 * @returns {AsyncGenerator<string, string>} Yields output chunks; returns
 *   the assistant's final text reply (empty string on error).
 */
async function* runAgentEvents(
  events,
  { verbose = false, echoUser = false, label = 'genie' } = {},
) {
  let assistantText = '';
  let streamStarted = false;
  let thinkingStarted = false;

  for await (const event of events) {
    switch (event.type) {
      case 'UserMessage': {
        const { content } = event;
        if (echoUser) {
          yield `${BOLD}${GREEN}you>${RESET} ${content}\n`;
        }
        if (verbose) {
          yield `${DIM}[debug] Sending prompt (${content.length} chars)${RESET}\n`;
        }
        break;
      }

      case 'ToolCallStart': {
        if (streamStarted) {
          yield '\n';
          streamStarted = false;
        }
        const argsPreview = (() => {
          try {
            const s = JSON.stringify(event.args);
            return s.length > 100 ? `${s.slice(0, 100)}…` : s;
          } catch {
            return '(…)';
          }
        })();
        yield `${YELLOW}⚡ ${event.toolName}${RESET} ${DIM}${argsPreview}${RESET}\n`;
        break;
      }

      case 'ToolCallEnd': {
        if ('error' in event) {
          yield `  ${RED}✗ failed: ${event.error}${RESET}\n`;
        } else {
          let preview = '';
          if (verbose) {
            const { result } = event;
            if (result) {
              try {
                const s =
                  typeof result === 'string' ? result : JSON.stringify(result);
                preview = ` ${DIM}${s.length > 200 ? `${s.slice(0, 200)}...` : s}${RESET}`;
              } catch (err) {
                preview = ` ${RED}Failed to format result: ${err.message} (type: ${typeof event.result}) ${RESET}`;
              }
            }
          } else {
            preview = ` ${DIM}${RESET}`;
          }
          yield `  ${GREEN}✓ done${RESET}${preview}\n`;
        }

        break;
      }

      case 'Thinking': {
        if (event.redacted) {
          if (!thinkingStarted) {
            yield `${DIM}${ITALIC}${MAGENTA}(thinking redacted)${RESET}\n`;
          }
          break;
        }
        if (event.role === 'thinking') {
          // Complete thinking block (from message_start)
          if (thinkingStarted) {
            yield `${RESET}\n`;
            thinkingStarted = false;
          }
          yield `${DIM}${ITALIC}${MAGENTA}💭 ${event.content}${RESET}\n`;
        } else if (event.role === 'thinking_delta') {
          // Streaming thinking delta
          if (!thinkingStarted) {
            yield `${DIM}${ITALIC}${MAGENTA}💭 `;
            thinkingStarted = true;
          }
          yield event.content;
        }
        break;
      }

      case 'Message': {
        if (event.role === 'assistant' && event.content) {
          assistantText = event.content;
          if (thinkingStarted) {
            yield `${RESET}\n`;
            thinkingStarted = false;
          }
          if (streamStarted) {
            yield '\n';
            streamStarted = false;
          }

          if (verbose) {
            yield `${DIM}[debug] Response received (${assistantText.length} chars)${RESET}`;
          }

          yield '\n';
          yield `${BOLD}${CYAN}${label}>${RESET} ${event.content}\n`;
          yield '\n';
        } else if (event.role === 'assistant_delta') {
          if (thinkingStarted) {
            yield `${RESET}\n`;
            thinkingStarted = false;
          }
          if (!streamStarted) {
            yield `${DIM}`;
            streamStarted = true;
          }
          yield event.content;
        }
        break;
      }

      case 'Error': {
        if (streamStarted) {
          yield `${RESET}\n`;
          streamStarted = false;
        }
        for (const line of errorLines(event)) {
          yield `${RED}[error] ${line}${RESET}\n`;
        }
        break;
      }

      default: {
        inconceivable(event, 'agent chat event');
      }
    }
  }

  if (thinkingStarted) {
    yield `${RESET}\n`;
  }
  if (streamStarted) {
    yield `${RESET}\n`;
  }

  return assistantText;
}

/**
 * Run a single prompt through the agent, yielding output chunks as strings.
 * The caller is responsible for writing yielded chunks to the desired output.
 *
 * Mutates `messages` as a side-effect, appending the user prompt
 * and the assistant's final reply.
 *
 * @param {PiAgent} piAgent
 * @param {string} prompt
 * @param {object} [options]
 * @param {Array<{ role: string, content: string }>} [options.messages]
 * @param {boolean} [options.verbose]
 * @param {boolean} [options.echoUser]
 * @returns {AsyncGenerator<string, string>} Yields output chunks; returns
 *   the assistant's final text reply (empty string on error).
 */
async function* runPrompt(
  piAgent,
  prompt,
  { messages = [], verbose = false, echoUser = false } = {},
) {
  const events = runAgentRound(piAgent, prompt);

  /**
   * Tap the event stream to collect messages as a side-effect.
   *
   * @param {AsyncIterable<ChatEvent>} source
   */
  async function* collectMessages(source) {
    for await (const event of source) {
      if (event.type === 'UserMessage') {
        const { content } = event;
        messages.push({ role: 'user', content });
      }
      yield event;
    }
  }

  const assistantText = yield* runAgentEvents(collectMessages(events), {
    verbose,
    echoUser,
  });

  if (assistantText) {
    messages.push({ role: 'assistant', content: assistantText });
  }

  return assistantText;
}

// ---------------------------------------------------------------------------
// Readline prompt source
// ---------------------------------------------------------------------------

/**
 * @typedef {object} RunPromptsOptions
 * @property {ReadlineInterface} [rl] - Externally
 *   supplied readline interface.  If omitted, a default one is
 *   created bound to stdin/stdout.
 * @property {() => void} [onBusy] - Called after a prompt is
 *   received but before it is yielded for processing.
 * @property {() => void} [onIdle] - Called immediately before
 *   each `await nextPrompt()` (i.e. when the REPL is about to wait
 *   at the prompt).
 */

/**
 * Async iterable of trimmed, non-empty readline lines.
 *
 * Idle / busy transitions are no longer signalled here — `runGenieLoop`
 * drives those via the `GenieIO.onIdle` / `onBusy` adapter hooks — but
 * this generator still pauses and resumes the underlying readline
 * interface around each yielded prompt so stdin input cannot race the
 * dispatch of the current prompt.
 *
 * @param {RunPromptsOptions} [options]
 * @returns {AsyncGenerator<string>}
 */
async function* readPrompts({ rl: providedRl } = {}) {
  await Promise.resolve();
  const rl =
    providedRl ||
    createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${BOLD}${GREEN}you>${RESET} `,
    });

  let closed = false;
  rl.once('close', () => {
    closed = true;
  });

  /** @returns {Promise<string|null>} */
  const nextPrompt = () =>
    new Promise(resolve => {
      if (closed) {
        resolve(null);
        return;
      }

      rl.prompt();

      /** @param {string} line */
      const onLine = line => {
        rl.removeListener('close', onClose);
        const prompt = line.trim();
        if (!prompt) {
          resolve(nextPrompt());
          return;
        }
        resolve(prompt);
      };

      const onClose = () => {
        rl.removeListener('line', onLine);
        closed = true;
        resolve(null);
      };

      rl.once('line', onLine);
      rl.once('close', onClose);
    });

  for (;;) {
    const prompt = await nextPrompt();
    if (prompt === null) {
      break;
    }

    // Pause readline while we process
    rl.pause();
    yield prompt;
    rl.resume();
  }
}

/**
 * Adapt `readPrompts` into the `InboundPrompt` stream consumed by
 * `runGenieLoop`.
 *
 * Each readline line becomes an `InboundPrompt` with a monotonically
 * increasing numeric id.
 *
 * The shared loop falls back to `specials.isSpecial(text)` to distinguish
 * dot-commands from user chat turns, so `kind` is left unset.
 *
 * @param {object} options
 * @param {import('readline').Interface} options.rl
 * @returns {AsyncGenerator<InboundPrompt>}
 */
async function* readInboundPrompts({ rl }) {
  let seq = 0;
  for await (const line of readPrompts({ rl })) {
    seq += 1;
    yield harden({ id: seq, text: line });
  }
}

// ---------------------------------------------------------------------------
// Main — thin entry point that wires IO
// ---------------------------------------------------------------------------

/** @param {string[]} args */
async function* runMain(args) {
  await Promise.resolve();

  const command = getFlag(args, '--command', '-c');
  const modelArg = getFlag(args, '--model', '-m');
  const noTools = hasFlag(args, '--no-tools');
  const verbose = hasFlag(args, '--verbose', '-v');
  const quietBackground = hasFlag(args, '--quiet-background');
  const searchArg = getFlag(args, '--search', '-s') || 'substring';

  // Stabilise workspaceArg => workspaceDir,
  // but reject implicit uninitialized cwd.
  let workspaceArg = getFlag(args, '--workspace', '-w');
  if (!workspaceArg) {
    workspaceArg = process.cwd();
    if (!(await isWorkspace(workspaceArg))) {
      yield `! Implicit workspace from cwd:${workspaceArg} is not a genie workspace`;
      yield `! Pass \`--workspace "${workspaceArg}"\` if this was intentional`;
      return;
    }
  }
  const workspaceDir = workspaceArg;

  // Seed the workspace from the shipped template on first run.
  if (await initWorkspace(workspaceDir)) {
    yield `Initialized genie workspace in ${workspaceDir}`;
  }

  /** @type {import('./src/tools/memory.js').SearchBackend | undefined} */
  let searchBackend;
  if (searchArg === 'fts5') {
    searchBackend = makeFTS5Backend({ dbDir: workspaceDir });
  } else if (searchArg === 'substring') {
    searchBackend = undefined; // uses default substring backend
  } else {
    throw new Error(
      `Unknown search backend: ${searchArg} (expected "substring" or "fts5")`,
    );
  }

  // Delegate registry construction to the shared helper.
  // The dev-repl opts into the full set (including the `exec` and `git`
  // example attenuations); `--no-tools` collapses to an empty include list.
  const genieTools = buildGenieTools({
    workspaceDir,
    searchBackend,
    include: noTools
      ? []
      : ['bash', 'exec', 'git', 'files', 'memory', 'webFetch', 'webSearch'],
  });

  const { tools, memoryTools } = genieTools;
  const memoryIndexing = memoryTools ? memoryTools.indexing : Promise.resolve();

  // Assemble the shared agent pack.
  const { piAgent, heartbeatAgent, observer, reflector } =
    await makeGenieAgents({
      hostname: 'dev-repl',
      workspaceDir,
      tools: genieTools,
      config: { model: modelArg },
    });

  function* describe() {
    const modelName = modelArg || `default (${DEFAULT_MODEL_STRING})`;
    const toolNames = Object.keys(tools);
    yield `${DIM}Model:     ${modelName}${RESET}\n`;
    yield `${DIM}Workspace: ${workspaceDir}${RESET}\n`;
    yield `${DIM}Search:    ${searchArg}${RESET}\n`;
    const toolSummary =
      toolNames.length < 1 ? '-- No Tools --' : toolNames.join(', ');
    yield `${DIM}Tools:     ${toolSummary}${RESET}\n`;
  }

  async function* settle() {
    yield `${DIM}Waiting for memory index to settle...${RESET}\n`;
    await memoryIndexing;
  }

  /** @type {Array<{ role: string, content: string }>} */
  const messages = [];
  // TODO persist-and-restore conversation history across runs.
  //
  // The local `messages` array collects user/assistant turns for the
  // current REPL session (cleared by `.clear`).  A real implementation
  // needs to:
  //   1. Load prior turns from the workspace (e.g. `<workspaceDir>/.genie/dev-repl/messages.json`).
  //   2. Seed `piAgent.state.messages` so the model has the prior context.
  //   3. Persist on exit / after each prompt so crashes don't lose state.
  // The observer / reflector memory systems provide the long-term
  // recollection, so this would just be short-term session replay.

  // --command / -c : one-shot mode — run a single prompt and return.
  if (command) {
    if (verbose) {
      yield* describe();
    }
    yield* settle();
    yield* runPrompt(piAgent, command, { messages, verbose, echoUser: true });
  } else {
    const title = `Genie Dev REPL  v${GENIE_VERSION}`;
    const bannerMinWidth = 40;
    const ruleWidth = Math.max(title.length + 2, bannerMinWidth - 2);
    const rule = '═'.repeat(ruleWidth);
    const titlePad = (ruleWidth - title.length) / 2;
    const head = `${' '.repeat(Math.floor(titlePad))}${title}${' '.repeat(Math.ceil(titlePad))}`;
    yield `${BOLD}${CYAN}╔${rule}╗${RESET}\n`;
    yield `${BOLD}${CYAN}║${head}║${RESET}\n`;
    yield `${BOLD}${CYAN}╚${rule}╝${RESET}\n`;
    yield '\n';
    yield* describe();
    yield '\n';
    yield* settle();
    yield `${DIM}Type your message and press Enter. Use Ctrl-C or type ".exit" to quit.${RESET}\n`;
    yield '\n';

    // ── Background printer / subscriber wiring ─────────────────────
    // The shared readline interface is owned by readPrompts but we
    // create it here so the background printer can clear/redraw the
    // prompt line when sub-agent events arrive while the user is
    // idle at the prompt.
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${BOLD}${GREEN}you>${RESET} `,
    });
    const backgroundPrinter = makeBackgroundPrinter({
      rl,
      quiet: quietBackground,
    });
    if (observer) backgroundPrinter.subscribe(observer, 'observer');
    if (reflector) backgroundPrinter.subscribe(reflector, 'reflector');

    // ── Specials dispatcher ────────────────────────────────────────
    // Built-in handlers come from the shared factory so the dev-repl and the
    // daemon plugin share one source of truth for
    // heartbeat/observe/reflect/help/tools/clear/exit.
    // The dev-repl mixes in its own `background` toggle and a `quit` alias for
    // `.exit`.
    let exitRequested = false;
    /** @type {SpecialsIO<string>} */
    const io = harden({
      info: msg => `${DIM}${msg}${RESET}\n`,
      notice: msg => `${DIM}${msg}${RESET}\n`,
      warn: msg => `${YELLOW}${msg}${RESET}\n`,
      error: msg => `${RED}${msg}${RESET}\n`,
      success: msg => `${GREEN}${msg}${RESET}\n`,
      renderEvents: (events, { label = 'genie' } = {}) =>
        runAgentEvents(events, {
          verbose,
          label,
          echoUser: label === 'heartbeat',
        }),
      muteBackground: label => backgroundPrinter.mute(label),
      unmuteBackground: label => backgroundPrinter.unmute(label),
      clearHistory: () => {
        messages.length = 0;
      },
      requestExit: () => {
        exitRequested = true;
      },
      listToolNames: () => Object.keys(tools),
      listHelpLines: () =>
        formatHelpLines({
          prefix: '.',
          // Order matches the pre-refactor listing; filtered implicitly
          // against `BUILTIN_HELP_DESCRIPTIONS` so unknown names are
          // skipped rather than rendered blank.
          commands: [
            'exit',
            'clear',
            'tools',
            'help',
            'heartbeat',
            'observe',
            'reflect',
          ].filter(name => name in BUILTIN_HELP_DESCRIPTIONS),
          extras: [
            [
              '.background on|off|status',
              'toggle automatic sub-agent event printing',
            ],
          ],
        }),
    });

    const builtins = makeBuiltinSpecials({
      agents: { piAgent, heartbeatAgent, observer, reflector },
      workspaceDir,
      io,
    });

    /** @type {SpecialHandler<string>} */
    const backgroundHandler = async function* backgroundHandlerImpl(tail) {
      const arg = tail[0] ?? '';
      if (arg === '' || arg === 'status') {
        const state = backgroundPrinter.isQuiet() ? 'off' : 'on';
        yield `${DIM}background event printing: ${state}.${RESET}\n`;
      } else if (arg === 'on') {
        backgroundPrinter.setQuiet(false);
        yield `${DIM}background event printing: on.${RESET}\n`;
      } else if (arg === 'off') {
        backgroundPrinter.setQuiet(true);
        yield `${DIM}background event printing: off.${RESET}\n`;
      } else {
        yield `${RED}usage: .background on|off|status${RESET}\n`;
      }
    };

    const dispatcher = makeSpecialsDispatcher({
      prefix: '.',
      handlers: harden({
        ...builtins,
        quit: builtins.exit,
        background: backgroundHandler,
      }),
      onUnknown: async function* onUnknown([unkHead]) {
        yield `${RED}Unknown command: .${unkHead}${RESET}\n`;
        yield `${DIM}Type .help for a list of commands.${RESET}\n`;
      },
    });

    /** @type {GenieIO<string>} */
    const genieIo = harden({
      prompts: () => readInboundPrompts({ rl }),
      write: chunk => {
        process.stdout.write(chunk);
      },
      onIdle: () => backgroundPrinter.setIdle(),
      onBusy: () => backgroundPrinter.setBusy(),
    });

    await runGenieLoop({
      agents: { piAgent, heartbeatAgent, observer, reflector },
      specials: dispatcher,
      io: genieIo,
      handlers: {
        runUserPrompt: async function* runUserPrompt(prompt) {
          yield* runPrompt(piAgent, prompt.text, { messages, verbose });
        },
        onError: async (_prompt, err) => {
          const errMsg = /** @type {Error} */ (err).message;
          process.stdout.write(`${RED}REPL error: ${errMsg}${RESET}\n`);
          if (verbose) {
            const stack = /** @type {Error} */ (err).stack;
            process.stdout.write(`${stack ?? String(err)}\n`);
          }
        },
      },
      shouldExit: () => exitRequested,
    });

    yield `\n${DIM}Goodbye.${RESET}\n`;
  }
}

/** @param {string[]} args */
async function main(args) {
  for await (const chunk of runMain(args)) {
    process.stdout.write(chunk);
  }
  return 0;
}

main(process.argv.slice(2))
  .catch(err => {
    process.stdout.write(`${RED}Main Error: ${err.message}${RESET}`);
    console.error(err);
    return 1;
  })
  .then(code => process.exit(code));
