// @ts-check
import harden from '@endo/harden';
import { bytesFromImmutable } from '@endo/bytes/from-immutable.js';
import { Far } from '@endo/marshal';

import { makeDescCodecs } from '../codecs/descriptors.js';
import { makePassableCodecs } from '../codecs/passable.js';
import { makeOcapnOperationsCodecs } from '../codecs/operations.js';
import { getSelectorName, makeSelector } from '../selector.js';
import { makeSturdyRef } from '../client/sturdyrefs.js';

/**
 * An OCapN hub: a comms-vat-style forwarding node that is NOT a
 * client. The hub holds no presences, no promises, no locator of live
 * values — only per-session c-lists (position ↔ hub reference row) and
 * answer routes, all plain persistable tables. Every inbound message
 * is structurally transcoded: decoded with the ordinary wire codecs
 * against a table-backed reference kit that materializes descriptors
 * as inert tokens, routed by its target's origin, and re-encoded
 * toward the destination session with that session's kit — which
 * rewrites every embedded reference through the c-lists, allocating
 * rows on first sight. Nothing is reified, so nothing promise-shaped
 * (or object-shaped) ever lives in hub memory: subscriptions,
 * resolutions, pipelined answers, and gc hints are all just messages
 * whose slots get rewritten.
 *
 * The hub's only endpoint behavior is its bootstrap (export position 0
 * toward every session): `fetch(swissnum)` answers from the
 * publications table with a reference row. Everything else — including
 * the resolution of that fetch — is forwarding.
 *
 * Sessions are namespaced by an epoch that bumps on `retireSession`,
 * so a successor peer reattaching under the same key can never collide
 * with (or resurrect) the retired incarnation's rows: retired rows
 * become dead tombstones that keep holders' positions resolving —
 * loudly, as breaks — until the holders release them, at which point
 * the tombstones are pruned.
 *
 * Answers are re-exported as promises: when a forwarded delivery asks
 * for an answer, the hub allocates the answer position at the
 * destination and backs it with an ordinary promise-flavored reference
 * row, so the answer can be mentioned toward ANY session (toward its
 * owner as `desc:answer`, toward everyone else as a promise import),
 * listened on, pipelined through, and garbage-collected exactly like
 * any other reference.
 *
 * Durability: the entire hub state (rows, counters, publications,
 * queued frames, inbound watermarks) serializes to JSON and is written
 * through the injected store after every mutating frame, BEFORE the
 * resulting frames are sent — so the tables can never lag the wire. A
 * successor process reconstructs the hub from the store alone and
 * reattaches its sessions; positions are stable because they are rows,
 * not objects. Frames toward a detached durable session queue in the
 * tables and drain on reattach (at-least-once across a crash mid
 * drain); frames toward a detached ephemeral session break to the
 * sender.
 *
 * Sessions attach pre-authenticated: the embedder owns transports,
 * identity, and lifecycle (siesta's durable worker transports and
 * netlayer sessions), and hands the hub ordered plaintext frames. An
 * undecodable or unroutable frame from a `remote` session aborts that
 * session (op:abort, detach, `onAbort`); from a local session (a
 * worker or an in-process endpoint, where it should never occur) it is
 * dropped loudly.
 *
 * Known limits (loud, not silent): third-party handoffs are rejected
 * (hub-performed redemption is planned); a message routed at the
 * sender's own export cannot carry a resolveMeDesc (the wire format
 * has no way to hand a session its own resolver back), so such listens
 * break to the sender.
 *
 * @typedef {object} HubStore
 * @property {() => any} getState previously persisted state, or
 *   undefined
 * @property {(state: any) => void} setState atomic write-through
 */

const BOOTSTRAP_POSITION = '0';
const STATE_VERSION = 2;

/** @param {ArrayBufferLike | Uint8Array} bytes */
const hexFromBytes = bytes => {
  let view;
  if (bytes instanceof Uint8Array) {
    view = bytes;
  } else {
    view = new Uint8Array(/** @type {ArrayBuffer} */ (bytes));
    if (view.length === 0 && bytes.byteLength > 0) {
      // An endo immutable ArrayBuffer: view it via its transfer seam.
      view = bytesFromImmutable(bytes);
    }
  }
  return Array.from(view, byte => byte.toString(16).padStart(2, '0')).join('');
};

/** @param {string} hex */
const bytesFromHex = hex => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

/**
 * The publications table key for a swissnum in either of its accepted
 * forms.
 *
 * @param {string | Uint8Array | ArrayBufferLike} swissnum
 */
const swissnumHex = swissnum =>
  typeof swissnum === 'string'
    ? hexFromBytes(new TextEncoder().encode(swissnum))
    : hexFromBytes(swissnum);

const makeMemoryHubStore = () => {
  /** @type {any} */
  let state;
  return harden({
    getState: () => state,
    setState: (/** @type {any} */ next) => {
      state = next;
    },
  });
};

/**
 * @param {object} options
 * @param {any} options.codec an OCapN codec (syrup or cbor); every
 *   attached session must speak it
 * @param {HubStore} [options.store]
 * @param {(...args: Array<unknown>) => void} [options.logError]
 */
