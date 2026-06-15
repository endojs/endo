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
// Persistence and provisioning match fae: per-agent conversation history lives
// in the agent guest's petstore via @endo/conversation-tree, and a per-agent
// driver caplet (driver.js) can be pinned to survive daemon restarts.

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import {
  makeConversationTree,
  makeEndoPetstoreBackend,
} from '@endo/conversation-tree';

import { createStreamingProvider } from './providers/index.js';

const FlootFactoryInterface = M.interface('FlootFactory', {
  createAgent: M.callWhen(M.string()).optional(M.record()).returns(M.string()),
  help: M.call().optional(M.string()).returns(M.string()),
});

const defaultSystemPrompt = `\
You are Floot, a warm, concise voice assistant living inside the Endo daemon.

Your replies are spoken aloud, so:
- Keep responses short and conversational — usually one to three sentences.
- Avoid markdown, code blocks, bullet lists, and emoji; write as you would speak.
- Answer directly. If you need to think, do it silently and give only the answer.
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
 * @returns {Promise<{ converse: (input: string | object, writer: object, sessionId?: string) => Promise<void> }>}
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

  // Each client-facing session is an independent conversation: its own root
  // (tagged with the sessionId in node metadata) and its own linear branch, so
  // switching sessions in the UI does not bleed context. The tree is a single
  // petstore-backed structure with one root per session. We cache the current
  // leaf per session in memory and rediscover it from the tree after a restart.
  /** @type {Map<string, string>} */
  const sessionLeaves = new Map();

  // Find or create the deepest leaf of a session's branch. A root matches when
  // its metadata.sessionId equals the session (legacy roots with no sessionId
  // are treated as 'default') AND its system prompt is current — if the prompt
  // changed we start a fresh root so stale instructions don't leak forward.
  const getOrCreateSessionLeaf = async sessionId => {
    const cached = sessionLeaves.get(sessionId);
    if (cached !== undefined) return cached;

    const roots = await tree.getRoots();
    for (const r of roots) {
      const node = await tree.getNode(r.id);
      const rootSession = node?.metadata?.sessionId || 'default';
      const rootMsg = node?.messages[0];
      if (
        node &&
        rootSession === sessionId &&
        rootMsg &&
        rootMsg.content === effectivePrompt
      ) {
        // Walk down the (linear) branch to its deepest node.
        let leaf = node.id;
        for (;;) {
          const kids = await tree.getChildren(leaf);
          if (!kids || kids.length === 0) break;
          leaf = kids[kids.length - 1].id;
        }
        sessionLeaves.set(sessionId, leaf);
        return leaf;
      }
    }

    const root = await tree.addNode(
      null,
      [{ role: 'system', content: effectivePrompt }],
      { sessionId },
    );
    sessionLeaves.set(sessionId, root.id);
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

  const runTurn = async (input, writer, sessionId) => {
    const text = await resolveUserText(input);
    const leafId = await getOrCreateSessionLeaf(sessionId);
    const userNode = await tree.addNode(leafId, [
      { role: 'user', content: `${text}` },
    ]);
    const conversationContext = await tree.getPath(userNode.id);
    console.log(
      `[floot] context has ${conversationContext.length} messages, streaming reply`,
    );

    writer.setPhase('thinking');
    let streamed = '';
    const { message } = await provider.chatStream(
      conversationContext,
      [],
      delta => {
        streamed += delta;
        writer.delta(delta);
      },
    );

    const content = (message && message.content) || streamed;
    const assistantNode = await tree.addNode(userNode.id, [
      { role: 'assistant', content },
    ]);
    sessionLeaves.set(sessionId, assistantNode.id);

    writer.final(content);
    writer.end();
  };

  const converse = (input, writer, sessionId = 'default') => {
    const session = sessionId || 'default';
    const result = turnChain.then(() => runTurn(input, writer, session));
    // Keep the chain alive even if a turn rejects (the writer already aborts).
    turnChain = result.catch(() => {});
    return result;
  };

  return harden({ converse });
};
harden(makeStreamingAgent);

// ============================================================================
// Floot Factory — entry point (mirrors fae's factory recipe)
// ============================================================================

const driverSpecifier = new URL('driver.js', import.meta.url).href;

/**
 * Creates a Floot factory that provisions and manages streaming agents.
 *
 * The LLM is configured programmatically per agent (provider/model/authToken
 * passed to `createAgent`), defaulting to the Anthropic API endpoint. The config
 * — including the API key — is stored as a value and handed to the driver as a
 * capability reference (`llm-provider`), the same handle pattern fae uses. Each
 * agent gets its own guest (conversation history) and a driver caplet
 * (driver.js) whose result — a Far object with a streaming `converse` method —
 * is named in the inventory for clients to look up and call.
 *
 * @param {import('@endo/eventual-send').FarRef<object>} guestPowers
 * @param {Promise<object> | object | undefined} _context
 * @returns {Promise<object>}
 */
export const make = async (guestPowers, _context) => {
  /** @type {any} */
  const powers = guestPowers;

  const hostAgent = await E(powers).lookup('host-agent');

  return makeExo('FlootFactory', FlootFactoryInterface, {
    /**
     * @param {string} name
     * @param {{
     *   systemPrompt?: string,
     *   pin?: boolean,
     *   provider?: string,
     *   model?: string,
     *   authToken?: string,
     * }} [options]
     * @returns {Promise<string>} The driver result name (the converse handle)
     */
    async createAgent(name, options = {}) {
      const { systemPrompt, pin, provider, model, authToken } = options;

      const guestName = name;
      const profileName = `profile-for-${guestName}`;
      const driverHandleName = `${name}-driver-handle`;
      const driverProfileName = `profile-for-${driverHandleName}`;
      const driverResultName = `${name}-driver`;

      if (await E(hostAgent).has(driverResultName)) {
        throw new Error(`Agent "${name}" already exists.`);
      }

      // 1. Agent guest holds the conversation history petstore.
      await E(hostAgent).provideGuest(guestName, { agentName: profileName });

      // 2. Driver guest namespace holds the agent petstore ref. The LLM
      // provider is NOT stored here — it is configured programmatically from
      // the driver caplet's env below.
      const driverGuest = await E(hostAgent).provideGuest(driverHandleName, {
        agentName: driverProfileName,
      });

      const agentLocator = await E(hostAgent).locate(profileName);
      await E(driverGuest).storeLocator('agent', agentLocator);

      // 3. Store the provider config (incl. the API key) as a value and hand
      // the driver a capability reference to it — the fae pattern. The secret
      // lives behind a handle in the petstore, not inlined in the driver's env.
      const providerConfigName = `llm-provider-for-${guestName}`;
      await E(hostAgent).storeValue(
        harden({
          provider: provider || 'anthropic',
          model: model || '',
          authToken: authToken || '',
        }),
        providerConfigName,
      );
      const providerLocator = await E(hostAgent).locate(providerConfigName);
      await E(driverGuest).storeLocator('llm-provider', providerLocator);

      // 4. Launch the driver caplet; its result exposes converse().
      await E(hostAgent).makeUnconfined('@main', driverSpecifier, {
        powersName: driverProfileName,
        resultName: driverResultName,
        env: harden({ FLOOT_SYSTEM_PROMPT: systemPrompt || '' }),
      });

      // 5. Pin so the driver auto-restarts on daemon reboot.
      if (pin) {
        await E(hostAgent).copy(
          [driverResultName],
          ['@pins', driverResultName],
        );
        console.log(`[floot-factory] Pinned driver "${driverResultName}"`);
      }

      console.log(`[floot-factory] Created agent "${name}"`);
      return driverResultName;
    },

    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return 'Floot factory: creates streaming LLM agents bound to a configured provider. Use createAgent(name, { systemPrompt, pin }); the returned name resolves to a driver whose converse(text) returns a streaming reply reader.';
      }
      if (methodName === 'createAgent') {
        return 'createAgent(name, { systemPrompt?, pin? }) — Create a streaming agent. Returns the driver result name; look it up and call converse(text) to get a Far reply reader.';
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
harden(make);
