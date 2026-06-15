// @ts-nocheck - E() generics don't work well with JSDoc types for remote objects
/* eslint-disable no-await-in-loop */

// Floot — a streaming agent harness for the Endo daemon.
//
// Floot mirrors fae's factory/driver/guest topology (see @endo/fae) but trades
// fae's mailbox-driven, fully-buffered reply for a *pull-based streaming*
// interface: the agent exposes `converse(text) -> replyReader`, where
// replyReader is a Far StreamReader (src/stream.js) that yields reply-token
// deltas as the LLM produces them. This is the same wire the voice Space
// already consumes for transcripts (audio-server-caplet.mjs), so a client can
// stream the assistant's reply token-by-token and (later) feed it to TTS.
//
// Persistence and provisioning match fae: per-session conversation history lives
// in the session guest's petstore via @endo/conversation-tree, and a single
// pinned factory caplet revives every session on daemon restart.

import { makeExo } from '@endo/exo';
import { Far } from '@endo/far';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
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
} from '@endo/fae/src/tool-makers.js';

import { createStreamingProvider } from './providers/index.js';
import { makeReplyChannel } from './src/stream.js';

// Cap the tool-call loop so a misbehaving model can't spin forever before it
// produces a spoken reply.
const MAX_TOOL_ROUNDS = 8;

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
    end: () => settle({ ok: true, text }),
    /** @param {unknown} reason */
    abort: reason => settle({ ok: false, error: `${reason}` }),
  });
  return { writer, done };
};

