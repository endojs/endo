// @ts-nocheck - E() generics don't work well with JSDoc types for remote objects
/* eslint-disable no-await-in-loop */

// Floot — a streaming agent harness for the Endo daemon.
//
// Floot mirrors fae's factory/driver/guest topology (see @endo/fae) but trades
// fae's mailbox-driven, fully-buffered reply for a *pull-based streaming*
// interface: the agent exposes `converse(text) -> replyReader`, where
// replyReader is a Far StreamReader (src/stream.js) that yields reply-token
// deltas as the LLM produces them. This is the same wire the voice Space
// already consumes for transcripts (audio-server-caplet.js), so a client can
// stream the assistant's reply token-by-token and (later) feed it to TTS.
//
// Persistence and provisioning match fae: per-session conversation history lives
// in the session guest's petstore via @endo/conversation-tree, and a single
// pinned factory caplet revives every session on daemon restart.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { makeExo } from '@endo/exo';
import { Far } from '@endo/far';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import {
  makeConversationTree,
  makeEndoPetstoreBackend,
} from '@endo/conversation-tree';
import { discoverTools, executeTool } from '@endo/fae/src/tools.js';
import {
  makeExecTool,
  makeListPetnamesTool,
  makeLookupTool,
  makeStoreTool,
  makeRemoveTool,
  makeAdoptTool,
  makeSendTool,
  makeReplyTool,
} from '@endo/fae/src/tool-makers.js';

import { createStreamingProvider } from './providers/index.js';
import { makeReplyChannel } from './src/stream.js';

// Cap the tool-call loop so a misbehaving model can't spin forever before it
// produces a spoken reply.
const MAX_TOOL_ROUNDS = 8;

const execFileAsync = promisify(execFile);

// Initialize a fresh, empty directory as a git repository so a daemon git cap
// can be derived from it: provideGit requires an existing worktree, but a new
// scratch mount is just an empty dir. The exo git backend supplies its own
// author identity for the commits it makes; we only pin signing off here (so
// creation doesn't depend on a user-global commit.gpgSign) and seed an empty
// initial commit so the repo has a HEAD on the default branch.
const initGitRepo = async repoRoot => {
  await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: repoRoot });
  await execFileAsync('git', ['config', '--local', 'commit.gpgsign', 'false'], {
    cwd: repoRoot,
  });
  await execFileAsync('git', ['config', '--local', 'tag.gpgsign', 'false'], {
    cwd: repoRoot,
  });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=floot@endo',
      '-c',
      'user.name=Floot',
      'commit',
      '--allow-empty',
      '-m',
      'Initialize workspace',
    ],
    { cwd: repoRoot },
  );
};

/**
 * A writer (same shape as makeReplyChannel's) that buffers a turn's output
 * instead of streaming it, resolving `done` with the final text once the turn
 * ends. Used for inbox/mail turns, whose reply is sent as one buffered message
 * rather than streamed token-by-token.
 *
 * @returns {{ writer: object, done: Promise<{ ok: boolean, text?: string, error?: string }> }}
 */
const makeBufferingWriter = () => {
  let text = '';
  /** @type {(result: { ok: boolean, text?: string, error?: string }) => void} */
  let settle = () => {};
  const done = new Promise(resolve => {
    settle = resolve;
  });
  const writer = harden({
    setPhase: () => {},
    /** @param {string} t */
    delta: t => {
      text += t;
    },
    /** @param {string} t */
    final: t => {
      text = `${t}`;
    },
    toolCall: () => {},
    toolResult: () => {},
    usage: () => {},
    end: () => settle({ ok: true, text }),
    /** @param {unknown} reason */
    abort: reason => settle({ ok: false, error: `${reason}` }),
  });
  return { writer, done };
};

const FlootFactoryInterface = M.interface('FlootFactory', {
  createSession: M.callWhen()
    .optional(M.string(), M.string())
    .returns(M.remotable()),
  listSessions: M.callWhen().returns(M.arrayOf(M.record())),
  listPresets: M.callWhen().returns(M.arrayOf(M.record())),
  getSession: M.callWhen(M.string()).returns(M.remotable()),
  renameSession: M.callWhen(M.string(), M.string()).returns(M.undefined()),
  deleteSession: M.callWhen(M.string()).returns(M.undefined()),
  help: M.call().optional(M.string()).returns(M.string()),
});

const defaultSystemPrompt = `\
You are Floot, a warm, concise voice assistant living inside the Endo daemon.

Your replies are spoken aloud, so:
- Keep responses short and conversational — usually one to three sentences.
- Avoid markdown, code blocks, bullet lists, and emoji; write as you would speak.
- Answer directly. If you need to think, do it silently and give only the answer.

You live inside the Endo daemon as a guest with your own petstore — a private
namespace of named capabilities (objects you can call). You have tools to work
with it; use them silently, then speak only the result — never read code or raw
tool output aloud.

How the environment works: everything around you is an object capability. A
capability is a live remote object, not data — you act by CALLING its methods,
not by reading its fields. In exec, reach a capability through \`powers\` (your
guest interface) or by looking one up, and call methods with eventual-send:
\`const x = await E(ref).someMethod(args)\`. Always \`await\` and always go
through \`E(...)\` for capability calls.

When a tool result is itself a capability it shows as
\`[remote capability] callable methods: [...]\` listing the methods you can call
— that is a usable object, not an empty result. To work with it, look it up (or
store it) and call one of those methods via exec. Plain data (strings, numbers,
JSON) shows as its value.

Petstore tools:
- list — see the petnames currently in your petstore.
- lookup — get a stored object by its petname so you can use it.
- store — save an object (or a result) under a petname for later.
- remove — forget a petname.
- exec — run JavaScript with your guest powers in scope as \`powers\`. This is
  your most general power: call any daemon capability, do math, transform data.
  Reach for it whenever no other tool fits.

Mail tools — other agents and people can send you messages, optionally with
objects attached:
- listMessages — read your inbox. Each message has a number, sender, text, and
  the edge names of any attached objects.
- adopt — take an attached object into your petstore by giving the message
  number and the object's edge name, plus a petname to file it under.
- send — send a message (and optionally objects) to another party.
- reply — respond to a message by its number.

Caplet tools dropped into your \`tools/\` directory are discovered automatically,
so your abilities can grow over time. When asked what you can do, you can list
your tools and petnames to find out.
`;