export const makeOcapnHub = ({
  codec,
  store = makeMemoryHubStore(),
  // eslint-disable-next-line no-console
  logError = (...args) => console.error('ocapn hub:', ...args),
}) => {
  /**
   * One reference row, namespaced by its origin session's epoch. A row
   * either backs an export (`backing: 'export'` — the object or
   * promise the origin exported at `position` there) or an answer
   * (`backing: 'answer'` — the promise for the answer the origin owes
   * the hub at `position` in its answer table). `facing` maps every
   * other session to the hub's export position toward it; `refcounts`
   * counts wire mentions per facing session; `mentionsIn` counts how
   * many times the origin sent it (the delta owed back to the origin
   * when the row dies); `listeners` records the resolver rows of
   * pending op:listen subscriptions so retirement can break them.
   *
   * @typedef {{
   *   refId: string,
   *   origin: string,
   *   epoch: number,
   *   position: string,
   *   backing: 'export' | 'answer',
   *   flavor: 'object' | 'promise',
   *   resolver: boolean,
   *   dead: boolean,
   *   mentionsIn: number,
   *   listeners: Array<string>,
   *   facing: Map<string, string>,
   *   refcounts: Map<string, number>,
   * }} RefRow
   */

  /** @type {Map<string, RefRow>} */
  const refs = new Map();

  /**
   * An answer route: what the hub owes a session at one of that
   * session's answer positions. `{ ref }` is a pending answer backed
   * by a reference row (usually answer-backed at the destination);
   * `{ local }` is a locally settled answer — the bootstrap's fetch
   * result, or `null` for a break with `reason`.
   *
   * @typedef {{ ref: string } | { local: string | null, reason?: string }} AnswerRoute
   */

  /**
   * @typedef {{
   *   epoch: number,
   *   ourExports: Map<string, string>,
   *   nextExport: bigint,
   *   nextAnswer: bigint,
   *   answersOwed: Map<string, AnswerRoute>,
   *   processedUpTo: number,
   *   durable: boolean,
   *   queue: Array<string>,
   *   send: (bytes: Uint8Array) => void,
   *   attached: boolean,
   *   remote: boolean,
   *   onAbort: ((error: unknown) => void) | undefined,
   * }} SessionState
   */

  /** @type {Map<string, SessionState>} */
  const sessions = new Map();

  /** @type {Map<string, string>} swissnum hex -> refId */
  const publications = new Map();

  let dirty = false;

  // --- the mutation ledger: undo journal for encode-scope rollback ---

  /** @type {Array<() => void> | null} */
  let ledger = null;

  /** @param {() => void} undo */
  const noteUndo = undo => {
    if (ledger !== null) {
      ledger.push(undo);
    }
  };

  /**
   * Run `fn` with table mutations journaled; on throw, undo them all
   * (in reverse) before rethrowing, so a failed decode or encode
   * leaves no phantom rows, refcounts, or routes behind. Nested scopes
   * merge into the enclosing one.
   *
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  const withRollback = fn => {
    const outer = ledger;
    /** @type {Array<() => void>} */
    const scope = [];
    ledger = scope;
    try {
      const result = fn();
      ledger = outer;
      if (outer !== null) {
        outer.push(...scope);
      }
      return result;
    } catch (error) {
      ledger = outer;
      for (let i = scope.length - 1; i >= 0; i -= 1) {
        scope[i]();
      }
      throw error;
    }
  };

  // --- persistence ---

  const persist = () => {
    if (!dirty) {
      return;
    }
    dirty = false;
    /** @type {any} */
    const state = {
      version: STATE_VERSION,
      refs: {},
      sessions: {},
      publications: {},
    };
    for (const [refId, row] of refs.entries()) {
      state.refs[refId] = {
        origin: row.origin,
        epoch: row.epoch,
        position: row.position,
        backing: row.backing,
        flavor: row.flavor,
        resolver: row.resolver,
        dead: row.dead,
        mentionsIn: row.mentionsIn,
        listeners: [...row.listeners],
        refcounts: Object.fromEntries(row.refcounts),
      };
    }
    for (const [sessionKey, session] of sessions.entries()) {
      state.sessions[sessionKey] = {
        epoch: session.epoch,
        ourExports: Object.fromEntries(session.ourExports),
        nextExport: String(session.nextExport),
        nextAnswer: String(session.nextAnswer),
        answersOwed: Object.fromEntries(session.answersOwed),
        processedUpTo: session.processedUpTo,
        durable: session.durable,
        queue: [...session.queue],
      };
    }
    state.publications = Object.fromEntries(publications);
    store.setState(state);
  };

  /** @param {string} sessionKey */
  const provideSessionState = sessionKey => {
    let session = sessions.get(sessionKey);
    if (session === undefined) {
      session = {
        epoch: 0,
        ourExports: new Map(),
        nextExport: 1n,
        // Starts at 1: op:get/op:index/op:untag carry their answer as
        // a PositiveInteger, which cannot encode 0.
        nextAnswer: 1n,
        answersOwed: new Map(),
        processedUpTo: 0,
        durable: false,
        queue: [],
        send: () => {
          throw Error(`ocapn hub: session ${sessionKey} is not attached`);
        },
        attached: false,
        remote: false,
        onAbort: undefined,
      };
      sessions.set(sessionKey, session);
      dirty = true;
    }
    return session;
  };

  const restore = () => {
    const state = store.getState();
    if (state === undefined) {
      return;
    }
    if (state.version !== STATE_VERSION) {
      throw Error(
        `ocapn hub: unsupported persisted state version ${state.version}`,
      );
    }
    for (const [refId, row] of Object.entries(state.refs ?? {})) {
      const r = /** @type {any} */ (row);
      refs.set(refId, {
        refId,
        origin: r.origin,
        epoch: Number(r.epoch ?? 0),
        position: r.position,
        backing: r.backing === 'answer' ? 'answer' : 'export',
        flavor: r.flavor,
        resolver: Boolean(r.resolver),
        dead: Boolean(r.dead),
        mentionsIn: Number(r.mentionsIn ?? 0),
        listeners: [...(r.listeners ?? [])],
        facing: new Map(),
        refcounts: new Map(
          Object.entries(r.refcounts ?? {}).map(([k, v]) => [k, Number(v)]),
        ),
      });
    }
    for (const [sessionKey, s] of Object.entries(state.sessions ?? {})) {
      const sd = /** @type {any} */ (s);
      const session = provideSessionState(sessionKey);
      session.epoch = Number(sd.epoch ?? 0);
      session.ourExports = new Map(Object.entries(sd.ourExports ?? {}));
      session.nextExport = BigInt(sd.nextExport ?? '1');
      session.nextAnswer = BigInt(sd.nextAnswer ?? '1');
      session.answersOwed = new Map(Object.entries(sd.answersOwed ?? {}));
      session.processedUpTo = Number(sd.processedUpTo ?? 0);
      session.durable = Boolean(sd.durable);
      session.queue = [...(sd.queue ?? [])];
      for (const [position, refId] of session.ourExports.entries()) {
        const row = refs.get(refId);
        if (row !== undefined) {
          row.facing.set(sessionKey, position);
        }
      }
    }
    for (const [swissnum, refId] of Object.entries(state.publications ?? {})) {
      publications.set(swissnum, /** @type {string} */ (refId));
    }
    dirty = false;
  };
  restore();

  // --- reference rows ---

  /**
   * @param {string} origin
   * @param {bigint | string} position
   * @param {'object' | 'promise'} flavor
   * @param {object} [options]
   * @param {boolean} [options.resolver]
   * @param {'export' | 'answer'} [options.backing]
   * @param {boolean} [options.mention] count this as a wire mention by
   *   the origin (a decode of desc:import-*), owed back through
   *   op:gc-exports when the row dies
   */
  const provideRef = (
    origin,
    position,
    flavor,
    { resolver = false, backing = 'export', mention = false } = {},
  ) => {
    const { epoch } = provideSessionState(origin);
    const positionKey = String(position);
    const refId = `${origin}#${epoch}:${
      backing === 'answer' ? 'a' : ''
    }${positionKey}`;
    let existing = refs.get(refId);
    if (existing === undefined) {
      /** @type {RefRow} */
      const created = {
        refId,
        origin,
        epoch,
        position: positionKey,
        backing,
        flavor,
        resolver,
        dead: false,
        mentionsIn: 0,
        listeners: [],
        facing: new Map(),
        refcounts: new Map(),
      };
      refs.set(refId, created);
      noteUndo(() => refs.delete(refId));
      existing = created;
      dirty = true;
    }
    const row = existing;
    if (row.resolver && !resolver) {
      // Re-introduced as an ordinary reference: it retains after all.
      row.resolver = false;
      noteUndo(() => {
        row.resolver = true;
      });
      dirty = true;
    }
    if (mention) {
      row.mentionsIn += 1;
      noteUndo(() => {
        row.mentionsIn -= 1;
      });
      dirty = true;
    }
    return row;
  };

  /**
   * The promise row backing the answer `owner` owes the hub at
   * `position` in its answer table.
   *
   * @param {string} owner
   * @param {bigint | string} position
   */
  const provideAnswerRef = (owner, position) =>
    provideRef(owner, position, 'promise', { backing: 'answer' });

  // --- tokens: the inert stand-ins the codecs traffic in ---

  /** @type {WeakMap<object, any>} */
  const tokenInfo = new WeakMap();

  /** @param {any} info */
  const makeToken = info => {
    const token = Far('HubRef', {});
    tokenInfo.set(token, harden(info));
    return token;
  };

  /** @param {any} value */
  const infoOf = value => {
    const info = tokenInfo.get(value);
    if (info === undefined) {
      throw Error('ocapn hub: message value is not a hub reference');
    }
    return info;
  };

  /** @param {string} refId */
  const refTokenFor = refId => makeToken({ kind: 'ref', refId });

  /**
   * The reference row behind a token's info, for the kinds that carry
   * one (`ref`, `resolver`, and settled `localAnswer`).
   *
   * @param {any} info
   */
  const rowOfInfo = info => {
    if (info.kind === 'bootstrap') {
      throw Error('ocapn hub: cannot forward a bootstrap reference');
    }
    if (info.kind === 'localAnswer' && info.refId === null) {
      throw Error(
        info.reason ?? 'ocapn hub: cannot forward a broken local answer',
      );
    }
    const row = refs.get(info.refId);
    if (row === undefined) {
      throw Error(`ocapn hub: dangling reference ${info.refId}`);
    }
    return row;
  };

  // --- gc ---

  /**
   * Whether a row is rooted by something other than facing positions:
   * a publication, or an answer route that names it.
   *
   * @param {string} refId
   */
  const isPinned = refId => {
    for (const published of publications.values()) {
      if (published === refId) {
        return true;
      }
    }
    for (const session of sessions.values()) {
      for (const route of session.answersOwed.values()) {
        if ('ref' in route ? route.ref === refId : route.local === refId) {
          return true;
        }
      }
    }
    return false;
  };

  /**
   * Remove a settled or released resolver from every row's pending
   * listener registrations.
   *
   * @param {string} resolverRefId
   */
  const clearListenerEntries = resolverRefId => {
    for (const row of refs.values()) {
      const index = row.listeners.indexOf(resolverRefId);
      if (index >= 0) {
        row.listeners.splice(index, 1);
        dirty = true;
      }
    }
  };

  /** @param {RefRow} row */
  const maybeReleaseRef = row => {
    if (row.facing.size > 0 || isPinned(row.refId)) {
      return;
    }
    refs.delete(row.refId);
    dirty = true;
    if (row.resolver) {
      clearListenerEntries(row.refId);
    }
    if (row.dead) {
      // A tombstone whose last holder let go: prune silently.
      return;
    }
    if (row.backing === 'answer') {
      // eslint-disable-next-line no-use-before-define
      sendMessage(row.origin, {
        type: 'op:gc-answers',
        answerPositions: [BigInt(row.position)],
      });
    } else if (row.mentionsIn > 0) {
      // eslint-disable-next-line no-use-before-define
      sendMessage(row.origin, {
        type: 'op:gc-exports',
        exportPositions: [BigInt(row.position)],
        wireDeltas: [BigInt(row.mentionsIn)],
      });
    }
  };

  // --- per-session wire kits and codecs ---

  /** @type {Map<string, { readOcapnMessage: any, writeOcapnMessage: any }>} */
  const codecKits = new Map();

  /** @param {string} sessionKey */
  const provideCodecKit = sessionKey => {
    let kit = codecKits.get(sessionKey);
    if (kit !== undefined) {
      return kit;
    }
    const session = provideSessionState(sessionKey);

    // The table-backed "reference kit": reads materialize descriptors
    // as tokens against the c-lists; writes translate tokens back to
    // positions, allocating hub export rows toward this session on
    // first mention. The shape mirrors exactly the referenceKit
    // surface the codecs consume.
    const tableKit = {
      // -- read side (message FROM this session) --
      /** @param {bigint} position */
      provideRemoteObjectValue: position =>
        refTokenFor(
          provideRef(sessionKey, position, 'object', { mention: true }).refId,
        ),
      /** @param {bigint} position */
      provideRemotePromiseValue: position =>
        refTokenFor(
          provideRef(sessionKey, position, 'promise', { mention: true }).refId,
        ),
      /** @param {bigint} position */
      provideLocalExportValue: position => {
        const key = String(position);
        if (key === BOOTSTRAP_POSITION) {
          return makeToken({ kind: 'bootstrap', sessionKey });
        }
        const refId = session.ourExports.get(key);
        if (refId === undefined) {
          throw Error(
            `ocapn hub: session ${sessionKey} referenced unknown export ${key}`,
          );
        }
        return refTokenFor(refId);
      },
      /** @param {bigint} position */
      getLocalAnswerValue: position => {
        const route = session.answersOwed.get(String(position));
        if (route === undefined) {
          throw Error(
            `ocapn hub: session ${sessionKey} referenced unknown answer ${position}`,
          );
        }
        if ('ref' in route) {
          return refTokenFor(route.ref);
        }
        return makeToken({
          kind: 'localAnswer',
          refId: route.local,
          reason: route.reason,
        });
      },
      /**
       * A resolveMeDesc from this session: the sender's resolver
       * export. Resolver rows are one-shot protocol plumbing: they
       * route like any reference but do not retain their origin for
       * vat-level GC (`inspect` omits them), and they anchor pending
       * listen registrations.
       *
       * @param {bigint} position
       */
      provideRemoteResolverValue: position =>
        refTokenFor(
          provideRef(sessionKey, position, 'object', {
            resolver: true,
            mention: true,
          }).refId,
        ),
      provideHandoff: () => {
        throw Error('ocapn hub: third-party handoffs are not supported');
      },
      /**
       * Sturdyrefs are opaque pointers: they transit the hub as plain
       * values, re-encoded verbatim toward the destination.
       *
       * @param {any} location
       * @param {string | Uint8Array} secret
       */
      makeSturdyRef: (location, secret) => makeSturdyRef(location, secret),

      // -- write side (message TOWARD this session) --
      /** @param {any} value */
      getInfoForVal: value => {
        const info = infoOf(value);
        const row = rowOfInfo(info);
        if (row.backing === 'answer' && row.origin === sessionKey) {
          // The destination's own answer: reference it as desc:answer.
          return { type: 'answer', isLocal: false, isThirdParty: false };
        }
        return {
          type: row.flavor,
          isLocal: row.origin !== sessionKey,
          isThirdParty: false,
        };
      },
      /** @param {any} value */
      provideRemoteExportPosition: value => {
        // The receiver's own export comes back to it by its own
        // position.
        const row = rowOfInfo(infoOf(value));
        if (row.origin !== sessionKey || row.backing !== 'export') {
          throw Error('ocapn hub: not an export of this session');
        }
        return BigInt(row.position);
      },
      /** @param {any} value */
      provideRemoteAnswerPosition: value => {
        const row = rowOfInfo(infoOf(value));
        if (row.origin !== sessionKey || row.backing !== 'answer') {
          throw Error('ocapn hub: not an answer of this session');
        }
        return BigInt(row.position);
      },
      /** @param {any} value */
      provideLocalObjectPosition: value => {
        // eslint-disable-next-line no-use-before-define
        return provideFacingPosition(sessionKey, value);
      },
      /** @param {any} value */
      provideLocalPromisePosition: value => {
        // eslint-disable-next-line no-use-before-define
        return provideFacingPosition(sessionKey, value);
      },
    };

    const descCodecs = makeDescCodecs(/** @type {any} */ (tableKit));
    const passableCodecs = makePassableCodecs(descCodecs);
    kit = makeOcapnOperationsCodecs(descCodecs, passableCodecs, codec);
    codecKits.set(sessionKey, kit);
    return kit;
  };

  /**
   * The hub's export position toward `sessionKey` for a reference row,
   * allocating (and persisting) on first mention; every mention
   * increments the wire refcount the peer will eventually return
   * through op:gc-exports.
   *
   * @param {string} sessionKey
   * @param {any} value
   */
  const provideFacingPosition = (sessionKey, value) => {
    const row = rowOfInfo(infoOf(value));
    const session = provideSessionState(sessionKey);
    let position = row.facing.get(sessionKey);
    if (position === undefined) {
      const fresh = String(session.nextExport);
      session.nextExport += 1n;
      row.facing.set(sessionKey, fresh);
      session.ourExports.set(fresh, row.refId);
      noteUndo(() => {
        row.facing.delete(sessionKey);
        session.ourExports.delete(fresh);
      });
      position = fresh;
    }
    const previous = row.refcounts.get(sessionKey);
    row.refcounts.set(sessionKey, (previous ?? 0) + 1);
    noteUndo(() => {
      if (previous === undefined) {
        row.refcounts.delete(sessionKey);
      } else {
        row.refcounts.set(sessionKey, previous);
      }
    });
    dirty = true;
    return BigInt(position);
  };

  // --- outbound ---

  /**
   * Hand committed frame bytes to a session: send if attached, queue
   * durably if the session will return, drop loudly otherwise. Tables
   * before wire: persists before the frame reaches the transport.
   *
   * @param {string} sessionKey
   * @param {Uint8Array} bytes
   */
  const dispatchBytes = (sessionKey, bytes) => {
    const session = provideSessionState(sessionKey);
    if (session.attached) {
      persist();
      session.send(bytes);
      return;
    }
    if (session.durable) {
      session.queue.push(hexFromBytes(bytes));
      dirty = true;
      persist();
      return;
    }
    logError(`dropping message toward detached session ${sessionKey}`);
    persist();
  };

  /**
   * Encode and dispatch a hub-synthesized message (a gc hint, a
   * settlement); encode failures roll their allocations back and log.
   *
   * @param {string} sessionKey
   * @param {any} message a message object in codec shape, with hub
   *   tokens for references
   */
  const sendMessage = (sessionKey, message) => {
    /** @type {Uint8Array} */
    let bytes;
    try {
      bytes = withRollback(() => {
        const { writeOcapnMessage } = provideCodecKit(sessionKey);
        return writeOcapnMessage(message);
      });
    } catch (error) {
      logError(`failed to encode message toward ${sessionKey}:`, error);
      persist();
      return;
    }
    dispatchBytes(sessionKey, bytes);
  };

  /**
   * Settle a resolver: the synthesized op:deliver carrying `fulfill`
   * or `break` toward the session that sent `resolveMeDesc`.
   *
   * @param {string} sessionKey
   * @param {any} resolveMeDesc the resolver token
   * @param {'fulfill' | 'break'} verb
   * @param {any} [value] a hub token or a hardened Error
   */
  const settleToResolver = (sessionKey, resolveMeDesc, verb, value) => {
    sendMessage(sessionKey, {
      type: 'op:deliver',
      to: resolveMeDesc,
      args:
        value === undefined
          ? [makeSelector(verb)]
          : [makeSelector(verb), value],
      answerPosition: false,
      resolveMeDesc: false,
    });
  };

  /**
   * The loud end of a message routed at something dead, broken, or
   * unreachable: record the broken answer (so a later reference or
   * listen on it breaks with the same reason) and, when the message
   * carried a resolver, break it immediately.
   *
   * @param {string} sessionKey
   * @param {any} message the original op:deliver/op:listen/op:get/…
   * @param {string} reason
   */
  const breakToSender = (sessionKey, message, reason) => {
    const session = provideSessionState(sessionKey);
    const { answerPosition, resolveMeDesc } = message;
    if (answerPosition !== undefined && answerPosition !== false) {
      session.answersOwed.set(String(answerPosition), { local: null, reason });
      dirty = true;
    }
    if (resolveMeDesc !== undefined && resolveMeDesc !== false) {
      settleToResolver(sessionKey, resolveMeDesc, 'break', harden(Error(reason)));
    } else {
      persist();
    }
  };

  // --- the hub's one piece of endpoint behavior: bootstrap fetch ---

  /**
   * @param {string} sessionKey
   * @param {any} message the op:deliver targeting this session's hub
   *   bootstrap
   */
  const handleBootstrapDeliver = (sessionKey, message) => {
    const session = provideSessionState(sessionKey);
    const { args, answerPosition, resolveMeDesc } = message;
    /** @param {any} outcome ['fulfill', ref] or ['break', error] */
    const respond = outcome => {
      const [verb, value] = outcome;
      if (answerPosition !== false && answerPosition !== undefined) {
        /** @type {AnswerRoute} */
        const route =
          verb === 'fulfill' && value !== undefined
            ? { local: infoOf(value).refId }
            : {
                local: null,
                reason:
                  value === undefined
                    ? 'ocapn hub: the answer is broken'
                    : String(/** @type {Error} */ (value).message ?? value),
              };
        session.answersOwed.set(String(answerPosition), route);
        dirty = true;
      }
      if (resolveMeDesc !== false && resolveMeDesc !== undefined) {
        settleToResolver(sessionKey, resolveMeDesc, verb, value);
      } else {
        persist();
      }
    };
    const methodName = getSelectorName(args[0]);
    if (methodName !== 'fetch') {
      respond([
        'break',
        harden(Error(`ocapn hub: bootstrap has no method ${methodName}`)),
      ]);
      return;
    }
    const swissnum = hexFromBytes(args[1]);
    const refId = publications.get(swissnum);
    const row = refId === undefined ? undefined : refs.get(refId);
    if (row === undefined || row.dead) {
      respond(['break', harden(Error('ocapn hub: fetch: secret not found'))]);
      return;
    }
    respond(['fulfill', refTokenFor(row.refId)]);
  };

  // --- routing ---

  /**
   * Classify a deliver/listen/get target token.
   *
   * @param {any} target
   * @returns {{ kind: 'bootstrap' }
   *   | { kind: 'broken', reason: string }
   *   | { kind: 'row', row: RefRow, settled: boolean }}
   */
  const resolveTarget = target => {
    const info = infoOf(target);
    if (info.kind === 'bootstrap') {
      return { kind: 'bootstrap' };
    }
    if (info.kind === 'localAnswer') {
      if (info.refId === null) {
        return {
          kind: 'broken',
          reason: info.reason ?? 'ocapn hub: the answer is broken',
        };
      }
      const row = refs.get(info.refId);
      if (row === undefined) {
        return {
          kind: 'broken',
          reason: 'ocapn hub: the answer value has been released',
        };
      }
      return { kind: 'row', row, settled: true };
    }
    const row = refs.get(info.refId);
    if (row === undefined) {
      return { kind: 'broken', reason: `ocapn hub: dangling ${info.refId}` };
    }
    return { kind: 'row', row, settled: false };
  };

  /**
   * The liveness gate before forwarding at a row: `undefined` when the
   * message can proceed to `row.origin`, otherwise the break reason.
   *
   * @param {RefRow} row
   */
  const unreachableReason = row => {
    if (row.dead) {
      return 'ocapn hub: the target session has been retired';
    }
    const destination = provideSessionState(row.origin);
    if (!destination.attached && !destination.durable) {
      return 'ocapn hub: the target session is disconnected';
    }
    return undefined;
  };

  /**
   * Allocate the forwarded answer: the destination owes the hub an
   * answer at a fresh position, backed by a promise row, and the
   * sender's answer route points at that row — so the answer is
   * re-exported as a promise, mentionable toward any session.
   *
   * @param {SessionState} senderSession
   * @param {string} answerKey the sender's answer position
   * @param {string} destination
   * @returns {bigint} the answer position at the destination
   */
  const allocateAnswerRoute = (senderSession, answerKey, destination) => {
    const destinationState = provideSessionState(destination);
    const position = destinationState.nextAnswer;
    destinationState.nextAnswer += 1n;
    const answerRow = provideAnswerRef(destination, position);
    senderSession.answersOwed.set(answerKey, { ref: answerRow.refId });
    noteUndo(() => senderSession.answersOwed.delete(answerKey));
    dirty = true;
    return position;
  };

  /**
   * @param {string} sessionKey
   * @param {any} message
   */
  const handleMessage = (sessionKey, message) => {
    const session = provideSessionState(sessionKey);
    switch (message.type) {
      case 'op:deliver': {
        const target = resolveTarget(message.to);
        if (target.kind === 'bootstrap') {
          handleBootstrapDeliver(sessionKey, message);
          return;
        }
        if (target.kind === 'broken') {
          breakToSender(sessionKey, message, target.reason);
          return;
        }
        const { row } = target;
        const unreachable = unreachableReason(row);
        if (unreachable !== undefined) {
          breakToSender(sessionKey, message, unreachable);
          return;
        }
        const destination = row.origin;
        /** @type {Uint8Array} */
        let bytes;
        try {
          bytes = withRollback(() => {
            /** @type {bigint | false} */
            let forwardedAnswer = false;
            const { answerPosition } = message;
            if (answerPosition !== false && answerPosition !== undefined) {
              forwardedAnswer = allocateAnswerRoute(
                session,
                String(answerPosition),
                destination,
              );
            }
            const { writeOcapnMessage } = provideCodecKit(destination);
            return writeOcapnMessage({
              ...message,
              answerPosition: forwardedAnswer,
            });
          });
        } catch (error) {
          logError(
            `forwarding op:deliver from ${sessionKey} toward ${destination} failed:`,
            error,
          );
          breakToSender(
            sessionKey,
            message,
            'ocapn hub: the delivery could not be forwarded',
          );
          return;
        }
        if (row.resolver) {
          // The one-shot settlement of a listen: whatever this
          // resolver was pending on is settled by this delivery.
          clearListenerEntries(row.refId);
        }
        dispatchBytes(destination, bytes);
        return;
      }
      case 'op:get':
      case 'op:index':
      case 'op:untag': {
        const target = resolveTarget(message.receiverDesc);
        if (target.kind === 'bootstrap') {
          breakToSender(
            sessionKey,
            message,
            `ocapn hub: ${message.type} is not supported on the hub bootstrap`,
          );
          return;
        }
        if (target.kind === 'broken') {
          breakToSender(sessionKey, message, target.reason);
          return;
        }
        const { row } = target;
        const unreachable = unreachableReason(row);
        if (unreachable !== undefined) {
          breakToSender(sessionKey, message, unreachable);
          return;
        }
        const destination = row.origin;
        /** @type {Uint8Array} */
        let bytes;
        try {
          bytes = withRollback(() => {
            const forwardedAnswer = allocateAnswerRoute(
              session,
              String(message.answerPosition),
              destination,
            );
            const { writeOcapnMessage } = provideCodecKit(destination);
            return writeOcapnMessage({
              ...message,
              answerPosition: forwardedAnswer,
            });
          });
        } catch (error) {
          logError(
            `forwarding ${message.type} from ${sessionKey} toward ${destination} failed:`,
            error,
          );
          breakToSender(
            sessionKey,
            message,
            `ocapn hub: the ${message.type} could not be forwarded`,
          );
          return;
        }
        dispatchBytes(destination, bytes);
        return;
      }
      case 'op:listen': {
        const target = resolveTarget(message.to);
        if (target.kind === 'bootstrap') {
          breakToSender(
            sessionKey,
            message,
            'ocapn hub: cannot listen on the hub bootstrap',
          );
          return;
        }
        if (target.kind === 'broken') {
          breakToSender(sessionKey, message, target.reason);
          return;
        }
        const { row, settled } = target;
        if (settled) {
          // A listen on a locally settled answer (a bootstrap fetch):
          // synthesize the fulfillment.
          settleToResolver(
            sessionKey,
            message.resolveMeDesc,
            'fulfill',
            refTokenFor(row.refId),
          );
          return;
        }
        const unreachable = unreachableReason(row);
        if (unreachable !== undefined) {
          breakToSender(sessionKey, message, unreachable);
          return;
        }
        const destination = row.origin;
        /** @type {Uint8Array} */
        let bytes;
        try {
          bytes = withRollback(() => {
            const resolverInfo = infoOf(message.resolveMeDesc);
            if (!row.listeners.includes(resolverInfo.refId)) {
              row.listeners.push(resolverInfo.refId);
              noteUndo(() => {
                const index = row.listeners.indexOf(resolverInfo.refId);
                if (index >= 0) {
                  row.listeners.splice(index, 1);
                }
              });
              dirty = true;
            }
            const { writeOcapnMessage } = provideCodecKit(destination);
            return writeOcapnMessage(message);
          });
        } catch (error) {
          logError(
            `forwarding op:listen from ${sessionKey} toward ${destination} failed:`,
            error,
          );
          breakToSender(
            sessionKey,
            message,
            'ocapn hub: the listen could not be forwarded',
          );
          return;
        }
        dispatchBytes(destination, bytes);
        return;
      }
      case 'op:gc-exports': {
        const exportPositions = /** @type {Array<bigint>} */ (
          message.exportPositions
        );
        const wireDeltas = /** @type {Array<bigint>} */ (message.wireDeltas);
        for (let i = 0; i < exportPositions.length; i += 1) {
          const key = String(exportPositions[i]);
          const delta = Number(wireDeltas[i] ?? 1n);
          const refId = session.ourExports.get(key);
          if (refId === undefined) {
            // eslint-disable-next-line no-continue
            continue;
          }
          const row = refs.get(refId);
          if (row === undefined) {
            session.ourExports.delete(key);
            // eslint-disable-next-line no-continue
            continue;
          }
          const count = (row.refcounts.get(sessionKey) ?? 0) - delta;
          if (count > 0) {
            row.refcounts.set(sessionKey, count);
          } else {
            row.refcounts.delete(sessionKey);
            row.facing.delete(sessionKey);
            session.ourExports.delete(key);
            maybeReleaseRef(row);
          }
          dirty = true;
        }
        persist();
        return;
      }
      case 'op:gc-answers': {
        for (const position of message.answerPositions) {
          const key = String(position);
          const route = session.answersOwed.get(key);
          if (route === undefined) {
            // eslint-disable-next-line no-continue
            continue;
          }
          session.answersOwed.delete(key);
          dirty = true;
          const refId = 'ref' in route ? route.ref : route.local;
          if (refId !== null && refId !== undefined) {
            const row = refs.get(refId);
            if (row !== undefined) {
              // The route's pin is gone; if that was the last root,
              // the release propagates (gc-answers toward an answer's
              // owner, gc-exports toward an export's origin).
              maybeReleaseRef(row);
            }
          }
        }
        persist();
        return;
      }
      case 'op:abort': {
        logError(`session ${sessionKey} aborted:`, message.reason);
        session.attached = false;
        return;
      }
      default:
        throw Error(`ocapn hub: unsupported operation ${message.type}`);
    }
  };

  /**
   * The per-session frame-error policy: an undecodable or unroutable
   * frame from a remote session aborts the session; from a local one
   * (worker or in-process endpoint, where it should never happen) it
   * is dropped loudly.
   *
   * @param {string} sessionKey
   * @param {unknown} error
   */
  const frameError = (sessionKey, error) => {
    const session = provideSessionState(sessionKey);
    if (!session.remote) {
      logError(`frame from local session ${sessionKey} dropped:`, error);
      return;
    }
    logError(`aborting remote session ${sessionKey} on bad frame:`, error);
    try {
      const { writeOcapnMessage } = provideCodecKit(sessionKey);
      const reason = String(
        /** @type {Error} */ (error)?.message ?? error,
      ).slice(0, 200);
      const bytes = writeOcapnMessage({ type: 'op:abort', reason });
      if (session.attached) {
        session.send(bytes);
      }
    } catch (abortError) {
      logError(`failed to send op:abort toward ${sessionKey}:`, abortError);
    }
    session.attached = false;
    const { onAbort } = session;
    if (onAbort !== undefined) {
      try {
        onAbort(error);
      } catch (hookError) {
        logError(`onAbort for ${sessionKey} threw:`, hookError);
      }
    }
  };

  /**
   * Permanently drop a session's incarnation: its epoch bumps (so a
   * successor under the same key allocates in a fresh namespace), its
   * tables reset, its origin rows become dead tombstones (other
   * sessions' calls on them break loudly and the tombstones prune as
   * holders let go), pending listens on its promises break, and
   * publications of its objects are withdrawn.
   *
   * @param {string} sessionKey
   */
  const retireSessionInternal = sessionKey => {
    const session = provideSessionState(sessionKey);
    session.attached = false;
    session.durable = false;
    session.remote = false;
    session.onAbort = undefined;
    session.epoch += 1;
    session.ourExports.clear();
    session.answersOwed.clear();
    session.nextExport = 1n;
    session.nextAnswer = 1n;
    session.processedUpTo = 0;
    session.queue.length = 0;
    for (const [swissnum, refId] of [...publications.entries()]) {
      const row = refs.get(refId);
      if (row !== undefined && row.origin === sessionKey) {
        publications.delete(swissnum);
      }
    }
    /** @type {Array<string>} */
    const orphanedListeners = [];
    for (const row of refs.values()) {
      if (row.origin === sessionKey && !row.dead) {
        // Tombstone, don't delete: holders' positions must keep
        // resolving so their calls break loudly instead of jamming.
        row.dead = true;
        orphanedListeners.push(...row.listeners);
        row.listeners.length = 0;
      }
    }
    dirty = true;
    // The retiring session held the resolvers for these pending
    // listens in its heap; they will never settle. Break them BEFORE
    // dropping the retiree as a holder: the resolver rows it held
    // must still exist to carry their own break.
    for (const resolverRefId of orphanedListeners) {
      const resolverRow = refs.get(resolverRefId);
      if (resolverRow === undefined || resolverRow.dead) {
        // eslint-disable-next-line no-continue
        continue;
      }
      settleToResolver(
        resolverRow.origin,
        refTokenFor(resolverRefId),
        'break',
        harden(Error('ocapn hub: the target session has been retired')),
      );
    }
    for (const row of [...refs.values()]) {
      if (row.facing.has(sessionKey) || row.refcounts.has(sessionKey)) {
        row.facing.delete(sessionKey);
        row.refcounts.delete(sessionKey);
        maybeReleaseRef(row);
      }
    }
    dirty = true;
    persist();
  };

  return harden({
    /**
     * Attach a pre-authenticated session: the embedder owns identity
     * and transport. Returns the inbound frame sink. Reattaching the
     * same key (a successor process, a reconnect) rebinds `send`; the
     * tables carry over, and frames queued while a durable session was
     * detached drain in order.
     *
     * @param {string} sessionKey
     * @param {object} powers
     * @param {(bytes: Uint8Array) => void} powers.send
     * @param {boolean} [powers.durable] frames toward this session
     *   queue in the tables while it is detached, instead of breaking
     *   to their senders
     * @param {boolean} [powers.remote] a bad frame aborts this session
     *   instead of being dropped (the policy for sessions from beyond
     *   the process boundary)
     * @param {(error: unknown) => void} [powers.onAbort]
     */
    attachSession: (
      sessionKey,
      { send, durable = false, remote = false, onAbort = undefined },
    ) => {
      const session = provideSessionState(sessionKey);
      session.send = send;
      session.attached = true;
      session.durable = durable;
      session.remote = remote;
      session.onAbort = onAbort;
      dirty = true;
      persist();
      while (session.queue.length > 0) {
        // At-least-once: send, then drop from the queue — a crash
        // between the two re-sends on the next attach rather than
        // losing a settlement.
        const frame = session.queue[0];
        session.send(bytesFromHex(frame));
        session.queue.shift();
        dirty = true;
        persist();
      }
      return harden({
        /**
         * @param {Uint8Array} bytes one inbound OCapN frame
         * @param {number} [sequenceNumber] the frame's position in the
         *   session's inbound order; frames at or below the recorded
         *   watermark are duplicates from a transport replay and are
         *   skipped, making processing exactly-once — the watermark
         *   commits atomically with the frame's effects
         */
        deliver: (bytes, sequenceNumber = undefined) => {
          if (
            sequenceNumber !== undefined &&
            sequenceNumber <= session.processedUpTo
          ) {
            return;
          }
          try {
            const parsed = withRollback(() => {
              const { readOcapnMessage } = provideCodecKit(sessionKey);
              return readOcapnMessage(codec.makeReader(bytes));
            });
            handleMessage(sessionKey, parsed);
          } catch (error) {
            frameError(sessionKey, error);
          }
          if (sequenceNumber !== undefined) {
            session.processedUpTo = sequenceNumber;
            dirty = true;
          }
          persist();
        },
        detach: () => {
          session.attached = false;
        },
      });
    },
    /**
     * Publish a reference row under a swissnum: `(origin session,
     * position there, flavor)`. Position 0 is the origin's bootstrap.
     *
     * @param {string | Uint8Array} swissnum
     * @param {{ session: string, position: bigint, flavor?: 'object' | 'promise' }} at
     */
    publish: (swissnum, { session, position, flavor = 'object' }) => {
      const row = provideRef(session, position, flavor);
      publications.set(swissnumHex(swissnum), row.refId);
      dirty = true;
      persist();
    },
    /**
     * Introduce a reference into a session out of band: allocate (or
     * find) the hub's export position toward `to` for the reference
     * `(session, position)`, as if it had been mentioned in a
     * forwarded message. The embedder's endpoint uses this to reach
     * worker bootstraps without rooting them in the publications
     * table.
     *
     * @param {string} to
     * @param {{ session: string, position: bigint, flavor?: 'object' | 'promise' }} at
     * @returns {bigint} the hub's export position toward `to`
     */
    introduce: (to, { session, position, flavor = 'object' }) => {
      const row = provideRef(session, position, flavor);
      const facing = provideFacingPosition(to, refTokenFor(row.refId));
      persist();
      return facing;
    },
    /**
     * Publish the reference a session HOLDS at one of the hub's export
     * positions toward it — the natural form for an embedder endpoint
     * that knows its own import positions.
     *
     * @param {string | Uint8Array} swissnum
     * @param {{ session: string, position: bigint }} at
     */
    publishHeld: (swissnum, { session, position }) => {
      const sessionState = provideSessionState(session);
      const refId = sessionState.ourExports.get(String(position));
      if (refId === undefined) {
        throw Error(
          `ocapn hub: session ${session} holds nothing at ${position}`,
        );
      }
      publications.set(swissnumHex(swissnum), refId);
      dirty = true;
      persist();
    },
    /**
     * Permanently drop a session's incarnation: its epoch bumps (so a
     * successor under the same key allocates in a fresh namespace),
     * its tables reset, its origin rows become dead tombstones (other
     * sessions' calls on them break loudly and the tombstones prune as
     * holders let go), pending listens on its promises break, and
     * publications of its objects are withdrawn.
     *
     * @param {string} sessionKey
     */
    retireSession: sessionKey => retireSessionInternal(sessionKey),
    /**
     * Retire a session whose key will NEVER be reused (an ephemeral
     * connection, a deleted worker): same as `retireSession`, then the
     * session's table entry itself is dropped so the persisted state
     * does not accumulate one row per short-lived connection. Dead
     * tombstones for its exports still prune as holders let go.
     *
     * @param {string} sessionKey
     */
    forgetSession: sessionKey => {
      retireSessionInternal(sessionKey);
      sessions.delete(sessionKey);
      codecKits.delete(sessionKey);
      dirty = true;
      persist();
    },
    /** @param {string | Uint8Array} swissnum */
    unpublish: swissnum => {
      const key = swissnumHex(swissnum);
      const refId = publications.get(key);
      publications.delete(key);
      dirty = true;
      if (refId !== undefined) {
        const row = refs.get(refId);
        if (row !== undefined) {
          maybeReleaseRef(row);
        }
      }
      persist();
    },
    /**
     * The reachability graph for vat-level GC: which origin sessions
     * are referenced by publications, and which sessions hold
     * references into which origins. Resolver plumbing and dead
     * tombstones do not retain anyone.
     */
    inspect: () =>
      harden({
        publishedOrigins: [
          ...new Set(
            [...publications.values()]
              .map(refId => refs.get(refId)?.origin)
              .filter(origin => origin !== undefined),
          ),
        ],
        holdings: [...refs.values()]
          .filter(row => !row.resolver && !row.dead)
          .map(row => ({
            origin: row.origin,
            holders: [...row.facing.keys()],
          })),
      }),
  });
};
harden(makeOcapnHub);
