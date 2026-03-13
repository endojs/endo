// @ts-check
/* global window */

import { useState, useEffect, useCallback, useRef } from 'react';
import { E } from '@endo/far';
import {
  makeConversationTree,
  makeMemoryBackend,
} from '@endo/conversation-tree';

/** @import { ConversationNode, ConversationTree } from '@endo/conversation-tree/types.js' */

/**
 * @typedef {object} ParsedResponse
 * @property {string} narrative
 * @property {{ title: string, html: string } | null} scene
 * @property {'json' | 'regex' | 'raw'} method - How the response was parsed:
 *   'json'  = clean JSON.parse succeeded
 *   'regex' = JSON.parse failed, regex fallback extracted fields
 *   'raw'   = no structured data found, entire text is narrative
 * @property {string} [parseError] - Present when method is 'raw' and text
 *   appeared to be JSON (starts with '{'), explaining what went wrong
 */

/** @type {Record<string, string>} */
const JSON_ESCAPE_MAP = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

/**
 * Unescape a JSON string value leniently.
 * Handles standard JSON escapes plus invalid ones like \' that LLMs
 * produce when embedding JavaScript inside JSON strings.
 *
 * @param {string} raw - Captured regex group (without outer quotes)
 * @returns {string}
 */
const lenientUnescape = raw => {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    // JSON.parse failed (likely due to \' or other non-standard escapes).
    return raw.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, ch) => {
      if (ch.startsWith('u')) {
        return String.fromCharCode(parseInt(ch.slice(1), 16));
      }
      return JSON_ESCAPE_MAP[ch] ?? ch;
    });
  }
};

/**
 * Try to parse an LLM response as a Whylip JSON object.
 * Falls back to treating the whole string as narrative.
 *
 * Handles several edge cases:
 * - Code-fenced JSON (```json ... ```)
 * - Double-encoded JSON strings
 * - Greedy regex extraction when full parse fails
 * - Invalid JSON escapes like \' from embedded JavaScript
 *
 * @param {string} text
 * @returns {ParsedResponse}
 */
const parseResponse = text => {
  let trimmed = text.trim();

  // Strip markdown code fences if present
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    trimmed = fenceMatch[1].trim();
  }

  /**
   * @param {unknown} obj
   * @param {'json' | 'regex'} method
   * @returns {ParsedResponse}
   */
  const extractFromParsed = (obj, method) => {
    const o = /** @type {Record<string, unknown>} */ (obj);
    const narrative = typeof o.narrative === 'string' ? o.narrative : trimmed;
    const s = /** @type {Record<string, unknown> | null} */ (o.scene);
    const scene =
      s && typeof s.html === 'string' && typeof s.title === 'string'
        ? /** @type {{ title: string, html: string }} */ (s)
        : null;
    return { narrative, scene, method };
  };

  // Try parsing the whole string directly
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      return extractFromParsed(parsed, 'json');
    }
  } catch {
    // not direct JSON
  }

  // Try extracting a JSON object via regex (greedy, first { to last })
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === 'object') {
        return extractFromParsed(parsed, 'json');
      }
    } catch {
      // regex match wasn't valid JSON
    }
  }

  // Fallback: try to extract narrative and scene fields with targeted regexes.
  // This handles cases where JSON.parse fails due to invalid escapes
  // (e.g., \' from JS single-quote escapes in embedded HTML).
  const narrativeMatch = trimmed.match(/"narrative"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const sceneTitleMatch = trimmed.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const sceneHtmlMatch = trimmed.match(
    /"html"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"\s*\}\s*\}$/,
  );

  if (narrativeMatch) {
    const narrative = lenientUnescape(narrativeMatch[1]);

    /** @type {{ title: string, html: string } | null} */
    let scene = null;
    if (sceneTitleMatch && sceneHtmlMatch) {
      const title = lenientUnescape(sceneTitleMatch[1]);
      const html = lenientUnescape(sceneHtmlMatch[1]);
      scene = { title, html };
    }

    return { narrative, scene, method: 'regex' };
  }

  // Total fallback — check if the text *looks* like it was trying to be JSON
  const looksLikeJson =
    trimmed.startsWith('{') && trimmed.includes('"narrative"');
  if (looksLikeJson) {
    return {
      narrative: trimmed,
      scene: null,
      method: 'raw',
      parseError:
        'Your response could not be parsed as JSON. Ensure the reply ' +
        'contains a single valid JSON object with "narrative" and "scene" ' +
        "fields. Avoid JavaScript escapes like \\' inside JSON strings — " +
        'use Unicode escapes (\\u0027) instead.',
    };
  }

  return { narrative: trimmed, scene: null, method: 'raw' };
};