// Flagship "vibe code a new project" persona: the base voice persona plus the
// framing that the session starts with a writable, git-backed workspace object
// already in its petstore (provisioned by the "new-project" preset).
const newProjectSystemPrompt = `${defaultSystemPrompt}
You are starting a fresh project. Your petstore already contains a writable,
git-backed project workspace under the petname "workspace" — an EndoGit
capability. Use it via exec:
- \`const wt = await E(workspace).worktree()\` gives the working tree, a mount you
  can write to: \`E(wt).makeFile(path, text)\`, \`E(wt).writeText(path, text)\`,
  \`E(wt).remove(path)\`, \`E(wt).move(from, to)\`.
- \`E(workspace).status()\` returns entries shaped \`{ entry, path, worktree }\`;
  \`E(workspace).diff()\` inspects changes.
- To stage, pass the \`entry\` capabilities (NOT path strings) from status to
  \`add\`: \`const st = await E(workspace).status(); await E(workspace).add(st.map(s => s.entry))\`.
  Then \`E(workspace).commit(message)\` records them.
Build what the user asks for in the workspace, committing as you reach working
states. Speak short, plain summaries of what you did — never read code aloud.`;

// "Full control" persona: the base voice persona plus a reference to the daemon
// host itself ("endo") and the framing that this is dangerous, high-trust
// access that must be exercised carefully.
const fullControlSystemPrompt = `${defaultSystemPrompt}
You hold full control of this Endo daemon. Your petstore contains "endo" — a
reference to the daemon host itself, the most powerful capability there is.
Through it you can read, create, move, and destroy ANY capability in the daemon,
mint new agents, and run arbitrary code. Treat this access with great care:
- Move slowly and deliberately. Before anything destructive or irreversible —
  removing or cancelling a capability, overwriting a name, deleting an agent —
  say plainly what you are about to do and wait for the user to agree first.
- Prefer reading over writing. Inspect with list and lookup before you change
  anything; when unsure what a capability is, look before you act on it.
- Make the smallest change that satisfies the request. Don't tidy, reorganize,
  or "improve" the daemon's namespace unasked.
- Guard secrets. Never read API keys, tokens, or host filesystem paths aloud,
  and don't hand the "endo" reference (or anything derived from it) to another
  agent unless the user explicitly tells you to.

Operating the daemon — reach the host in exec with
\`const endo = await E(powers).lookup('endo')\`, then:
- \`E(endo).list()\` shows the names in the daemon's namespace; \`E(endo).lookup(name)\`
  retrieves one as a live capability.
- \`E(endo).makeDirectory(name)\` creates a sub-namespace; \`E(endo).move(from, to)\`,
  \`E(endo).copy(from, to)\`, and \`E(endo).remove(name)\` manage names.
- \`E(endo).evaluate(...)\` runs code in a worker — use it to build new caplets or
  one-off tools.
- \`E(endo).provideGuest(name)\` and \`E(endo).provideHost(name)\` mint new agents;
  \`E(endo).provideWorker(name)\` mints a worker.
- \`E(endo).cancel(name)\` tears a capability down — destructive, so confirm first.
Speak short, plain summaries of what you did — never read code or raw capability
output aloud.`;

// Catalog of session presets. Each preset pairs a system prompt with a set of
// objects to provision (idempotently) into the session guest's petstore the
// first time the session's agent is built. Provisioned objects are referenced
// ONLY by the session guest, so the daemon's GC reaps them (and their on-disk
// backing) when the session is deleted — there is no manual cleanup.
const PRESETS = [
  {
    id: 'general',
    title: 'General assistant',
    description: 'A blank session with no project workspace.',
    systemPrompt: defaultSystemPrompt,
    objects: [],
  },
  {
    id: 'new-project',
    title: 'New project',
    description:
      'Start a project with a writable, git-backed workspace ready to populate.',
    systemPrompt: newProjectSystemPrompt,
    objects: [{ kind: 'git-workspace', petName: 'workspace' }],
  },
  {
    id: 'full-control',
    title: 'Full Endo control',
    description:
      'Full control of the Endo daemon via an "endo" host reference. High access — handle with care.',
    systemPrompt: fullControlSystemPrompt,
    objects: [{ kind: 'host-powers', petName: 'endo' }],
  },
];
const DEFAULT_PRESET_ID = 'general';
const getPreset = id =>
  PRESETS.find(p => p.id === id) ||
  /** @type {(typeof PRESETS)[number]} */ (
    PRESETS.find(p => p.id === DEFAULT_PRESET_ID)
  );

/**
 * Provision a preset's objects into a session guest's petstore, referenced ONLY
 * by the guest so deleting the session collects them (and their on-disk backing)
 * automatically. Idempotent: an object whose petname already exists is left
 * untouched, so this is safe to call on every revival.
 *
 * @param {any} host - the factory's own host powers
 * @param {string} agentName - petname (in the host) of the session's guest agent
 * @param {any} sessionGuest - the resolved guest facet (for `has` checks)
 * @param {string} id - session id (used to namespace temporary host petnames)
 * @param {Array<{ kind: string, petName: string }>} objects
 */