const FlootFactoryInterface = M.interface('FlootFactory', {
  createSession: M.callWhen().optional(M.string()).returns(M.remotable()),
  listSessions: M.callWhen().returns(M.arrayOf(M.record())),
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

You have tools for working with the Endo daemon and your own petstore: list,
lookup, store, remove, and exec (run JavaScript with your guest powers). Use
them silently to get things done, then speak only the result — never read code
or raw tool output aloud.
`;

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
 * @returns {Promise<{ converse: (input: string | object, writer: object) => Promise<void>, getHistory: () => Promise<Array<{role: string, content: string}>>, startInbox: () => void }>}
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

  // One session = one guest = one linear conversation. The guest's petstore
  // holds a single conversation-tree root (the system prompt) and a linear
  // branch beneath it. We cache the current leaf in memory and rediscover it
  // from the tree on first use after a restart. A root matches only when its
  // system prompt is current — if the prompt changed we start a fresh root so
  // stale instructions don't leak forward.
  /** @type {string | undefined} */
  let cachedLeaf;

  const getOrCreateLeaf = async () => {
    if (cachedLeaf !== undefined) return cachedLeaf;

    const roots = await tree.getRoots();
    for (const r of roots) {
      const node = await tree.getNode(r.id);
      const rootMsg = node?.messages[0];
      if (node && rootMsg && rootMsg.content === effectivePrompt) {
        // Walk down the (linear) branch to its deepest node.
        let leaf = node.id;
        for (;;) {
          const kids = await tree.getChildren(leaf);
          if (!kids || kids.length === 0) break;
          leaf = kids[kids.length - 1].id;
        }
        cachedLeaf = leaf;
        return leaf;
      }
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

  const runTurn = async (input, writer) => {
    const text = await resolveUserText(input);
    const baseLeafId = await getOrCreateLeaf();
    const userNode = await tree.addNode(baseLeafId, [
      { role: 'user', content: `${text}` },
    ]);

    // Agentic loop: stream a reply; if it calls tools, run them, persist the
    // assistant turn plus tool results, and loop again until the model returns a
    // plain (spoken) answer. Tools are re-discovered each round so anything the
    // model creates mid-turn (e.g. via exec/store) is immediately callable.
    let leafId = userNode.id;
    let finalContent = '';
    writer.setPhase('thinking');

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const { schemas, toolMap } = await discoverTools(powers, localTools);
      const conversationContext = await tree.getPath(leafId);
      console.log(
        `[floot] round ${round}: ${conversationContext.length} messages, ${schemas.length} tools`,
      );

      let streamed = '';
      const { message } = await provider.chatStream(
        conversationContext,
        schemas,
        delta => {
          streamed += delta;
          writer.delta(delta);
        },
      );

      const rm = message || { role: 'assistant', content: streamed };
      const toolCalls = Array.isArray(rm.tool_calls) ? rm.tool_calls : [];

      if (toolCalls.length === 0) {
        finalContent = rm.content || streamed;
        const finalNode = await tree.addNode(leafId, [rm]);
        leafId = finalNode.id;
        break;
      }

      writer.setPhase('using tools');
      /** @type {Array<{ role: 'tool', tool_call_id: string, content: string }>} */
      const toolResults = [];
      for (const tc of toolCalls) {
        const name = tc.function?.name;
        let args = {};
        try {
          args =
            typeof tc.function?.arguments === 'string'
              ? JSON.parse(tc.function.arguments || '{}')
              : tc.function?.arguments || {};
        } catch {
          args = {};
        }
        let resultText;
        try {
          resultText = await executeTool(name, args, toolMap);
        } catch (err) {
          resultText = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
        console.log(`[floot] tool ${name} -> ${resultText}`);
        toolResults.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: `${resultText}`,
        });
      }

      const stepNode = await tree.addNode(leafId, [rm, ...toolResults]);
      leafId = stepNode.id;
      writer.setPhase('thinking');
    }

    cachedLeaf = leafId;
    writer.final(finalContent);
    writer.end();
  };

  const converse = (input, writer) => {
    const result = turnChain.then(() => runTurn(input, writer));
    // Keep the chain alive even if a turn rejects (the writer already aborts).
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
      const messages = makeRefIterator(E(powers).followMessages());
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
            } else {
              text = `(${type || 'unknown'} message)`;
            }

            const { writer, done: turnDone } = makeBufferingWriter();
            // Route through converse so the turn joins turnChain and shares context.
            converse(text, writer);
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

  // Replay the spoken conversation for UI repaint: just the user prompts and the
  // assistant's final answers (system + tool-call/tool-result turns omitted).
  const getHistory = async () => {
    const leafId = await getOrCreateLeaf();
    const path = await tree.getPath(leafId);
    return harden(
      path
        .filter(
          m =>
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string' &&
            m.content.trim() !== '',
        )
        .map(m => ({ role: m.role, content: m.content })),
    );
  };

  return harden({ converse, getHistory, startInbox });
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
  const saveRegistry = async () => {
    if (await E(powers).has(REGISTRY_NAME)) {
      await E(powers).remove(REGISTRY_NAME);
    }
    await E(powers).storeValue(harden([...(registry || [])]), REGISTRY_NAME);
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
        const provider = await getProvider();
        const agent = await makeStreamingAgent(
          sessionGuest,
          undefined,
          { provider },
          systemPrompt,
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
          });
        },
        /**
         * @param {string | object} input
         * @returns {object} replyReader
         */
        converse(input) {
          const { writer, reader } = makeReplyChannel();
          (async () => {
            try {
              const agent = await getAgent(id);
              await agent.converse(input, writer);
            } catch (error) {
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
        help() {
          return 'Floot session: converse(input) returns a streaming reply reader; getHistory() replays the conversation; getInfo() returns { id, title, createdAt }.';
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
     * @returns {Promise<object>} an opaque session facet
     */
    async createSession(title) {
      await loadRegistry();
      const id = newSessionId();
      const entry = harden({
        id,
        title: title || 'New chat',
        createdAt: Date.now(),
      });
      /** @type {any[]} */ (registry).push(entry);
      await saveRegistry();
      // Build the agent now so the new session immediately follows its inbox
      // (addressable by mail without waiting for a first UI converse).
      getAgent(id).catch(() => {});
      console.log(`[floot-factory] Created session "${id}"`);
      return getFacet(id);
    },

    /**
     * @returns {Promise<Array<{ id: string, title: string, createdAt: number }>>}
     */
    async listSessions() {
      await loadRegistry();
      return harden((registry || []).map(s => ({ ...s })));
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
      const entry = (registry || []).find(s => s.id === id);
      if (!entry) throw new Error(`Unknown session "${id}".`);
      entry.title = title;
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
      console.log(`[floot-factory] Deleted session "${id}"`);
    },

    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return 'Floot factory: owns all chat sessions. createSession(title?) -> session facet; listSessions() -> [{id,title,createdAt}]; getSession(id) -> facet; renameSession(id,title); deleteSession(id). A session facet exposes converse(input) (streaming reply reader), getHistory(), and getInfo().';
      }
      const docs = {
        createSession:
          'createSession(title?) — Create a new session (its own guest/petstore) and return an opaque session facet.',
        listSessions:
          'listSessions() — Return metadata [{id, title, createdAt}] for all sessions.',
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
