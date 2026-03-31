#!/usr/bin/env node
// @ts-check
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
 *   node dev-repl.js [-m provider/modelId] [-w /path] [--no-tools] [-v]
 *   node dev-repl.js -c "prompt text" [-m provider/modelId] [-w /path]
 *
 * Environment:
 *   ${provider}_API_KEY — Required by some providers
 */

// SES harden polyfill — must come before any @endo imports.
// Imported as a side-effect module so it runs before ES module graph evaluation.
import '@endo/init/debug.js';

import { createInterface } from 'readline';
import { makePiAgent, runAgentRound, DEFAULT_MODEL_STRING } from '@endo/genie';
import { registerBuiltInApiProviders } from '@mariozechner/pi-ai';
/** @import { Agent as PiAgent } from '@mariozechner/pi-agent-core' */

/** @import { Tool } from './src/tools/common.js' */
import { bash, makeCommandTool } from './src/tools/command.js';
import { makeFileTools } from './src/tools/filesystem.js';
import { makeMemoryTools } from './src/tools/memory.js';
import { webFetch } from './src/tools/web-fetch.js';
import { webSearch } from './src/tools/web-search.js';

/**
 * @param {never} nope
 * @param {string} wat
 */
function inconeivable(nope, wat) {
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
  return args.includes(longFlag) || (shortFlag ? args.includes(shortFlag) : false);
}

// ---------------------------------------------------------------------------
// Prompt runner (async generator)
// ---------------------------------------------------------------------------

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
async function* runPrompt(piAgent, prompt, {
  messages = [],
  verbose = false,
  echoUser = false,
} = {}) {
  let assistantText = '';
  let streamStarted = false;
  let thinkingStarted = false;

  for await (const event of runAgentRound(piAgent, prompt)) {
    switch (event.type) {
      case 'UserMessage': {
        const { content } = event;
        messages.push({ role: 'user', content });
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
                const s = typeof result === 'string' ? result : JSON.stringify(result);
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
        inconeivable(event, 'agent chat event');
      }
    }
  }

  if (thinkingStarted) {
    yield `${RESET}\n`;
  }
  if (streamStarted) {
    yield `${RESET}\n`;
  }

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
 * @param {AsyncIterable<string>} options.prompts - Async iterable of user prompts for REPL mode. Ignored in one-shot (command) mode.
 * @returns {AsyncGenerator<string>}
 */
async function* runAgent({
  piAgent,
  tools,
  verbose,
  prompts,
  messages = [],
}) {
  for await (const prompt of prompts) {
    if (prompt === '.exit' || prompt === '.quit') {
      yield `${DIM}Goodbye.${RESET}\n`;
      break;
    }

    else if (prompt === '.help') {
      yield `${DIM}Commands:${RESET}\n`;
      yield `${DIM}  .exit   — quit the REPL${RESET}\n`;
      yield `${DIM}  .clear  — clear conversation history${RESET}\n`;
      yield `${DIM}  .tools  — list available tools${RESET}\n`;
      yield `${DIM}  .help   — show this help${RESET}\n`;
    }

    else if (prompt === '.clear') {
      messages.length = 0;
      yield `${DIM}Conversation history cleared.${RESET}\n`;
    }

    else if (prompt === '.tools') {
      const toolNames = Object.keys(tools);
      if (!toolNames.length) {
        yield `${DIM}-- No Tools --${RESET}\n`;
      } else {
        for (const name of toolNames) {
          yield `${DIM}  • ${name}${RESET}\n`;
        }
      }
    }

    else {
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

async function* readPrompts() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${BOLD}${GREEN}you>${RESET} `,
  });

  let closed = false;
  rl.once('close', () => {
    closed = true;
  });

  /** @returns {Promise<string|null>} */
  const nextPrompt = () => new Promise(resolve => {
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

// ---------------------------------------------------------------------------
// Main — thin entry point that wires IO
// ---------------------------------------------------------------------------

/** @param {string[]} args */
async function* runMain(args) {

  const command = getFlag(args, '--command', '-c');
  const modelArg = getFlag(args, '--model', '-m');
  const noTools = hasFlag(args, '--no-tools');
  const verbose = hasFlag(args, '--verbose', '-v');
  const workspaceArg = getFlag(args, '--workspace', '-w') || process.cwd();

  const fileTools = makeFileTools({ root: workspaceArg });
  const memoryTools = makeMemoryTools({ root: workspaceArg });

  // example of targeted command execution, rather than full bash
  const git = makeCommandTool({
    name: 'git',
    program: 'git',
    description:
      'Runs git version control commands (status, log, diff, commit, etc.).',
    allowPath: true,
    policies: [
      args => {
        const first = args.filter(arg => !arg.startsWith('-'))[0];
        return !(
          // ban network touching commands ; TODO moar
          first && ['push', 'pull', 'fetch'].includes(first)
        );
      }
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

  // Create the PiAgent once, reused across all chat rounds.
  const piAgent = await makePiAgent({
    hostname: 'dev-repl',
    currentTime: new Date().toISOString(),
    workspaceDir: workspaceArg,
    model: modelArg,

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

  function* describe() {
    const modelName = modelArg || `default (${DEFAULT_MODEL_STRING})`;
    const toolNames = Object.keys(tools);
    yield `${DIM}Model:     ${modelName}${RESET}\n`;
    yield `${DIM}Workspace: ${workspaceArg}${RESET}\n`;
    const toolSummary = toolNames.length < 1 ? '-- No Tools --' : toolNames.join(', ');
    yield `${DIM}Tools:     ${toolSummary}${RESET}\n`;
  }

  /** @type {Array<{ role: string, content: string }>} */
  const messages = [];
  // TODO load messages

  // --command / -c : one-shot mode — run a single prompt and return.
  if (command) {
    if (verbose) {
      yield* describe();
    }
    yield* runPrompt(piAgent, command, { messages, verbose, echoUser: true });
  } else {
    yield `${BOLD}${CYAN}╔══════════════════════════════════════╗${RESET}\n`;
    yield `${BOLD}${CYAN}║       Genie Dev REPL  v0.0.1         ║${RESET}\n`;
    yield `${BOLD}${CYAN}╚══════════════════════════════════════╝${RESET}\n`;
    yield '\n';
    yield* describe();
    yield '\n';
    yield `${DIM}Type your message and press Enter. Use Ctrl-C or type ".exit" to quit.${RESET}\n`;
    yield '\n';
    yield* runAgent({
      piAgent,
      tools,
      verbose,
      prompts: readPrompts(),
      messages,
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
  })
);