const provisionPresetObjects = async (
  host,
  agentName,
  sessionGuest,
  id,
  objects,
) => {
  for (const obj of objects) {
    const alreadyPresent = await E(sessionGuest).has(obj.petName);
    if (alreadyPresent) {
      // Idempotent: a revived session already has its provisioned objects.
    } else if (obj.kind === 'git-workspace') {
      // Mint a daemon-managed scratch mount, derive a git cap over it, then move
      // the git cap into the guest's petstore and drop the host-side scratch
      // petname. The git formula keeps the mount alive by reference (daemon GC:
      // git depends on its mount), so the only petstore reference left is the
      // guest's — deleting the session reaps the whole chain (and the scratch
      // dir on disk). Temporary host petnames are namespaced by session id and
      // cleared first in case a prior attempt aborted mid-way.
      const scratchTmp = `_floot-scratch-${id}`;
      const gitTmp = `_floot-git-${id}`;
      for (const tmp of [gitTmp, scratchTmp]) {
        if (await E(host).has(tmp)) await E(host).remove(tmp);
      }
      const mount = await E(host).provideScratchMount(scratchTmp);
      // provideGit requires an existing worktree, but a fresh scratch mount is
      // an empty dir — git-init it first. The factory is an unconfined,
      // fully-privileged host caplet, so resolving the host path and running
      // git here is in-bounds; that path never reaches the session guest or the
      // UI (they only ever receive the derived git cap, not its filesystem
      // location).
      const repoRoot = await E(host).provideHostPath(mount);
      await initGitRepo(repoRoot);
      await E(host).provideGit(mount, gitTmp);
      await E(host).move([gitTmp], [agentName, obj.petName]);
      await E(host).remove(scratchTmp);
    } else if (obj.kind === 'host-powers') {
      // Copy the factory's own host agent (@agent — the full host powers, not
      // the weaker @self handle) into the guest's petstore, granting the
      // session full daemon control. The host outlives every session, so this
      // only adds a name in the guest; deleting the session drops that name and
      // reaps nothing else.
      await E(host).copy(['@agent'], [agentName, obj.petName]);
    } else {
      console.warn(
        `[floot-factory] unknown preset object kind "${obj.kind}" for session ${id}`,
      );
    }
  }
};

/**
 * @typedef {object} ProviderConstructorConfig
 * @property {string} host
 * @property {string} model
 * @property {string} authToken
 */

/**
 * @typedef {object} InjectedProviderConfig
 * @property {{ chatStream: Function, chat: Function }} provider
 */

/**
 * Build a streaming agent over a guest's powers. The returned object exposes
 * `converse(input, writer)`, which appends to the conversation tree, streams the
 * model's reply through `writer` (src/stream.js), and persists the assistant
 * turn so subsequent calls keep context.
 *
 * The user message (`input`) is streamable too: it may be a plain string, or a
 * Far reader yielding transcript-style events (the same wire the audio caplet's
 * `transcribe` emits — `{type:'partial'|'final', text}` with replace semantics,
 * terminated by `end`/`abort`). Either way the message is fully assembled before
 * the LLM call, since Anthropic/Claude need a complete user turn — but the
 * interface accepts the stream now so callers (and a future streaming backend)
 * need not change. This lets the voice Space pipe transcribe()'s reader straight
 * into converse().
 *
 * Unlike fae's `spawnWorkerLoop`, this does NOT follow the inbox; it is driven
 * by direct method calls (the caller owns the loop), which is what lets the
 * reply stream straight back to that caller over CapTP.
 *
 * @param {any} powers - Guest powers (petstore for conversation history)
 * @param {Promise<object> | object | undefined} _context
 * @param {ProviderConstructorConfig | InjectedProviderConfig} providerConfig
 * @param {string} [systemPrompt]
 * @returns {Promise<{ converse: (input: string | object, writer: object) => Promise<void>, getHistory: () => Promise<Array<Record<string, any>>>, startInbox: () => void }>}
 */
