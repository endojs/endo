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

// eslint-disable-next-line import/no-unresolved
import {
  runHeartbeat,
  HeartbeatStatus,
  makePiAgent,
  runAgentRound,
  DEFAULT_MODEL_STRING,
} from '@endo/genie';
import { registerBuiltInApiProviders } from '@mariozechner/pi-ai';
/** @import { Agent as PiAgent } from '@mariozechner/pi-agent-core' */

/** @import {ChatEvent} from './src/agent/index.js' */
/** @import { Tool } from './src/tools/common.js' */
/** @import { HeartbeatEvent } from './src/heartbeat/index.js' */
import { bash, makeCommandTool } from './src/tools/command.js';
import { makeFileTools } from './src/tools/filesystem.js';
import { makeMemoryTools } from './src/tools/memory.js';
import { makeFTS5Backend } from './src/tools/fts5-backend.js';
import { webFetch } from './src/tools/web-fetch.js';
import { webSearch } from './src/tools/web-search.js';
import { initWorkspace, isWorkspace } from './src/workspace/init.js';

// `createRequire` avoids the experimental-flag / assertion-style JSON import
// syntax and works uniformly under @endo/init's SES shim.
const { version: GENIE_VERSION } =
  /** @type {{ version: string }} */ (
    createRequire(import.meta.url)('./package.json')
  );

/**
 * @template T, R
 * @param {(r: R) => void} have
 * @param {AsyncIterable<T, R>} it
 */
async function* collectIt(have, it) {
  const r = yield* it;
  have(r);
}

/**
 * @param {never} nope
 * @param {string} wat
 */
function inconceivable(nope, wat) {
  throw new Error(`inconceivable ${wat}: ${nope}`);
}

