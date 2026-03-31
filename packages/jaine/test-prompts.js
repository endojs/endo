#!/usr/bin/env node
// @ts-nocheck
// Test Jaine's system prompts against hypothetical user messages.
// Checks that the LLM responds using correct Endo patterns.
//
// Run from repo root: node packages/jaine/test-prompts.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProvider } from '@endo/lal/providers/index.js';

// Inline tool call extraction (can't import from fae without SES lockdown)
const extractToolCallsFromContent = content => {
  const toolCalls = [];
  const toolCallRe = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let index = 0;
  for (const match of content.matchAll(toolCallRe)) {
    const block = match[1].trim();
    let name = '';
    let args = '{}';
    try {
      const parsed = JSON.parse(block);
      if (parsed && typeof parsed === 'object') {
        name = parsed.name || '';
        args = parsed.arguments !== undefined
          ? (typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments))
          : '{}';
      }
    } catch {
      const fnMatch = block.match(/<function=([^>]+)>/);
      if (fnMatch) {
        name = fnMatch[1].trim();
        const fnArgs = {};
        const paramRe = /<parameter=([^>]+)>\s*([\s\S]*?)\s*<\/parameter>/g;
        for (const pm of block.matchAll(paramRe)) {
          fnArgs[pm[1].trim()] = pm[2].trim();
        }
        if (Object.keys(fnArgs).length === 0) {
          const looseRe = /<parameter=([^>]+)>\s*([\s\S]*?)(?=<parameter|<\/function|<function|$)/g;
          for (const pm of block.matchAll(looseRe)) {
            const key = pm[1].trim();
            const val = pm[2].replace(/<\/?parameter>/g, '').trim();
            if (key && val) fnArgs[key] = val;
          }
        }
        args = JSON.stringify(fnArgs);
      }
    }
    if (name) {
      toolCalls.push({ id: `tool_${index}`, type: 'function', function: { name, arguments: args } });
      index += 1;
    }
  }
  let cleanedContent = content.replace(toolCallRe, '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();
  return { toolCalls: toolCalls.length > 0 ? toolCalls : undefined, cleanedContent };
};

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '../..');

