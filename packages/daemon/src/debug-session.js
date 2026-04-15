// @ts-check

/// <reference types="ses" />

/**
 * @import { DebugSession, BreakEvent, Frame, Property } from './types.js'
 */

import { makeError, q, X } from '@endo/errors';

/**
 * @typedef {object} XmlElement
 * @property {string} name
 * @property {Record<string, string>} attrs
 * @property {XmlElement[]} [children]
 * @property {XmlElement} [parent]
 * @property {string} [data]
 */

/**
 * @typedef {object} PendingCommand
 * @property {(value: any) => void} resolve
 * @property {(reason: any) => void} reject
 */

// ---------------------------------------------------------------------------
// Minimal SAX parser for xsbug XML
// ---------------------------------------------------------------------------

/**
 * Decode XML entities in a string.
 *
 * @param {string} s
 * @returns {string}
 */
const decodeEntities = s => {
  let result = s;
  // Use split/join instead of regex for Jessie compatibility.
  result = result.split('&amp;').join('&');
  result = result.split('&lt;').join('<');
  result = result.split('&gt;').join('>');
  result = result.split('&quot;').join('"');
  result = result.split('&apos;').join("'");
  return result;
};
harden(decodeEntities);

/**
 * Parse attributes from a tag body string like
 * `path="/foo" line="42"`.
 *
 * @param {string} s
 * @returns {Record<string, string>}
 */
const parseAttrs = s => {
  /** @type {Record<string, string>} */
  const attrs = {};
  let i = 0;
  while (i < s.length) {
    // Skip whitespace.
    while (i < s.length && s[i] === ' ') i += 1;
    if (i >= s.length) break;
    // Read attribute name.
    const eqIdx = s.indexOf('=', i);
    if (eqIdx < 0) break;
    const name = s.slice(i, eqIdx);
    i = eqIdx + 1;
    // Read quoted value.
    if (i >= s.length || s[i] !== '"') break;
    i += 1;
    const closeQuote = s.indexOf('"', i);
    if (closeQuote < 0) break;
    attrs[name] = decodeEntities(s.slice(i, closeQuote));
    i = closeQuote + 1;
  }
  return attrs;
};
harden(parseAttrs);

/**
 * Minimal streaming XML parser for the xsbug protocol.
 * Calls `onOpen(name, attrs, selfClosing)`, `onClose(name)`,
 * and `onText(data)`.
 *
 * @param {object} handlers
 * @param {(name: string, attrs: Record<string, string>, selfClosing: boolean) => void} handlers.onOpen
 * @param {(name: string) => void} handlers.onClose
 * @param {(data: string) => void} handlers.onText
 * @returns {{ feed: (chunk: string) => void }}
 */
const makeSaxParser = ({ onOpen, onClose, onText }) => {
  let buf = '';

  const feed = chunk => {
    buf += chunk;
    for (;;) {
      // Look for CDATA.
      const cdataStart = buf.indexOf('<![CDATA[');
      const tagStart = buf.indexOf('<');
      if (tagStart < 0) {
        // No tags — everything is text.
        if (buf.length > 0) {
          onText(buf);
          buf = '';
        }
        return;
      }
      // Emit text before the tag.
      if (tagStart > 0) {
        onText(decodeEntities(buf.slice(0, tagStart)));
        buf = buf.slice(tagStart);
        continue;
      }
      // CDATA?
      if (cdataStart === 0) {
        const cdataEnd = buf.indexOf(']]>');
        if (cdataEnd < 0) return; // incomplete
        onText(buf.slice(9, cdataEnd));
        buf = buf.slice(cdataEnd + 3);
        continue;
      }
      // Closing tag?
      if (buf.length > 1 && buf[1] === '/') {
        const end = buf.indexOf('>');
        if (end < 0) return; // incomplete
        const name = buf.slice(2, end).trim();
        onClose(name);
        buf = buf.slice(end + 1);
        continue;
      }
      // Opening / self-closing tag.
      const end = buf.indexOf('>');
      if (end < 0) return; // incomplete
      const inner = buf.slice(1, end);
      const selfClosing = inner.endsWith('/');
      const body = selfClosing ? inner.slice(0, -1) : inner;
      const spaceIdx = body.indexOf(' ');
      let name;
      let attrStr;
      if (spaceIdx < 0) {
        name = body.trim();
        attrStr = '';
      } else {
        name = body.slice(0, spaceIdx);
        attrStr = body.slice(spaceIdx + 1).trim();
      }
      if (name.length > 0) {
        const attrs = attrStr.length > 0 ? parseAttrs(attrStr) : {};
        onOpen(name, attrs, selfClosing);
        if (selfClosing) {
          onClose(name);
        }
      }
      buf = buf.slice(end + 1);
    }
  };

  return harden({ feed });
};
harden(makeSaxParser);