/**
 * @typedef {object} TreeNode
 * @property {string} id
 * @property {string | null} parentId
 * @property {'user' | 'assistant' | 'system'} role
 * @property {string} content
 * @property {ParsedResponse | null} parsed
 * @property {ConversationNode[]} children
 */

/**
 * React hook that manages the Whylip conversation state.
 * Syncs from the endo mailbox and maintains a local conversation tree.
 *
 * @param {unknown} powers - Resolved endo powers (the fae agent's profile)
 */
export const useConversation = powers => {
  const [tree] = useState(() => makeConversationTree(makeMemoryBackend()));
  /** @type {[TreeNode[], (n: TreeNode[]) => void]} */
  const [nodes, setNodes] = useState([]);
  /** @type {[string | null, (id: string | null) => void]} */
  const [activeNodeId, setActiveNodeId] = useState(null);
  /** @type {[ParsedResponse | null, (p: ParsedResponse | null) => void]} */
  const [activeScene, setActiveScene] = useState(null);
  /** @type {[string, (n: string) => void]} */
  const [activeNarrative, setActiveNarrative] = useState('');
  /** @type {[boolean, (b: boolean) => void]} */
  const [sending, setSending] = useState(false);

  const treeRef = useRef(tree);
  /** Track format-error retries to avoid infinite correction loops */
  const formatRetryRef = useRef(0);

  /**
   * Rebuild the flat node list from the tree for rendering.
   */
  const refreshNodes = useCallback(async () => {
    const roots = await treeRef.current.getRoots();
    /** @type {TreeNode[]} */
    const flat = [];

    /**
     * @param {ConversationNode} node
     * @param {number} _depth
     */
    const walk = async (node, _depth) => {
      const firstMsg = node.messages[0];
      const role = /** @type {'user' | 'assistant' | 'system'} */ (
        firstMsg?.role || 'system'
      );
      const content = firstMsg?.content || '';
      let parsed = null;
      if (role === 'assistant') {
        parsed = parseResponse(content);
      }

      const children = await treeRef.current.getChildren(node.id);

      flat.push({
        id: node.id,
        parentId: node.parentId,
        role,
        content,
        parsed,
        children: [],
      });

      for (const child of children) {
        await walk(child, _depth + 1);
      }
    };

    for (const root of roots) {
      await walk(root, 0);
    }

    setNodes(flat);
  }, []);

  /**
   * Initialize: sync from mailbox and start streaming.
   */
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const selfId = await E(/** @type {any} */ (powers)).identify('SELF');

        const messages = /** @type {any[]} */ (
          await E(/** @type {any} */ (powers)).listMessages()
        );

        // Map endo messageIds to tree node IDs for threading
        /** @type {Map<string, string>} */
        const messageToNodeId = new Map();

        for (const msg of messages) {
          if (cancelled) return;

          const { messageId, replyTo, from: fromId, strings, type } = msg;
          if (!messageId) continue;

          let text = '';
          if (type === 'package' && Array.isArray(strings)) {
            text = strings.join('').trim();
          }

          const role = fromId === selfId ? 'user' : 'assistant';
          let parentId = null;
          if (typeof replyTo === 'string' && messageToNodeId.has(replyTo)) {
            parentId = messageToNodeId.get(replyTo) || null;
          }

          const node = await treeRef.current.addNode(
            parentId,
            [{ role, content: text }],
            { messageId },
          );
          messageToNodeId.set(messageId, node.id);

          if (role === 'assistant') {
            const parsed = parseResponse(text);
            setActiveScene(parsed.scene);
            setActiveNarrative(parsed.narrative);
            setActiveNodeId(node.id);
          }
        }

        await refreshNodes();

        // Stream new messages
        const iterRef = E(/** @type {any} */ (powers)).followMessages();
        const iter = {
          [Symbol.asyncIterator]() {
            return {
              /** @returns {Promise<IteratorResult<any>>} */
              async next() {
                const result = await E(iterRef).next();
                return {
                  done: !!result.done,
                  value: result.value,
                };
              },
            };
          },
        };

        const MAX_FORMAT_RETRIES = 1;

        for await (const msg of iter) {
          if (cancelled) break;

          const { messageId, replyTo, from: fromId, strings, type } = msg;
          if (!messageId) continue;

          // Skip messages already processed during init
          if (messageToNodeId.has(messageId)) continue;

          // Skip our own outgoing messages (already tracked on send)
          if (fromId === selfId) continue;

          let text = '';
          if (type === 'package' && Array.isArray(strings)) {
            text = strings.join('').trim();
          }

          let parentId = null;
          if (typeof replyTo === 'string' && messageToNodeId.has(replyTo)) {
            parentId = messageToNodeId.get(replyTo) || null;
          }

          const node = await treeRef.current.addNode(
            parentId,
            [{ role: 'assistant', content: text }],
            { messageId },
          );
          messageToNodeId.set(messageId, node.id);

          const parsed = parseResponse(text);

          // If the response looks like malformed JSON and we haven't
          // exhausted retries, send the error back to the agent so it
          // can reformat its answer.
          if (
            parsed.parseError &&
            formatRetryRef.current < MAX_FORMAT_RETRIES
          ) {
            formatRetryRef.current += 1;
            console.warn(
              '[whylip] Parse error, requesting reformat:',
              parsed.parseError,
            );
            setActiveNarrative('Reformatting response...');

            await E(/** @type {any} */ (powers)).send(
              'fae',
              [
                `FORMAT_ERROR: ${parsed.parseError}\n\n` +
                  'Here is your previous response that failed to parse:\n' +
                  text,
              ],
              [],
              [],
            );
            continue;
          }

          setActiveScene(parsed.scene);
          setActiveNarrative(parsed.narrative);
          setActiveNodeId(node.id);
          setSending(false);
          formatRetryRef.current = 0;

          await refreshNodes();
        }
      } catch (err) {
        console.error('[whylip] useConversation init error:', err);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [powers, refreshNodes]);

  /**
   * Send a message to the fae agent.
   *
   * @param {string} text
   */
  const send = useCallback(
    async text => {
      if (!text.trim()) return;
      setSending(true);
      formatRetryRef.current = 0;

      try {
        const userNode = await treeRef.current.addNode(activeNodeId, [
          { role: 'user', content: text },
        ]);
        setActiveNodeId(userNode.id);
        await refreshNodes();

        // Send to fae agent via the well-known "fae" petname
        // written into this profile's pet store at space creation time.
        await E(/** @type {any} */ (powers)).send('fae', [text], [], []);
      } catch (err) {
        console.error('[whylip] send error:', err);
        setSending(false);
      }
    },
    [activeNodeId, powers, refreshNodes],
  );

  /**
   * Navigate to a different node in the tree (for branching).
   *
   * @param {string} nodeId
   */
  const navigateTo = useCallback(async nodeId => {
    const node = await treeRef.current.getNode(nodeId);
    if (!node) return;

    setActiveNodeId(nodeId);

    const firstMsg = node.messages[0];
    if (firstMsg && firstMsg.role === 'assistant') {
      const parsed = parseResponse(firstMsg.content);
      setActiveScene(parsed.scene);
      setActiveNarrative(parsed.narrative);
    }
  }, []);

  return {
    nodes,
    activeNodeId,
    activeScene,
    activeNarrative,
    sending,
    send,
    navigateTo,
  };
};