// Load .env
const envPath = path.join(repoRoot, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const provider = createProvider({
  LAL_HOST: process.env.ENDO_LLM_HOST || 'http://localhost:11434/v1',
  LAL_MODEL: process.env.ENDO_LLM_MODEL || 'qwen3',
  LAL_AUTH_TOKEN: process.env.ENDO_LLM_AUTH_TOKEN || 'ollama',
});

// ---- Prompts under test ----

const composerPrompt = `\
You are Jaine, an AI assistant living inside Endo — a capability-secure
JavaScript platform. You are a channel member replying in a conversation.

IMPORTANT CONTEXT — you are NOT a general-purpose coding assistant:
- You live inside Endo, which runs Hardened JavaScript (SES).
- All code in this environment is JavaScript using Eventual Send: E(ref).method()
- There is NO Python, Rust, Go, shell scripting, or any other language here.
- When users ask you to "write a program" or "make a function", they mean
  an Endo JavaScript module or inline JS using E() calls — never Python.
- If a user asks for something in another language, clarify that Endo uses
  JavaScript and offer the JS/Endo equivalent.

You have one tool: delegate({ intent, description }).
- Use it to look up information, run code, or perform actions in Endo.
- intent: what to do (e.g., "list my petnames", "read channel history")
- description: a brief status message shown to users while this runs
- IMPORTANT: delegate intents must describe Endo/JS operations, never
  "generate Python code" or "write a shell script".

Endo concepts:
- Petnames: local names for capabilities (like "my-channel", "alice")
- E() calls: all remote object access uses E(ref).method(), never direct
- Capabilities: objects are passed by reference, not by name/URL
- Channels: message spaces with members who can post, reply, react, edit
  - E(member).post([text], edgeNames, edgeIds) — post a message
  - E(member).post([text], [], [], replyTo) — reply to a message
  - E(member).listMessages() — read channel history
  - E(member).createInvitation(name) — invite sub-members
- Powers: your agent powers for looking up petnames
  - E(powers).list() — list known petnames
  - E(powers).lookup(name) — resolve a petname to a capability
  - E(powers).send(recipient, [text], [], []) — send an inbox message
- harden(): all objects must be hardened before sharing
- Modules: export const make = (powers) => { ... }
- SES restrictions: no new Date(), no mutation of returned objects,
  no direct I/O (fetch, fs, http). All I/O goes through capabilities.

AVOID hallucinating APIs that don't exist. If unsure whether a method
exists, use delegate to check the source code via readFile/listDir.

Write your response directly. Be concise, conversational, and helpful.
When showing code, always use JavaScript with E() patterns.`;

const executorPrompt = `\
You are an execution agent running inside Endo, a capability-secure
JavaScript platform. You receive a task and must use the available tools
to accomplish it. Return the final result as plain text in your last
message. Be concise and factual.

CRITICAL RULES:
1. ALL code must be JavaScript. Never write Python, shell scripts, or
   any other language. This environment only supports JS with E() calls.
2. All objects are REMOTE references. Use E() for every method call:
   WRONG: powers.list()          — throws "not a function"
   RIGHT: await E(powers).list()
3. When asked to "write a function" or "create a program", write it
   as an Endo module (export const make = ...) or inline JS, never Python.
4. There is no fetch(), fs, http, or direct I/O. All I/O goes through
   capabilities provided to you.

E() returns a Promise. Always await it. This applies to powers AND to
every object returned from an E() call.

Common patterns:
  const names = await E(powers).list();
  const ch    = await E(powers).lookup("my-channel");
  const member = await E(ch).join("jaine");
  const msgs  = await E(member).listMessages();
  await E(member).post(["Hello!"], [], []);
  await E(powers).send("recipient", ["message text"], [], []);

SES environment restrictions:
- new Date() throws. Use Date.now() for timestamps.
- Objects returned from E() are frozen. Do not try to mutate them.
- Use harden() on any objects you create before passing them around.
- BigInt literals use the n suffix: 42n, not BigInt(42).

CHANNEL CONTEXT:
When handling channel messages, the exec tool gives you a \`member\` handle
(your channel identity), NOT raw powers. Use member for all channel ops:
  await E(member).post(["text"], [], [], "replyTo");
  await E(member).listMessages();
  const [inv, att] = await E(member).createInvitation("sub-bot");
Do NOT look up channels by name and call join() — that bypasses your
identity. Everything you create should go through your member handle.

If you need a capability you don't have, use the requestPermission tool.

You have access to source code via readFile and listDir to understand
the environment when needed. PREFER checking the code over guessing APIs.`;

// ---- Delegate tool schema ----
const delegateSchema = {
  type: 'function',
  function: {
    name: 'delegate',
    description:
      'Delegate a task to the execution layer. Use for information lookup, capability operations, or any action requiring tools.',
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'What to do (e.g., "look up CapTP spec")',
        },
        description: {
          type: 'string',
          description: 'Status message to show while executing',
        },
      },
      required: ['intent'],
    },
  },
};

// ---- Test helpers ----

/**
 * Extract all tool calls from a response, including those embedded in content.
 */
const getAllToolCalls = (rm) => {
  let toolCalls = rm?.tool_calls || [];
  if ((!toolCalls || toolCalls.length === 0) && rm?.content) {
    const extracted = extractToolCallsFromContent(rm.content);
    if (extracted.toolCalls) {
      toolCalls = extracted.toolCalls;
    }
  }
  return toolCalls;
};

/**
 * Get all delegate intent strings from tool calls.
 */
const getDelegateIntents = (toolCalls) => {
  return toolCalls
    .map(t => {
      try {
        const args = typeof t.function?.arguments === 'string'
          ? JSON.parse(t.function.arguments)
          : t.function?.arguments || {};
        return args.intent || '';
      } catch { return ''; }
    })
    .join(' ');
};

// ---- Test cases ----