export const makeStreamingAgent = async (
  powers,
  _context,
  providerConfig,
  systemPrompt,
) => {
  const provider =
    providerConfig.provider ||
    createStreamingProvider({
      LAL_HOST: providerConfig.host,
      LAL_MODEL: providerConfig.model,
      LAL_AUTH_TOKEN: providerConfig.authToken,
    });

  const effectivePrompt = systemPrompt || defaultSystemPrompt;
  const tree = makeConversationTree(makeEndoPetstoreBackend(powers));

  // Cumulative token usage for this session, persisted to the guest petstore so
  // it survives a daemon restart. Loaded lazily; updated after each turn.
  const USAGE_NAME = 'floot-usage';
  /** @type {{ inputTokens: number, outputTokens: number, turns: number } | undefined} */
  let usage;
  const loadUsage = async () => {
    if (usage) return usage;
    if (await E(powers).has(USAGE_NAME)) {
      const stored = /** @type {any} */ (await E(powers).lookup(USAGE_NAME));
      usage = {
        inputTokens: Number(stored?.inputTokens) || 0,
        outputTokens: Number(stored?.outputTokens) || 0,
        turns: Number(stored?.turns) || 0,
      };
    } else {
      usage = { inputTokens: 0, outputTokens: 0, turns: 0 };
    }
    return usage;
  };
  // Serialize writes: storeValue can't overwrite, so each save removes then
  // stores, and concurrent saves would interleave (see saveRegistry).
  let usageWrite = Promise.resolve();
  const saveUsage = () => {
    const snapshot = harden({ ...usage });
    usageWrite = usageWrite
      .then(async () => {
        if (await E(powers).has(USAGE_NAME)) await E(powers).remove(USAGE_NAME);
        await E(powers).storeValue(snapshot, USAGE_NAME);
      })
      .catch(error => {
        console.error(
          '[floot] could not persist usage:',
          error instanceof Error ? error.message : String(error),
        );
      });
    return usageWrite;
  };

  // Built-in tools bound to this agent's guest powers — the dynamic surface for
  // working with the daemon and petstore. `exec` is the most general (arbitrary
  // JS with `powers`); the rest are explicit petstore operations. Caplet tools
  // dropped into the guest's `tools/` directory are discovered on top of these
  // each turn (see discoverTools), so the toolset can grow at runtime.
  /** @type {Map<string, any>} */
  const localTools = new Map();
  localTools.set('exec', makeExecTool(powers));
  localTools.set('list', makeListPetnamesTool(powers));
  localTools.set('lookup', makeLookupTool(powers));
  localTools.set('store', makeStoreTool(powers));
  localTools.set('remove', makeRemoveTool(powers));
  // Mail: discover incoming messages and adopt objects attached to them into
  // this session's petstore. adopt needs a message number + edge name, which
  // listMessages surfaces. fae's listMessages tool returns raw records whose
  // `number` is a BigInt and so don't stringify for the model — format a
  // readable summary (number, sender, text, edge names) here instead.
  localTools.set(
    'listMessages',
    harden({
      schema: () =>
        harden({
          type: 'function',
          function: {
            name: 'listMessages',
            description:
              'List messages in your inbox. Each entry has its number, sender, ' +
              'type, text, and the edge names of any attached objects. Use an ' +
              'edge name together with the message number to adopt an object.',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        }),
      execute: async () => {
        const msgs = await E(powers).listMessages();
        const summary = (Array.isArray(msgs) ? msgs : []).map(m => ({
          number: Number(m.number),
          from: m.from,
          type: m.type,
          text: Array.isArray(m.strings) ? m.strings.join('') : undefined,
          edgeNames: Array.isArray(m.names) ? m.names : [],
        }));
        return JSON.stringify(summary, null, 2);
      },
      help: () => 'List inbox messages with their numbers and edge names.',
    }),
  );
  localTools.set('adopt', makeAdoptTool(powers));
  localTools.set('send', makeSendTool(powers));
  localTools.set('reply', makeReplyTool(powers));

  // One session = one guest = one linear conversation. The guest's petstore
  // holds a conversation-tree root and a linear branch beneath it. We cache the
  // current leaf in memory and rediscover it from the tree on first use after a
  // restart. The match is NOT keyed on the system prompt: that orphaned all
  // history whenever the prompt changed. Instead we reuse the root with the
  // deepest branch — the one that actually holds the conversation — ignoring any
  // empty roots a past prompt change may have spawned. The current prompt is
  // applied at call time (see runTurn), so reusing an old root never leaks a
  // stale prompt.
  /** @type {string | undefined} */
  let cachedLeaf;

  const getOrCreateLeaf = async () => {
    if (cachedLeaf !== undefined) return cachedLeaf;

    const roots = await tree.getRoots();
    /** @type {{ leaf: string, depth: number } | undefined} */
    let best;
    for (const r of roots) {
      // Walk down the (linear) branch to its deepest node, counting depth.
      let leaf = r.id;
      let depth = 0;
      for (;;) {
        const kids = await tree.getChildren(leaf);
        if (!kids || kids.length === 0) break;
        leaf = kids[kids.length - 1].id;
        depth += 1;
      }
      if (best === undefined || depth > best.depth) {
        best = { leaf, depth };
      }
    }
    if (best !== undefined) {
      cachedLeaf = best.leaf;
      return best.leaf;
    }

    const root = await tree.addNode(null, [
      { role: 'system', content: effectivePrompt },
    ]);
    cachedLeaf = root.id;
    return root.id;
  };

  // Serialize turns: a streaming reply must finish (and persist its assistant
  // node) before the next converse() reads the path, or context would race.
  let turnChain = Promise.resolve();

  // Assemble the user message. A string is used as-is; a reader is drained
  // (replace semantics — each partial/final carries the full text so far) until
  // it ends, so the complete turn is ready before the (non-streaming) LLM call.
  const resolveUserText = async input => {
    if (typeof input === 'string') return input;
    let text = '';
    for (;;) {
      const { value, done } = await E(input).next();
      if (done || value?.type === 'end') break;
      if (value?.type === 'partial' || value?.type === 'final') {
        text = `${value.text}`;
      } else if (value?.type === 'abort') {
        throw new Error(value.reason || 'user message aborted');
      }
    }
    return text;
  };

  const runTurn = async (input, writer, meta, signal) => {
    const text = await resolveUserText(input);
    const baseLeafId = await getOrCreateLeaf();
    // `meta` rides along on the user node (the provider ignores unknown fields)
    // so getHistory can mark, e.g., turns that arrived via mail rather than the
    // local UI.
    const userNode = await tree.addNode(baseLeafId, [
      { role: 'user', content: `${text}`, ...(meta ? { meta } : {}) },
    ]);

    // Agentic loop: stream a reply; if it calls tools, run them, persist the
    // assistant turn plus tool results, and loop again until the model returns a
    // plain (spoken) answer. Tools are re-discovered each round so anything the
    // model creates mid-turn (e.g. via exec/store) is immediately callable.
    let leafId = userNode.id;
    let finalContent = '';
    // Whether the model produced a plain (toolless) answer. If it never does
    // within MAX_TOOL_ROUNDS, we send a fallback instead of an empty reply.
    let answered = false;
    // Token usage accumulates across this turn's rounds (each tool round is its
    // own provider call).
    let turnInput = 0;
    let turnOutput = 0;
    writer.setPhase('thinking');

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      // The consumer (reply reader) may have stopped pulling between rounds —
      // its onClose aborts `signal`. Bail before spending another provider call.
      if (signal?.aborted) return;
      const { schemas, toolMap } = await discoverTools(powers, localTools);
      // Always lead with the *current* system prompt and drop whatever system
      // message the tree's root happens to store. This decouples the prompt from
      // the stored conversation, so editing the prompt updates instructions
      // immediately without leaking stale ones — and without orphaning history.
      const path = await tree.getPath(leafId);
      const conversationContext = [
        { role: 'system', content: effectivePrompt },
        ...path.filter(m => m.role !== 'system'),
      ];
      console.error(
        `[floot] round ${round}: ${conversationContext.length} messages, ${schemas.length} tools`,
      );

      let streamed = '';
      const { message, usage: roundUsage } = await provider.chatStream(
        conversationContext,
        schemas,
        delta => {
          streamed += delta;
          writer.delta(delta);
        },
        signal,
      );
      if (roundUsage) {
        turnInput += roundUsage.inputTokens || 0;
        turnOutput += roundUsage.outputTokens || 0;
      }

      const rm = message || { role: 'assistant', content: streamed };
      const toolCalls = Array.isArray(rm.tool_calls) ? rm.tool_calls : [];

      if (toolCalls.length === 0) {
        finalContent = rm.content || streamed;
        const finalNode = await tree.addNode(leafId, [rm]);
        leafId = finalNode.id;
        answered = true;
        break;
      }

      writer.setPhase('using tools');
      /** @type {Array<{ role: 'tool', tool_call_id: string, content: string }>} */
      const toolResults = [];
      // Some providers omit tool-call ids. Synthesize a stable one per call so
      // the persisted assistant tool_call and its tool_result share the same id;
      // without it the Anthropic conversion fabricates a fresh random id for the
      // tool_use and maps the tool_result to "unknown", breaking their
      // association on the next round.
      const normalizedToolCalls = toolCalls.map((tc, i) => ({
        ...tc,
        // The `floot-synth-` prefix keeps a synthesized id from colliding with a
        // real provider id (e.g. Anthropic's `toolu_…`) when a single response
        // mixes calls that have ids with ones that don't.
        id: tc.id || `floot-synth-${round}-${i}`,
      }));
      for (const tc of normalizedToolCalls) {
        const name = tc.function?.name;
        let args = {};
        let parseError;
        try {
          args =
            typeof tc.function?.arguments === 'string'
              ? JSON.parse(tc.function.arguments || '{}')
              : tc.function?.arguments || {};
        } catch (err) {
          parseError = err instanceof Error ? err.message : String(err);
        }
        writer.toolCall({ name: `${name}`, args: JSON.stringify(args) });
        let resultText;
        if (parseError !== undefined) {
          // Report malformed arguments back to the model instead of silently
          // running the tool with empty args, so it can retry with valid JSON.
          resultText = `Error: could not parse tool arguments as JSON (${parseError}). Re-send this tool call with valid JSON arguments.`;
        } else {
          try {
            resultText = await executeTool(name, args, toolMap);
          } catch (err) {
            resultText = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
        writer.toolResult({ name: `${name}`, result: `${resultText}` });
        // Diagnostics go to stderr and omit the result payload, which can carry
        // capability output or secrets — log only the tool name and size.
        console.error(
          `[floot] tool ${name} -> ${`${resultText}`.length} chars`,
        );
        toolResults.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: `${resultText}`,
        });
      }

      const stepNode = await tree.addNode(leafId, [
        { ...rm, tool_calls: normalizedToolCalls },
        ...toolResults,
      ]);
      leafId = stepNode.id;
      writer.setPhase('thinking');
    }

    if (!answered) {
      // The loop hit MAX_TOOL_ROUNDS while the model still wanted to call tools,
      // so it never produced a spoken answer. Persist and speak a fallback so the
      // turn ends on a well-formed assistant message instead of an empty reply
      // sitting atop a dangling tool_result.
      finalContent =
        "I wasn't able to finish that within my tool-step limit. Could you narrow it down or try again?";
      const fallbackNode = await tree.addNode(leafId, [
        { role: 'assistant', content: finalContent },
      ]);
      leafId = fallbackNode.id;
      console.error(
        `[floot] turn hit MAX_TOOL_ROUNDS (${MAX_TOOL_ROUNDS}); sent fallback reply`,
      );
    }

    cachedLeaf = leafId;
    // Fold this turn's token usage into the session total, persist it, and emit
    // it so the UI can surface per-session cost.
    const totals = await loadUsage();
    totals.inputTokens += turnInput;
    totals.outputTokens += turnOutput;
    totals.turns += 1;
    saveUsage();
    writer.usage(totals);
    writer.final(finalContent);
    writer.end();
  };

  const converse = (input, writer, meta, signal) => {
    const result = turnChain.then(() =>
      runTurn(input, writer, meta, signal).catch(err => {
        // A consumer that stopped pulling (reply reader closed) aborts `signal`,
        // tearing down the in-flight provider stream. That's a clean stop, not a
        // failure, and the writer is already settled, so swallow it.
        if (signal?.aborted) return;
        // runTurn has no internal catch, so on failure the writer is still
        // unsettled — abort it here or every consumer (UI stream and the mail
        // inbox's turnDone) would hang forever. Rethrow so callers still see it.
        writer.abort(err instanceof Error ? err.message : String(err));
        throw err;
      }),
    );
    // Keep the chain alive even if a turn rejects.
    turnChain = result.catch(() => {});
    return result;
  };

  // Inbox loop: a session is also addressable by mail. We follow the guest's
  // inbox and feed each incoming message through the SAME turn machinery as
  // converse() (so mail and UI turns share one conversation thread and are
  // serialized by turnChain), then send the reply back as one buffered mail
  // message via reply(). Streaming-over-mail is a later phase; for now the
  // reply is the assembled final text.
  let inboxStarted = false;
  const startInbox = () => {
    if (inboxStarted) return;
    inboxStarted = true;
    (async () => {
      const selfLocator = await E(powers).locate('@self');
      const messages = iterateReader(E(powers).followMessages());
      // followMessages can deliver the same message twice: its initial drain
      // iterates a *live* Map that our own reply() mutates (so the iterator
      // re-yields the freshly-added reply), and that reply is also republished
      // to the topic the drain later consumes. Process each number once, or the
      // second dismiss() of an already-removed message throws and kills the loop.
      const handled = new Set();
      for (;;) {
        const { value: message, done } = await messages.next();
        if (done) break;
        const { from: fromId, number, type, strings, names } = message;
        if (!handled.has(number)) {
          handled.add(number);
          // Skip our own outbound messages echoed back into the inbox.
          if (fromId !== selfLocator) {
            let text;
            if (type === 'package' && Array.isArray(strings)) {
              const parts = [];
              const namesArray = Array.isArray(names) ? names : [];
              for (let i = 0; i < strings.length; i += 1) {
                parts.push(strings[i]);
                if (i < namesArray.length) parts.push(`@${namesArray[i]}`);
              }
              text = parts.join('').trim();
              // This message is dismissed once this turn ends, so any attached
              // object must be adopted now. Tell the model the message number
              // and edge names so it can call adopt within this same turn.
              if (namesArray.length) {
                const edges = namesArray.map(n => `"${n}"`).join(', ');
                text += `\n\n(System: message #${number} attaches object(s) with edge name(s) ${edges}. To keep any of them, call the adopt tool with message number ${number} and the edge name during this turn — the message is dismissed afterward.)`;
              }
            } else {
              text = `(${type || 'unknown'} message)`;
            }

            // Resolve a friendly sender name for the history entry: the
            // petname(s) this guest has for the sender, falling back to the
            // locator. The reply is sent to the same sender by message number.
            let fromName;
            try {
              const senderNames = await E(powers).reverseLocate(fromId);
              fromName =
                Array.isArray(senderNames) && senderNames.length
                  ? senderNames[0]
                  : fromId;
            } catch {
              fromName = fromId;
            }

            const { writer, done: turnDone } = makeBufferingWriter();
            // Route through converse so the turn joins turnChain and shares
            // context. Tag the turn as mail so getHistory can mark it (and the
            // UI can show the sender) rather than render it like local input.
            converse(text, writer, { mail: { from: fromName } });
            const result = await turnDone;
            const replyText = result.ok
              ? result.text || ''
              : `Error: ${result.error}`;
            await E(powers).reply(number, [replyText], [], []);
          }
          // Dismiss after handling so the message leaves the inbox and is not
          // reprocessed when followMessages replays on the next daemon restart.
          await E(powers).dismiss(number);
        }
      }
    })().catch(error => {
      inboxStarted = false;
      console.error(
        '[floot] inbox loop error:',
        error instanceof Error ? error.message : String(error),
      );
    });
  };

  // Replay the conversation for UI repaint: user prompts, the assistant's spoken
  // answers, and each tool call paired with its result so tool activity survives
  // a refresh. The system prompt (root) is omitted.
  const getHistory = async () => {
    const leafId = await getOrCreateLeaf();
    const path = await tree.getPath(leafId);
    // Index tool outputs by call id so each assistant tool_call can carry its
    // result. The raw 'tool' messages are model-wire records; the UI wants the
    // call and its result joined.
    const resultById = new Map();
    for (const m of path) {
      if (m.role === 'tool' && m.tool_call_id != null) {
        resultById.set(m.tool_call_id, m.content);
      }
    }
    const out = [];
    for (const m of path) {
      if (m.role !== 'user' && m.role !== 'assistant') {
        // eslint-disable-next-line no-continue
        continue;
      }
      if (typeof m.content === 'string' && m.content.trim() !== '') {
        out.push({
          role: m.role,
          content: m.content,
          ...(m.meta ? { meta: m.meta } : {}),
        });
      }
      if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          const args = tc.function?.arguments;
          out.push({
            role: 'tool',
            name: tc.function?.name || 'tool',
            args: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
            result: resultById.has(tc.id) ? resultById.get(tc.id) : null,
          });
        }
      }
    }
    return harden(out);
  };

  const getUsage = async () => harden({ ...(await loadUsage()) });

  return harden({ converse, getHistory, getUsage, startInbox });
};
harden(makeStreamingAgent);