// ---------------------------------------------------------------------------
// DebugSession
// ---------------------------------------------------------------------------

/**
 * Create a debug session that speaks the xsbug XML protocol.
 *
 * @param {(xmlBytes: Uint8Array) => void} sendToWorker
 *   Callback to send raw XML bytes to the target worker via the
 *   envelope bus.
 * @returns {DebugSession}
 */
export const makeDebugSession = sendToWorker => {
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  // --- State ---
  /** @type {XmlElement | null} */
  let current = null;
  /** @type {string | undefined} */
  let title;
  /** @type {string | undefined} */
  let tag;
  /** @type {boolean} */
  let broken = false;
  /** @type {BreakEvent | null} */
  let lastBreak = null;
  /** @type {Frame[]} */
  let lastFrames = [];
  /** @type {Property[]} */
  let lastLocals = [];
  /** @type {Property[]} */
  let lastGlobals = [];
  /** @type {Array<{path: string, line: string}>} */
  let lastBreakpoints = [];
  /** @type {Array<{name: string, path: string}>} */
  let lastFiles = [];

  // Break listeners (for followBreaks).
  /** @type {Array<(event: BreakEvent) => void>} */
  const breakListeners = [];

  // Pending command promises, keyed by expected response element.
  /** @type {Map<string, PendingCommand>} */
  const pending = new Map();

  /**
   * Resolve a pending command if one exists for the given key.
   *
   * @param {string} key
   * @param {any} value
   */
  const resolvePending = (key, value) => {
    const p = pending.get(key);
    if (p) {
      pending.delete(key);
      p.resolve(value);
    }
  };

  // --- SAX event handlers ---

  const parser = makeSaxParser({
    onOpen(name, attrs, _selfClosing) {
      /** @type {XmlElement} */
      const el = { name, attrs };
      switch (name) {
        case 'xsbug':
          break;
        case 'breakpoint':
        case 'instrument':
        case 'file':
        case 'frame':
          if (current && current.children) {
            current.children.push(el);
          }
          el.parent = current || undefined;
          break;
        case 'node':
        case 'property':
          if (current && current.children) {
            current.children.push(el);
          }
          el.parent = current || undefined;
          el.children = [];
          break;
        case 'break':
        case 'bubble':
        case 'eval':
        case 'log':
        case 'ps':
        case 'samples':
          el.data = '';
          break;
        case 'breakpoints':
        case 'instruments':
        case 'files':
        case 'frames':
        case 'global':
        case 'local':
          el.children = [];
          break;
        default:
          break;
      }
      current = el;
    },

    onClose(name) {
      const el = current;
      if (!el) return;
      current = el.parent || null;

      switch (name) {
        case 'breakpoint':
        case 'instrument':
        case 'file':
        case 'frame':
        case 'node':
        case 'property':
          delete el.parent;
          break;
        case 'break': {
          const event = harden({
            path: el.attrs.path || '',
            line: Number(el.attrs.line || '0'),
            message: el.data || '',
          });
          lastBreak = event;
          broken = true;
          resolvePending('break', event);
          for (const listener of breakListeners) {
            try {
              listener(event);
            } catch (_e) {
              // ignore listener errors
            }
          }
          break;
        }
        case 'breakpoints':
          lastBreakpoints = (el.children || []).map(c =>
            harden({ path: c.attrs.path || '', line: c.attrs.line || '0' }),
          );
          resolvePending('breakpoints', lastBreakpoints);
          break;
        case 'bubble':
          resolvePending('bubble', harden({
            name: el.attrs.name || '',
            value: el.attrs.value || '',
            path: el.attrs.path || '',
            line: Number(el.attrs.line || '0'),
            message: el.data || '',
          }));
          break;
        case 'eval':
          resolvePending('eval', el.data || '');
          break;
        case 'files':
          lastFiles = (el.children || []).map(c =>
            harden({ name: c.attrs.name || '', path: c.attrs.path || '' }),
          );
          resolvePending('files', lastFiles);
          break;
        case 'frames':
          lastFrames = (el.children || []).map(c =>
            harden({
              name: c.attrs.name || '',
              value: c.attrs.value || '',
              path: c.attrs.path || '',
              line: Number(c.attrs.line || '0'),
            }),
          );
          resolvePending('frames', lastFrames);
          break;
        case 'global':
          lastGlobals = mapProperties(el.children || []);
          resolvePending('global', lastGlobals);
          break;
        case 'local':
          lastLocals = mapProperties(el.children || []);
          resolvePending('local', lastLocals);
          break;
        case 'login':
          title = el.attrs.name;
          tag = el.attrs.value;
          resolvePending('login', harden({ name: title, tag }));
          break;
        case 'log':
          resolvePending('log', harden({
            path: el.attrs.path || '',
            line: Number(el.attrs.line || '0'),
            message: el.data || '',
          }));
          break;
        default:
          break;
      }
    },

    onText(data) {
      if (current && 'data' in current) {
        current.data += data;
      }
    },
  });

  // --- Helpers ---

  /**
   * Map XML child elements to Property records.
   *
   * @param {XmlElement[]} children
   * @returns {Property[]}
   */
  const mapProperties = children =>
    children.map(c =>
      harden({
        name: c.attrs.name || '',
        value: c.attrs.value || '',
        flags: c.attrs.flags || '',
        children: c.children ? mapProperties(c.children) : undefined,
      }),
    );

  /**
   * Send an XML command string to the worker.
   *
   * @param {string} xml
   */
  const sendCommand = xml => {
    // xsbug protocol prefixes commands with BOM + \r\n.
    const full = `\r\n${xml}\r\n`;
    sendToWorker(textEncoder.encode(full));
  };

  /**
   * Send a command and return a promise that resolves when the
   * expected response element arrives.
   *
   * @param {string} xml
   * @param {string} expectKey
   * @returns {Promise<any>}
   */
  const commandWithResponse = (xml, expectKey) => {
    const { promise, resolve, reject } = /** @type {PromiseKit<any>} */ (
      Promise.withResolvers()
    );
    pending.set(expectKey, { resolve, reject });
    sendCommand(xml);
    return promise;
  };

  // --- Public API ---

  /** @type {DebugSession} */
  const session = {
    feedXml(bytes) {
      const text = textDecoder.decode(bytes);
      parser.feed(text);
    },

    // Stepping commands
    go() {
      broken = false;
      sendCommand('<go/>');
    },
    step() {
      broken = false;
      sendCommand('<step/>');
      return commandWithResponse('', 'break');
    },
    stepIn() {
      broken = false;
      sendCommand('<step-inside/>');
      return commandWithResponse('', 'break');
    },
    stepOut() {
      broken = false;
      sendCommand('<step-outside/>');
      return commandWithResponse('', 'break');
    },
    abort() {
      sendCommand('<abort/>');
    },

    // Breakpoints
    setBreakpoint(path, line) {
      sendCommand(`<set-breakpoint path="${path}" line="${line}"/>`);
    },
    clearBreakpoint(path, line) {
      sendCommand(`<clear-breakpoint path="${path}" line="${line}"/>`);
    },
    clearAllBreakpoints() {
      sendCommand('<clear-all-breakpoints/>');
    },

    // Inspection
    getFrames() {
      return commandWithResponse('<select id="0"/>', 'frames');
    },
    getLocals() {
      return commandWithResponse('', 'local');
    },
    getGlobals() {
      return commandWithResponse('', 'global');
    },
    selectFrame(id) {
      return commandWithResponse(`<select id="${id}"/>`, 'local');
    },
    toggleProperty(id) {
      return commandWithResponse(`<toggle id="${id}"/>`, 'local');
    },
    evaluate(source) {
      const xml =
        `<script path="(debug)" line="0"><![CDATA[${source}]]></script>`;
      return commandWithResponse(xml, 'eval');
    },

    // Profiling
    startProfiling() {
      sendCommand('<start-profiling/>');
    },
    stopProfiling() {
      sendCommand('<stop-profiling/>');
    },

    // Exception mode
    setExceptionBreakMode(mode) {
      if (mode === 'all') {
        sendCommand('<clear-breakpoint path="uncaughtExceptions" line="0"/>');
        sendCommand('<set-breakpoint path="exceptions" line="0"/>');
      } else if (mode === 'uncaught') {
        sendCommand('<clear-breakpoint path="exceptions" line="0"/>');
        sendCommand('<set-breakpoint path="uncaughtExceptions" line="0"/>');
      } else {
        sendCommand('<clear-breakpoint path="exceptions" line="0"/>');
        sendCommand('<clear-breakpoint path="uncaughtExceptions" line="0"/>');
      }
    },

    // Subscriptions
    onBreak(listener) {
      breakListeners.push(listener);
      return harden(() => {
        const idx = breakListeners.indexOf(listener);
        if (idx >= 0) breakListeners.splice(idx, 1);
      });
    },

    // Accessors
    isBroken() {
      return broken;
    },
    getTitle() {
      return title;
    },
    getTag() {
      return tag;
    },
    getLastBreak() {
      return lastBreak;
    },

    help() {
      return 'DebugSession: xsbug protocol client for XS worker debugging';
    },
  };

  return harden(session);
};
harden(makeDebugSession);