// Register built-in API providers so getModel lookups work for known providers
registerBuiltInApiProviders();

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
      return `${prefix}${RED}[error] ${event.message} — ${event.cause}${RESET}\n`;
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
    if (typeof anyRl._refreshLine === 'function') {
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
      const item = /** @type {{ label: string, event: ChatEvent }} */ (queue.shift());
      if (muted.has(item.label)) continue;
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
    subscribe: (subagent, label) => subagent.subscribe(
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
 * @returns {AsyncGenerator<string, string>} Yields output chunks; returns
 *   the assistant's final text reply (empty string on error).
 */
async function* runAgentEvents(
  events,
  { verbose = false, echoUser = false } = {},
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
          yield `${BOLD}${CYAN}genie>${RESET} ${event.content}\n`;
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
        yield `${RED}[error] ${event.message} — ${event.cause}${RESET}\n`;
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
// Agent runner (async generator)
// ---------------------------------------------------------------------------

/**
 * Run the genie agent, yielding output chunks as strings.
 *
 * In one-shot mode (`options.command` is set), runs a single prompt and
 * returns. In REPL mode, iterates over `options.prompts`, handling dot-
 * commands (.help, .clear, .tools, .exit/.quit) and delegating real
 * prompts to `runPrompt`.
 *
 * @param {object} options
 * @param {PiAgent} options.piAgent
 * @param {Record<string, Tool>} options.tools
 * @param {boolean} options.verbose - Enable debug output.
 * @param {Array<{ role: string, content: string }>} [options.messages]
 * @param {Record<string, (tail: string[]) => AsyncIterable<string>>} [options.specials] - special builtin commands like .heartbeat
 * @param {AsyncIterable<string>} options.prompts - Async iterable of user prompts for REPL mode. Ignored in one-shot (command) mode.
 * @returns {AsyncGenerator<string>}
 */
async function* runAgent({
  piAgent,
  tools,
  verbose,
  specials = {},
  prompts,
  messages = [],
}) {
  for await (const prompt of prompts) {
    if (prompt === '.exit' || prompt === '.quit') {
      yield `${DIM}Goodbye.${RESET}\n`;
      break;

    } else if (prompt === '.help') {
      // TODO eject
      yield `${DIM}Commands:${RESET}\n`;
      yield `${DIM}  .exit                     — quit the REPL${RESET}\n`;
      yield `${DIM}  .clear                    — clear conversation history${RESET}\n`;
      yield `${DIM}  .tools                    — list available tools${RESET}\n`;
      yield `${DIM}  .help                     — show this help${RESET}\n`;
      yield `${DIM}  .heartbeat                — run a heartbeat cycle${RESET}\n`;
      yield `${DIM}  .background on|off|status — toggle automatic sub-agent event printing${RESET}\n`;

    } else if (prompt === '.clear') {
      // TODO eject
      messages.length = 0;
      yield `${DIM}Conversation history cleared.${RESET}\n`;

    } else if (prompt === '.tools') {
      // TODO eject
      const toolNames = Object.keys(tools);
      if (!toolNames.length) {
        yield `${DIM}-- No Tools --${RESET}\n`;
      } else {
        for (const name of toolNames) {
          yield `${DIM}  • ${name}${RESET}\n`;
        }
      }

    } else if (prompt.startsWith('.')) {
      const [head, ...tail] = prompt.slice(1).split(/\s+/);
      if (head in specials) {
        yield* specials[head](tail);
      } else {
        yield `${RED}Unknown command: ${prompt}${RESET}\n`;
        yield `${DIM}Type .help for a list of commands.${RESET}\n`;
      }
    } else {
      try {
        yield* runPrompt(piAgent, prompt, { messages, verbose });
      } catch (err) {
        yield `${RED}REPL error: ${err.message}${RESET}\n`;
        if (verbose) {
          yield `${err.stack}\n`;
        }
      }
    }
  }

  yield `\n${DIM}Goodbye.${RESET}\n`;
}

// ---------------------------------------------------------------------------
// Readline prompt source
// ---------------------------------------------------------------------------

/**
 * Async iterable of user prompts driven by a readline interface.
 *
 * Accepts optional `onIdle` / `onBusy` callbacks so the REPL can
 * signal a background-event printer when it is safe to flush queued
 * output (idle at the prompt) versus when events must be buffered
 * (prompt in flight).
 *
 * @param {object} [options]
 * @param {ReadlineInterface} [options.rl] - Externally
 *   supplied readline interface.  If omitted, a default one is
 *   created bound to stdin/stdout.
 * @param {() => void} [options.onBusy] - Called after a prompt is
 *   received but before it is yielded for processing.
 * @param {() => void} [options.onIdle] - Called immediately before
 *   each `await nextPrompt()` (i.e. when the REPL is about to wait
 *   at the prompt).
 */
async function* readPrompts({
  rl: providedRl,
  onBusy,
  onIdle,
} = {}) {
  const rl = providedRl || createInterface({
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

  for (; ;) {
    if (onIdle) onIdle();
    const prompt = await nextPrompt();
    if (prompt === null) {
      break;
    }
    if (onBusy) onBusy();

    // Pause readline while we process
    rl.pause();
    yield prompt;
    rl.resume();
  }
}

// ---------------------------------------------------------------------------
// Main — thin entry point that wires IO
// ---------------------------------------------------------------------------

/** @param {string[]} args */
async function* runMain(args) {
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
    if (! await isWorkspace(workspaceArg)) {
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

  const fileTools = makeFileTools({ root: workspaceDir });
  const {
    indexing: memoryIndexing,
    ...memoryTools
  } = makeMemoryTools({
    root: workspaceDir,
    searchBackend,
  });

  // example of targeted command execution, rather than full bash
  const git = makeCommandTool({
    name: 'git',
    program: 'git',
    description:
      'Runs git version control commands (status, log, diff, commit, etc.).',
    allowPath: true,
    policies: [
      // eslint-disable-next-line no-shadow
      args => {
        const first = args.filter(arg => !arg.startsWith('-'))[0];
        return !(
          // ban network touching commands ; TODO moar
          (first && ['push', 'pull', 'fetch'].includes(first))
        );
      },
    ],
  });

  /**
   * @type {Record<string, Tool>} - TODO probably better as a Map<string, Tool>
   */
  const tools = noTools
    ? {}
    : {
      bash,
      git,
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

  // main chat agent
  const piAgent = await makePiAgent({
    hostname: 'dev-repl',
    currentTime: new Date().toISOString(),
    workspaceDir,
    model: modelArg,
    listTools,
    execTool,
  });

  const heartbeatAgent = await makePiAgent({
    hostname: 'dev-repl',
    currentTime: new Date().toISOString(),
    workspaceDir,
    model: modelArg,
    listTools,
    execTool,
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

    yield* runAgent({
      piAgent,
      tools,
      verbose,
      prompts: readPrompts({
        rl,
        onIdle: backgroundPrinter.setIdle,
        onBusy: backgroundPrinter.setBusy,
      }),
      messages,
      specials: {

        heartbeat: async function*(_tail) {
          yield `${DIM}Running heartbeat cycle...${RESET}\n`;

          /** @type {HeartbeatEvent|null} */
          let heartbeatEvent = null;
          try {
            yield* runAgentEvents(
              collectIt(he => { heartbeatEvent = he }, runHeartbeat({
                workspaceDir,
                piAgent: heartbeatAgent,
              })),
              {
                verbose,
                echoUser: true,
              }
            );
            if (!heartbeatEvent) {
              yield `${RED}⚠ Heartbeat failed, but did not throw?.${RESET}\n`;
            } else {
              // TODO why need the cast
              const status = /** @type {HeartbeatEvent} */(heartbeatEvent).status;
              if (status != HeartbeatStatus.Ok) {
                yield `${YELLOW}⚠ Heartbeat completed not OK: ${status}${RESET}\n`;
              } else {
                yield `${GREEN}✓ Heartbeat OK.${RESET}\n`;
              }
            }
          } catch (err) {
            yield `${RED}Heartbeat failed: ${/** @type {Error} */ (err).message}${RESET}\n`;
          }
        },

        background: async function*(tail) {
          if (!backgroundPrinter) {
            yield `${RED}background printer not available.${RESET}\n`;
            return;
          }
          const arg = tail[0] ?? '';
          if (arg === '' || arg === 'status') {
            const state = backgroundPrinter.isQuiet() ? 'off' : 'on';
            yield `${DIM}background event printing: ${state}.${RESET}\N`;
          } else if (arg === 'on') {
            backgroundPrinter.setQuiet(false);
            yield `${DIM}background event printing: on.${RESET}\n`;
          } else if (arg === 'off') {
            backgroundPrinter.setQuiet(true);
            yield `${DIM}background event printing: off.${RESET}\n`;
          } else {
            yield `${RED}usage: .background on|off|status${RESET}\n`;
          }
        },

      },
    });
  }
}

/** @param {string[]} args */
async function main(args) {
  for await (const chunk of runMain(args)) {
    process.stdout.write(chunk);
  }
  return 0;
}

process.exit(
  await main(process.argv.slice(2)).catch(err => {
    process.stdout.write(`${RED}Main Error: ${err.message}${RESET}`);
    console.error(err);
    return 1;
  }),
);