// ============================================================================
// Floot Factory — entry point (mirrors fae's factory recipe)
// ============================================================================

// Petname (in the factory guest's own petstore) where the session registry —
// an array of { id, title, createdAt } — is persisted.
const REGISTRY_NAME = 'floot-sessions';

const newSessionId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The Floot factory — a single long-lived, pinned caplet that owns every chat
 * session. The UI references ONLY this factory; it never sees a guest.
 *
 * Each session is, internally, its own EndoGuest (isolated petstore for
 * conversation history, tool endowments, and — later — an inbox). That a session
 * "is a guest" is an implementation detail hidden behind opaque session facets
 * (Far objects with `converse(input) -> replyReader` and `getHistory()`). The
 * factory operates each session guest's petstore directly via an in-process
 * `makeStreamingAgent`, so there is exactly one pin (the factory) rather than a
 * pin per session.
 *
 * Persistence is daemon-only: the session registry lives in the factory's own
 * petstore (REGISTRY_NAME), and each session's history lives in its guest's
 * petstore. On restart the daemon revives the pinned factory; sessions are
 * revived lazily (provideGuest is idempotent) on first use.
 *
 * IMPORTANT (reincarnation constraint, same as the fae/driver caplets): make()
 * must return synchronously WITHOUT awaiting remote references on its powers
 * host, or it deadlocks with the provision chain creating this very formula.
 * So the provider, registry, and per-session guests are all resolved lazily.
 *
 * @param {import('@endo/eventual-send').FarRef<object>} hostPowers
 * @param {Promise<object> | object | undefined} _context
 * @param {{ env?: Record<string, string> }} [options]
 * @returns {object}
 */
