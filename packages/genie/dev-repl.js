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
 *   node dev-repl.js [--model provider/modelId] [--no-tools] [--workspace /path]
 *
 * Environment:
 *   ANTHROPIC_API_KEY  — Required for the default anthropic provider.
 */

// ---------------------------------------------------------------------------
// SES harden polyfill — must come before any @endo imports.
// In the real daemon, SES lockdown provides `harden` as a global.
// ---------------------------------------------------------------------------
if (typeof globalThis.harden === 'undefined') {
  /** @type {any} */
  globalThis.harden = x => x;
}

import { createInterface } from 'readline';
import { makeAgent } from '@endo/genie';
import { bash } from './src/tools/bash.js';
import { readFile } from './src/tools/read-file.js';
import { writeFile } from './src/tools/write-file.js';
import { editFile } from './src/tools/edit-file.js';
import { gitTool as git } from './src/tools/git.js';
import { webFetch } from './src/tools/web-fetch.js';
import { webSearch } from './src/tools/web-search.js';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

/** @param {string} flag */
function getFlag(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

const modelArg = getFlag('--model');
const workspaceArg = getFlag('--workspace') || process.cwd();
const noTools = args.includes('--no-tools');
const verbose = args.includes('--verbose');

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

/** @type {Record<string, { help: () => string, execute: (args: any) => Promise<any> }>} */
const toolRegistry = noTools
  ? {}
  : {
      bash,
      readFile,
      writeFile,
      editFile,
      git,
      webFetch,
      webSearch,
    };

/**
 * List available tools in the ToolSpec format expected by makeAgent.
 *
 * @returns {Array<{ name: string, summary: string }>}
 */
function listTools() {
  return Object.entries(toolRegistry).map(([name, tool]) => ({
    name,
    summary: tool.help(),
  }));
}

/**
 * Execute a tool by name.
 *
 * @param {string} name
 * @param {any} toolArgs
 * @returns {Promise<any>}
 */
async function execTool(name, toolArgs) {
  const tool = toolRegistry[name];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool.execute(toolArgs);
}

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// REPL
// ---------------------------------------------------------------------------

async function main() {
  console.log(`${BOLD}${CYAN}╔══════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║       Genie Dev REPL  v0.0.1        ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════╝${RESET}`);
  console.log();
  console.log(`${DIM}Model:     ${modelArg || 'default (anthropic/claude-sonnet-4-20250514)'}${RESET}`);
  console.log(`${DIM}Workspace: ${workspaceArg}${RESET}`);
  console.log(`${DIM}Tools:     ${noTools ? 'disabled' : Object.keys(toolRegistry).join(', ')}${RESET}`);
  console.log();
  console.log(`${DIM}Type your message and press Enter. Use Ctrl-C or type ".exit" to quit.${RESET}`);
  console.log();

  /** @type {Array<{ role: string, content: string }>} */
  const conversationHistory = [];

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${BOLD}${GREEN}you>${RESET} `,
  });

  rl.prompt();

  rl.on('line', async line => {
    const prompt = line.trim();

    if (!prompt) {
      rl.prompt();
      return;
    }

    if (prompt === '.exit' || prompt === '.quit') {
      console.log(`${DIM}Goodbye.${RESET}`);
      process.exit(0);
    }

    if (prompt === '.clear') {
      conversationHistory.length = 0;
      console.log(`${DIM}Conversation history cleared.${RESET}`);
      rl.prompt();
      return;
    }

    if (prompt === '.help') {
      console.log(`${DIM}Commands:${RESET}`);
      console.log(`${DIM}  .exit   — quit the REPL${RESET}`);
      console.log(`${DIM}  .clear  — clear conversation history${RESET}`);
      console.log(`${DIM}  .tools  — list available tools${RESET}`);
      console.log(`${DIM}  .help   — show this help${RESET}`);
      rl.prompt();
      return;
    }

    if (prompt === '.tools') {
      if (noTools) {
        console.log(`${DIM}Tools are disabled (--no-tools).${RESET}`);
      } else {
        for (const name of Object.keys(toolRegistry)) {
          console.log(`${DIM}  • ${name}${RESET}`);
        }
      }
      rl.prompt();
      return;
    }

    // Pause readline while we process
    rl.pause();

    try {
      const agent = makeAgent({
        hostname: 'dev-repl',
        currentTime: new Date().toISOString(),
        workspaceDir: workspaceArg,
        model: modelArg,
        listTools,
        execTool,
        beforeSend: async p => {
          if (verbose) {
            console.log(`${DIM}[debug] Sending prompt (${p.length} chars)${RESET}`);
          }
          return p;
        },
        afterSend: async r => {
          if (verbose) {
            console.log(`${DIM}[debug] Response received (${r.length} chars)${RESET}`);
          }
          return r;
        },
      });

      // Add the user message to history for context
      conversationHistory.push({ role: 'user', content: prompt });

      let assistantText = '';
      let streamStarted = false;

      for await (const event of agent.chatRound({
        prompt,
        messages: conversationHistory,
      })) {
        switch (event.type) {
          case 'ToolCallStart': {
            // End any in-progress streaming line
            if (streamStarted) {
              process.stdout.write('\n');
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
            console.log(`${YELLOW}⚡ ${event.toolName}${RESET} ${DIM}${argsPreview}${RESET}`);
            break;
          }

          case 'ToolCallEnd': {
            const status = event.error
              ? `${RED}✗ failed${RESET}`
              : `${GREEN}✓ done${RESET}`;
            let preview = '';
            if (verbose && event.result) {
              try {
                const s = typeof event.result === 'string'
                  ? event.result
                  : JSON.stringify(event.result);
                preview = ` ${DIM}${s.slice(0, 200)}${RESET}`;
              } catch {
                // ignore
              }
            }
            console.log(`  ${status}${preview}`);
            break;
          }

          case 'Message': {
            if (event.role === 'assistant' && event.content) {
              // This is the final assembled message
              assistantText = event.content;
              // End any streaming line
              if (streamStarted) {
                process.stdout.write('\n');
                streamStarted = false;
              }
              console.log();
              console.log(`${BOLD}${CYAN}genie>${RESET} ${event.content}`);
              console.log();
            } else if (event.role === 'assistant_delta') {
              // Streaming delta — print inline
              if (!streamStarted) {
                process.stdout.write(`${DIM}`);
                streamStarted = true;
              }
              process.stdout.write(event.content);
            }
            break;
          }

          case 'Error': {
            if (streamStarted) {
              process.stdout.write(`${RESET}\n`);
              streamStarted = false;
            }
            console.error(`${RED}Error: ${event.message}${RESET}`);
            break;
          }

          default:
            if (verbose) {
              console.log(`${DIM}[event] ${event.type}${RESET}`);
            }
            break;
        }
      }

      // End any dangling stream
      if (streamStarted) {
        process.stdout.write(`${RESET}\n`);
      }

      // Save assistant response to history
      if (assistantText) {
        conversationHistory.push({ role: 'assistant', content: assistantText });
      }
    } catch (err) {
      console.error(`${RED}REPL error: ${/** @type {Error} */ (err).message}${RESET}`);
      if (verbose) {
        console.error(err);
      }
    }

    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${DIM}Goodbye.${RESET}`);
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