const testCases = [
  // === Basic Endo awareness ===
  {
    name: 'greeting function request',
    userMessage: 'Can you write me a greeting function?',
    checks: [
      { type: 'absent', pattern: /def\s+\w+\(/i, label: 'no Python def syntax' },
      { type: 'present', pattern: /function|=>|const |harden|E\(/i, label: 'uses JS patterns' },
    ],
  },
  {
    name: 'explicit Python request',
    userMessage: 'Write me a Python script that fetches data from an API',
    checks: [
      { type: 'absent', pattern: /```python|def\s+\w+\(|import requests/i, label: 'no Python code blocks' },
      { type: 'present', pattern: /[Jj]ava[Ss]cript|Endo|JS/i, label: 'redirects to JS/Endo' },
    ],
  },
  {
    name: 'write a program to list contacts',
    userMessage: 'Write me a program that lists all my contacts',
    checks: [
      { type: 'absent', pattern: /def\s+\w+\(|import\s+os/i, label: 'no Python code' },
      { type: 'present', pattern: /E\(|powers|lookup|list|delegate/i, label: 'uses Endo APIs or delegates' },
    ],
  },

  // === Channel operations (correct APIs) ===
  {
    name: 'send a message',
    userMessage: 'How do I send a message to another channel?',
    checks: [
      { type: 'present', pattern: /E\(|member|post|join/i, label: 'mentions E()/member/post' },
      { type: 'absent', pattern: /addMessage|socket|websocket/i, label: 'no hallucinated APIs' },
    ],
  },
  {
    name: 'read channel history',
    userMessage: 'Show me the last few messages in this channel',
    checks: [
      { type: 'present', pattern: /listMessages|delegate/i, label: 'uses listMessages or delegates' },
      { type: 'absent', pattern: /getMessages|fetchMessages|readMessages/i, label: 'no hallucinated methods' },
    ],
  },

  // === Delegate intent quality ===
  {
    name: 'check petnames via delegate',
    userMessage: 'Can you check what petnames I have?',
    checks: [
      { type: 'delegateAbsent', pattern: /python|script|bash/i, label: 'delegate intent has no Python/bash' },
      { type: 'delegatePresent', pattern: /list|petname|name/i, label: 'delegate intent mentions listing/petnames' },
    ],
  },
  {
    name: 'create a bot',
    userMessage: 'Can you make a bot that greets new members when they join?',
    checks: [
      { type: 'absent', pattern: /pip install|discord\.py|import discord/i, label: 'no Python/Discord imports' },
      { type: 'present', pattern: /E\(|member|channel|invitation|module|make|delegate/i, label: 'uses Endo patterns' },
    ],
  },

  // === Should NOT hallucinate ===
  {
    name: 'avoid hallucinating file APIs',
    userMessage: 'How do I read a file in Endo?',
    checks: [
      { type: 'absent', pattern: /require\('fs'\)|import fs from/i, label: 'no Node.js fs imports' },
      { type: 'present', pattern: /E\(|powers|capabilit|delegate/i, label: 'uses Endo patterns or delegates' },
    ],
  },
  {
    name: 'avoid hallucinating HTTP',
    userMessage: 'How do I make an HTTP request from Endo?',
    checks: [
      // Should not provide WORKING fetch/http code — mentioning them to say
      // they don't exist is OK, so we check for actual usage patterns
      { type: 'absent', pattern: /await fetch\(|fetch\(['"]http/i, label: 'no working fetch() calls' },
      { type: 'present', pattern: /capabilit|E\(|no.*direct|delegate/i, label: 'mentions capabilities or limitations' },
    ],
  },

  // === Conversational (should not inject code) ===
  {
    name: 'casual greeting',
    userMessage: 'Hey Jaine, how are you doing?',
    checks: [
      { type: 'absent', pattern: /```|def |import os/i, label: 'no code blocks in casual reply' },
    ],
  },
  {
    name: 'simple factual question',
    userMessage: 'What is the square root of 144?',
    checks: [
      { type: 'present', pattern: /12/, label: 'correct answer' },
    ],
  },

  // === Tricky requests ===
  {
    name: 'ambiguous "make a function"',
    userMessage: 'make a function that says hello',
    checks: [
      { type: 'absent', pattern: /def\s+\w+\(/i, label: 'no Python def' },
      { type: 'present', pattern: /function|=>|const |harden|E\(|delegate/i, label: 'JS function or delegates' },
    ],
  },
  {
    name: 'external service request',
    userMessage: 'Can you post something to Twitter for me?',
    checks: [
      { type: 'absent', pattern: /import tweepy|pip install|import discord/i, label: 'no Python package imports' },
      { type: 'present', pattern: /capabilit|don.?t|not.*available|can.?t|no.*built|delegate/i, label: 'acknowledges limitations' },
    ],
  },

  // === Edge cases that previously failed ===
  {
    name: 'write hello world',
    userMessage: 'write hello world',
    checks: [
      { type: 'absent', pattern: /print\s*\(["']|```python/i, label: 'no Python print() or code blocks' },
    ],
  },
  {
    name: 'sort an array',
    userMessage: 'How do I sort an array?',
    checks: [
      { type: 'absent', pattern: /\.sort\(\).*python|sorted\(|list\.sort/i, label: 'no Python sort' },
      { type: 'present', pattern: /\.sort\(|Array|js|javascript/i, label: 'mentions JS sort' },
    ],
  },
  {
    name: 'delegate to run code',
    userMessage: 'Run some code to check how many channels I have',
    checks: [
      { type: 'delegateAbsent', pattern: /python|bash|shell/i, label: 'delegate intent is not Python/bash' },
    ],
  },
];

// ---- Test runner ----

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';

let totalPass = 0;
let totalFail = 0;

console.log('Testing Jaine prompts against hypothetical user messages\n');
console.log(`Provider: ${process.env.ENDO_LLM_HOST || 'http://localhost:11434/v1'}`);
console.log(`Model: ${process.env.ENDO_LLM_MODEL || 'qwen3'}\n`);
console.log('='.repeat(70));

for (const tc of testCases) {
  console.log(`\n--- ${tc.name} ---`);
  console.log(`User: "${tc.userMessage}"`);

  try {
    const response = await provider.chat(
      [
        { role: 'system', content: composerPrompt },
        { role: 'user', content: `Message to respond to:\n${tc.userMessage}` },
      ],
      [delegateSchema],
    );

    const rm = response.message;
    const content = rm?.content || '';
    const toolCalls = getAllToolCalls(rm);

    // Show response (truncated)
    const cleaned = extractToolCallsFromContent(content).cleanedContent || content;
    const preview = cleaned.length > 300 ? cleaned.slice(0, 300) + '...' : cleaned;
    console.log(`\nComposer: ${preview}`);
    if (toolCalls.length > 0) {
      for (const tc2 of toolCalls) {
        const fn = tc2.function;
        const args = typeof fn?.arguments === 'string' ? fn.arguments : JSON.stringify(fn?.arguments);
        console.log(`Tool: delegate(${args})`);
      }
    }

    // Build check targets
    const fullOutput = content +
      toolCalls.map(t => JSON.stringify(t.function?.arguments || '')).join(' ');
    const delegateIntents = getDelegateIntents(toolCalls);

    // Run checks
    console.log('');
    for (const check of tc.checks) {
      let target;
      if (check.type === 'delegatePresent' || check.type === 'delegateAbsent') {
        target = delegateIntents;
        if (!delegateIntents && !toolCalls.length) {
          if (check.type === 'delegateAbsent') {
            console.log(`  ${PASS} ${check.label} (no delegation)`);
            totalPass += 1;
          } else {
            console.log(`  ${FAIL} ${check.label} — expected delegate but none made`);
            totalFail += 1;
          }
          continue;
        }
      } else {
        target = fullOutput;
      }

      const matches = check.pattern.test(target);
      const wantMatch = check.type === 'present' || check.type === 'delegatePresent';

      if (wantMatch === matches) {
        console.log(`  ${PASS} ${check.label}`);
        totalPass += 1;
      } else if (wantMatch) {
        console.log(`  ${FAIL} ${check.label} — pattern /${check.pattern.source}/ not found`);
        totalFail += 1;
      } else {
        console.log(`  ${FAIL} ${check.label} — unwanted pattern /${check.pattern.source}/ found`);
        totalFail += 1;
      }
    }
  } catch (err) {
    console.log(`  ${FAIL} LLM call failed: ${err.message || err}`);
    totalFail += tc.checks.length;
  }
}

console.log('\n' + '='.repeat(70));
console.log(`\nResults: ${totalPass} passed, ${totalFail} failed out of ${totalPass + totalFail} checks`);
if (totalFail === 0) {
  console.log(`\n${PASS} All checks passed!`);
} else {
  console.log(`\n${FAIL} ${totalFail} check(s) failed — prompts need improvement`);
}