export const make = (hostPowers, _context, { env } = {}) => {
  /** @type {any} */
  const powers = hostPowers;
  const systemPrompt = env?.FLOOT_SYSTEM_PROMPT || undefined;

  // The factory runs with its own host powers, so it provisions session guests
  // directly — no introduced `host-agent` reference (that rehydrates as a
  // mail-only Handle after a restart, leaving provideGuest/locate unavailable on
  // revived sessions). `powers` here is the factory's own host.
  const getHost = () => powers;

  let providerP;
  const getProvider = () => {
    if (!providerP) {
      providerP = (async () => {
        const cfg = await E(powers).lookup('llm-provider');
        return createStreamingProvider({
          FLOOT_PROVIDER: cfg.provider,
          FLOOT_MODEL: cfg.model,
          FLOOT_AUTH_TOKEN: cfg.authToken,
        });
      })().catch(error => {
        providerP = undefined;
        throw error;
      });
    }
    return providerP;
  };

  // In-memory session registry, mirrored to the factory's petstore. Loaded
  // lazily so make() never awaits.
  /** @type {Array<{ id: string, title: string, createdAt: number }> | undefined} */
  let registry;
  const loadRegistry = async () => {
    if (registry) return registry;
    if (await E(powers).has(REGISTRY_NAME)) {
      const stored = await E(powers).lookup(REGISTRY_NAME);
      registry = Array.isArray(stored) ? [...stored] : [];
    } else {
      registry = [];
    }
    return registry;
  };
  // Serialize registry writes: storeValue can't overwrite, so each save is a
  // remove-then-store. Two concurrent saves would interleave (both see the key,
  // the second remove throws on the already-removed name), so we chain them.
  let registryWrite = Promise.resolve();
  const saveRegistry = () => {
    const result = registryWrite.then(async () => {
      if (await E(powers).has(REGISTRY_NAME)) {
        await E(powers).remove(REGISTRY_NAME);
      }
      await E(powers).storeValue(harden([...(registry || [])]), REGISTRY_NAME);
    });
    // Keep the chain alive even if this write rejects.
    registryWrite = result.catch(() => {});
    return result;
  };

  // Per-session in-process streaming agent, built lazily over the session
  // guest's powers. provideGuest is idempotent, so this both creates a fresh
  // session guest and revives an existing one after a restart.
  /** @type {Map<string, Promise<any>>} */
  const agents = new Map();
  const getAgent = id => {
    let agentP = agents.get(id);
    if (!agentP) {
      agentP = (async () => {
        const host = getHost();
        const handleName = `session-${id}`;
        const agentName = `session-agent-${id}`;
        // provideGuest is idempotent (create-or-revive). The petname we pass
        // (and provideGuest's return value) bind to the guest's *handle* — a
        // mail-only facet that, after a restart, has none of the petstore/mail
        // control methods. So we pass an explicit agentName and look the
        // controlling *agent* up by that name to get the full guest facet for
        // the session's powers (the same agent fae runs its driver against).
        await E(host).provideGuest(handleName, { agentName });
        const sessionGuest = await E(host).lookup(agentName);
        // Introduce the user to the session under the petname "user" so the
        // agent can mail them directly (send/reply target "user"). The factory
        // host's own "@host" is the user — the @agent that provisioned the
        // factory — so copy it into the guest's petstore. A session's own
        // "@host" is this factory host, not the user, which is why a plain
        // send("@host") never reaches them. Idempotent: skip if already present
        // (the guest's petstore survives restarts).
        try {
          if (!(await E(sessionGuest).has('user'))) {
            await E(host).copy(['@host'], [agentName, 'user']);
          }
        } catch (err) {
          console.warn(
            `[floot-factory] could not register "user" for session ${id}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
        // Resolve the session's preset to pick its system prompt and provision
        // its objects. The prompt was snapshotted into the registry at creation
        // (so catalog edits don't retroactively change live sessions); the
        // object set is read from the catalog by id (objects are provisioned
        // once and idempotency makes re-reads harmless).
        await loadRegistry();
        const entry = (registry || []).find(s => s.id === id);
        const preset = getPreset(entry?.presetId || DEFAULT_PRESET_ID);
        const sessionPrompt =
          entry?.systemPrompt || systemPrompt || preset.systemPrompt;
        try {
          await provisionPresetObjects(
            host,
            agentName,
            sessionGuest,
            id,
            preset.objects,
          );
        } catch (err) {
          console.warn(
            `[floot-factory] could not provision preset objects for session ${id}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
        const provider = await getProvider();
        const agent = await makeStreamingAgent(
          sessionGuest,
          undefined,
          { provider },
          sessionPrompt,
        );
        // Each session is addressable by mail: start following its inbox.
        agent.startInbox();
        return agent;
      })().catch(error => {
        agents.delete(id);
        throw error;
      });
      agents.set(id, agentP);
    }
    return agentP;
  };

  // Opaque session facet handed to the UI. It exposes a streaming conversation
  // and a history replay, but never reveals the backing guest.
  /** @type {Map<string, object>} */
  const facets = new Map();
  const getFacet = id => {
    let facet = facets.get(id);
    if (!facet) {
      facet = Far('FlootSession', {
        async getInfo() {
          await loadRegistry();
          const entry = (registry || []).find(s => s.id === id);
          return harden({
            id,
            title: entry?.title || '',
            createdAt: entry?.createdAt || 0,
            presetId: entry?.presetId || DEFAULT_PRESET_ID,
          });
        },
        /**
         * @param {string | object} input
         * @returns {object} replyReader
         */
        converse(input) {
          // Abort the in-flight turn when the consumer stops pulling the reply
          // (UI Stop / barge-in): makeReplyChannel fires onClose on
          // reader.return/throw, aborting the signal threaded into the provider
          // stream so the model stops generating instead of running on unseen.
          const controller = new AbortController();
          const { writer, reader } = makeReplyChannel(() => controller.abort());
          (async () => {
            try {
              const agent = await getAgent(id);
              await agent.converse(input, writer, undefined, controller.signal);
            } catch (error) {
              if (controller.signal.aborted) return;
              writer.abort(
                error instanceof Error ? error.message : String(error),
              );
            }
          })();
          return reader;
        },
        async getHistory() {
          const agent = await getAgent(id);
          return agent.getHistory();
        },
        async getUsage() {
          const agent = await getAgent(id);
          return agent.getUsage();
        },
        help() {
          return 'Floot session: converse(input) returns a streaming reply reader; getHistory() replays the conversation; getUsage() returns cumulative { inputTokens, outputTokens, turns }; getInfo() returns { id, title, createdAt }.';
        },
      });
      facets.set(id, facet);
    }
    return facet;
  };

  // Revive every session's inbox loop after a restart, without blocking make()
  // (the reincarnation-deadlock constraint forbids awaiting remote refs here).
  // Fire-and-forget: load the registry and build each agent, which starts its
  // inbox loop. New sessions start their loops in getAgent at creation time.
  const startAllInboxes = async () => {
    const reg = await loadRegistry();
    for (const s of reg) {
      getAgent(s.id).catch(error => {
        console.warn(
          `[floot-factory] could not start inbox for session-${s.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }
  };
  startAllInboxes().catch(error => {
    console.error(
      '[floot-factory] inbox revival error:',
      error instanceof Error ? error.message : String(error),
    );
  });

  return makeExo('FlootFactory', FlootFactoryInterface, {
    /**
     * @param {string} [title]
     * @param {string} [presetId]
     * @returns {Promise<object>} an opaque session facet
     */
    async createSession(title, presetId) {
      await loadRegistry();
      const preset = getPreset(presetId || DEFAULT_PRESET_ID);
      const id = newSessionId();
      // Snapshot the preset's id and prompt so later catalog edits don't change
      // a live session. The object set is re-read from the catalog by id in
      // getAgent (objects are provisioned once, idempotently).
      const entry = harden({
        id,
        title: title || 'New chat',
        createdAt: Date.now(),
        presetId: preset.id,
        systemPrompt: preset.systemPrompt,
      });
      /** @type {any[]} */ (registry).push(entry);
      await saveRegistry();
      // Build the agent now so the new session immediately follows its inbox
      // (addressable by mail without waiting for a first UI converse) and its
      // preset objects are provisioned up front.
      getAgent(id).catch(() => {});
      console.error(
        `[floot-factory] Created session "${id}" (preset "${preset.id}")`,
      );
      return getFacet(id);
    },

    /**
     * @returns {Promise<Array<{ id: string, title: string, createdAt: number, presetId: string }>>}
     */
    async listSessions() {
      await loadRegistry();
      return harden(
        (registry || []).map(({ id, title, createdAt, presetId }) => ({
          id,
          title,
          createdAt,
          presetId: presetId || DEFAULT_PRESET_ID,
        })),
      );
    },

    /**
     * @returns {Promise<Array<{ id: string, title: string, description: string }>>}
     */
    async listPresets() {
      return harden(
        PRESETS.map(({ id, title, description }) => ({
          id,
          title,
          description,
        })),
      );
    },

    /**
     * @param {string} id
     * @returns {Promise<object>} the session facet
     */
    async getSession(id) {
      await loadRegistry();
      if (!(registry || []).some(s => s.id === id)) {
        throw new Error(`Unknown session "${id}".`);
      }
      return getFacet(id);
    },

    /**
     * @param {string} id
     * @param {string} title
     */
    async renameSession(id, title) {
      await loadRegistry();
      const reg = registry || [];
      const idx = reg.findIndex(s => s.id === id);
      if (idx === -1) throw new Error(`Unknown session "${id}".`);
      // Entries are hardened, so replace rather than mutate in place.
      reg[idx] = harden({ ...reg[idx], title });
      await saveRegistry();
    },

    /**
     * @param {string} id
     */
    async deleteSession(id) {
      await loadRegistry();
      registry = (registry || []).filter(s => s.id !== id);
      await saveRegistry();
      agents.delete(id);
      facets.delete(id);
      // Best-effort removal of the backing session guest's persistence (both
      // the handle and the controlling agent petnames).
      try {
        const host = getHost();
        for (const name of [`session-${id}`, `session-agent-${id}`]) {
          if (await E(host).has(name)) {
            await E(host).remove(name);
          }
        }
      } catch (error) {
        console.warn(
          `[floot-factory] could not remove guest session-${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      console.error(`[floot-factory] Deleted session "${id}"`);
    },

    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return 'Floot factory: owns all chat sessions. createSession(title?, presetId?) -> session facet; listSessions() -> [{id,title,createdAt,presetId}]; listPresets() -> [{id,title,description}]; getSession(id) -> facet; renameSession(id,title); deleteSession(id). A session facet exposes converse(input) (streaming reply reader), getHistory(), and getInfo().';
      }
      const docs = {
        createSession:
          'createSession(title?, presetId?) — Create a new session (its own guest/petstore) seeded by a preset (default "general") and return an opaque session facet.',
        listSessions:
          'listSessions() — Return metadata [{id, title, createdAt, presetId}] for all sessions.',
        listPresets:
          'listPresets() — Return the available session presets [{id, title, description}].',
        getSession: 'getSession(id) — Return the session facet for an id.',
        renameSession: 'renameSession(id, title) — Rename a session.',
        deleteSession:
          'deleteSession(id) — Delete a session and its backing guest.',
      };
      return docs[methodName] || `No documentation for method "${methodName}".`;
    },
  });
};
harden(make);
