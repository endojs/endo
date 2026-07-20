// @ts-check
import harden from '@endo/harden';
import { bytesFromImmutable } from '@endo/bytes/from-immutable.js';
import { Far } from '@endo/marshal';

import { makeDescCodecs } from '../codecs/descriptors.js';
import { makePassableCodecs } from '../codecs/passable.js';
import { makeOcapnOperationsCodecs } from '../codecs/operations.js';
import { getSelectorName, makeSelector } from '../selector.js';

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
 * Durability: the entire hub state (rows, counters, publications)
 * serializes to JSON and is written through the injected store after
 * every mutating frame, BEFORE the resulting frames are sent — so the
 * tables can never lag the wire. A successor process reconstructs the
 * hub from the store alone and reattaches its sessions; positions are
 * stable because they are rows, not objects.
 *
 * Sessions attach pre-authenticated: the embedder owns transports,
 * identity, and lifecycle (siesta's durable worker transports and
 * netlayer sessions), and hands the hub ordered plaintext frames.
 *
 * Known limits (loud, not silent): third-party handoffs and sturdy
 * refs in transit are rejected; an answer reference forwarded to a
 * session other than the answer's owner is rejected (answer promotion
 * is future work).
 *
 * @typedef {object} HubStore
 * @property {() => any} getState previously persisted state, or
 *   undefined
 * @property {(state: any) => void} setState atomic write-through
 */

const BOOTSTRAP_POSITION = '0';

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
   * One reference row: an object or promise first exported by `origin`
   * at `position` there. `facing` maps every other session to the
   * hub's export position toward it; `refcounts` counts wire mentions
   * per facing session; `mentionsIn` counts how many times the origin
   * sent it (the delta owed back to the origin when the ref dies).
   *
   * @typedef {{
   *   refId: string,
   *   origin: string,
   *   position: string,
   *   flavor: 'object' | 'promise',
   *   mentionsIn: number,
   *   facing: Map<string, string>,
   *   refcounts: Map<string, number>,
   * }} RefRow
   */

  /** @type {Map<string, RefRow>} */
  const refs = new Map();

  /**
   * @typedef {{
   *   ourExports: Map<string, string>,
   *   nextExport: bigint,
   *   nextAnswer: bigint,
   *   answersOwed: Map<string, { owner: string, position: string } | { local: string | null }>,
   *   send: (bytes: Uint8Array) => void,
   *   attached: boolean,
   * }} SessionState
   */

  /** @type {Map<string, SessionState>} */
  const sessions = new Map();

  /** @type {Map<string, string>} swissnum hex -> refId */
  const publications = new Map();

  let dirty = false;

  // --- persistence ---

  const persist = () => {
    if (!dirty) {
      return;
    }
    dirty = false;
    /** @type {any} */
    const state = { refs: {}, sessions: {}, publications: {} };
    for (const [refId, row] of refs.entries()) {
      state.refs[refId] = {
        origin: row.origin,
        position: row.position,
        flavor: row.flavor,
        mentionsIn: row.mentionsIn,
        refcounts: Object.fromEntries(row.refcounts),
      };
    }
    for (const [sessionKey, session] of sessions.entries()) {
      state.sessions[sessionKey] = {
        ourExports: Object.fromEntries(session.ourExports),
        nextExport: String(session.nextExport),
        nextAnswer: String(session.nextAnswer),
        answersOwed: Object.fromEntries(session.answersOwed),
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
        ourExports: new Map(),
        nextExport: 1n,
        nextAnswer: 0n,
        answersOwed: new Map(),
        send: () => {
          throw Error(`ocapn hub: session ${sessionKey} is not attached`);
        },
        attached: false,
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
    for (const [refId, row] of Object.entries(state.refs ?? {})) {
      const r = /** @type {any} */ (row);
      refs.set(refId, {
        refId,
        origin: r.origin,
        position: r.position,
        flavor: r.flavor,
        mentionsIn: r.mentionsIn,
        facing: new Map(),
        refcounts: new Map(
          Object.entries(r.refcounts ?? {}).map(([k, v]) => [k, Number(v)]),
        ),
      });
    }
    for (const [sessionKey, s] of Object.entries(state.sessions ?? {})) {
      const sd = /** @type {any} */ (s);
      const session = provideSessionState(sessionKey);
      session.ourExports = new Map(Object.entries(sd.ourExports ?? {}));
      session.nextExport = BigInt(sd.nextExport ?? '1');
      session.nextAnswer = BigInt(sd.nextAnswer ?? '0');
      session.answersOwed = new Map(Object.entries(sd.answersOwed ?? {}));
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
   * @param {bigint} position
   * @param {'object' | 'promise'} flavor
   */
  const provideRef = (origin, position, flavor) => {
    const refId = `${origin}:${position}`;
    let row = refs.get(refId);
    if (row === undefined) {
      row = {
        refId,
        origin,
        position: String(position),
        flavor,
        mentionsIn: 0,
        facing: new Map(),
        refcounts: new Map(),
      };
      refs.set(refId, row);
      dirty = true;
    }
    return row;
  };

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
        makeToken({
          kind: 'ref',
          refId: provideRef(sessionKey, position, 'object').refId,
          introduced: true,
        }),
      /** @param {bigint} position */
      provideRemotePromiseValue: position =>
        makeToken({
          kind: 'ref',
          refId: provideRef(sessionKey, position, 'promise').refId,
          introduced: true,
        }),
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
        return makeToken({ kind: 'ref', refId });
      },
      /** @param {bigint} position */
      getLocalAnswerValue: position => {
        const row = session.answersOwed.get(String(position));
        if (row === undefined) {
          throw Error(
            `ocapn hub: session ${sessionKey} referenced unknown answer ${position}`,
          );
        }
        if ('local' in row) {
          if (row.local === null) {
            throw Error(
              `ocapn hub: session ${sessionKey} referenced an unresolvable local answer`,
            );
          }
          return makeToken({ kind: 'ref', refId: row.local });
        }
        return makeToken({
          kind: 'answer',
          owner: row.owner,
          position: row.position,
        });
      },
      /**
       * A resolveMeDesc from this session: the sender's resolver
       * export, an ordinary object reference.
       *
       * @param {bigint} position
       */
      provideRemoteResolverValue: position =>
        makeToken({
          kind: 'ref',
          refId: provideRef(sessionKey, position, 'object').refId,
          introduced: true,
        }),
      provideHandoff: () => {
        throw Error('ocapn hub: third-party handoffs are not supported');
      },
      makeSturdyRef: () => {
        throw Error('ocapn hub: sturdy refs in transit are not supported');
      },

      // -- write side (message TOWARD this session) --
      /** @param {any} value */
      getInfoForVal: value => {
        const info = infoOf(value);
        if (info.kind === 'answer') {
          if (info.owner !== sessionKey) {
            throw Error(
              'ocapn hub: an answer can only be referenced toward its owning session (answer promotion is not supported)',
            );
          }
          return { type: 'answer', isLocal: false, isThirdParty: false };
        }
        if (info.kind === 'bootstrap') {
          throw Error('ocapn hub: cannot forward a bootstrap reference');
        }
        const row = refs.get(info.refId);
        if (row === undefined) {
          throw Error(`ocapn hub: dangling reference ${info.refId}`);
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
        const info = infoOf(value);
        const row = refs.get(info.refId);
        if (row === undefined || row.origin !== sessionKey) {
          throw Error('ocapn hub: not an export of this session');
        }
        return BigInt(row.position);
      },
      /** @param {any} value */
      provideRemoteAnswerPosition: value => {
        const info = infoOf(value);
        if (info.kind !== 'answer' || info.owner !== sessionKey) {
          throw Error('ocapn hub: not an answer of this session');
        }
        return BigInt(info.position);
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
    const info = infoOf(value);
    const row = refs.get(info.refId);
    if (row === undefined) {
      throw Error(`ocapn hub: dangling reference ${info.refId}`);
    }
    const session = provideSessionState(sessionKey);
    let position = row.facing.get(sessionKey);
    if (position === undefined) {
      position = String(session.nextExport);
      session.nextExport += 1n;
      row.facing.set(sessionKey, position);
      session.ourExports.set(position, row.refId);
    }
    row.refcounts.set(sessionKey, (row.refcounts.get(sessionKey) ?? 0) + 1);
    dirty = true;
    return BigInt(position);
  };

  // --- gc ---

  /** @param {RefRow} row */
  const maybeReleaseRef = row => {
    if (row.facing.size > 0) {
      return;
    }
    if ([...publications.values()].includes(row.refId)) {
      return;
    }
    refs.delete(row.refId);
    dirty = true;
    if (row.mentionsIn > 0) {
      const origin = sessions.get(row.origin);
      if (origin !== undefined && origin.attached) {
        // eslint-disable-next-line no-use-before-define
        sendMessage(row.origin, {
          type: 'op:gc-exports',
          exportPositions: [BigInt(row.position)],
          wireDeltas: [BigInt(row.mentionsIn)],
        });
      }
    }
  };

  // --- outbound ---

  /**
   * @param {string} sessionKey
   * @param {any} message a message object in codec shape, with hub
   *   tokens for references
   */
  const sendMessage = (sessionKey, message) => {
    const session = provideSessionState(sessionKey);
    const { writeOcapnMessage } = provideCodecKit(sessionKey);
    const bytes = writeOcapnMessage(message);
    // Tables before wire: the rows any allocation created must be
    // durable before the frame that names them exists anywhere.
    persist();
    session.send(bytes);
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
      if (answerPosition !== false) {
        const [verb, value] = outcome;
        session.answersOwed.set(String(answerPosition), {
          local:
            verb === 'fulfill' && value !== undefined
              ? infoOf(value).refId
              : null,
        });
        dirty = true;
      }
      if (resolveMeDesc !== false && resolveMeDesc !== undefined) {
        const [verb, value] = outcome;
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
    if (refId === undefined || !refs.has(refId)) {
      respond(['break', harden(Error('ocapn hub: fetch: secret not found'))]);
      return;
    }
    respond(['fulfill', makeToken({ kind: 'ref', refId })]);
  };

  // --- routing ---

  /**
   * The destination session for a deliver/listen target token.
   *
   * @param {string} sessionKey
   * @param {any} target
   */
  const routeOf = (sessionKey, target) => {
    const info = infoOf(target);
    if (info.kind === 'bootstrap') {
      return undefined; // handled locally
    }
    if (info.kind === 'answer') {
      return info.owner;
    }
    const row = refs.get(info.refId);
    if (row === undefined) {
      throw Error(`ocapn hub: dangling reference ${info.refId}`);
    }
    if (row.origin === sessionKey) {
      throw Error(
        'ocapn hub: a session may not route a message to its own export',
      );
    }
    return row.origin;
  };

  /**
   * @param {string} sessionKey
   * @param {any} message
   */
  const handleMessage = (sessionKey, message) => {
    const session = provideSessionState(sessionKey);
    switch (message.type) {
      case 'op:deliver': {
        const destination = routeOf(sessionKey, message.to);
        if (destination === undefined) {
          handleBootstrapDeliver(sessionKey, message);
          return;
        }
        let { answerPosition } = message;
        if (answerPosition !== false) {
          const destinationState = provideSessionState(destination);
          const forwardedPosition = destinationState.nextAnswer;
          destinationState.nextAnswer += 1n;
          session.answersOwed.set(String(answerPosition), {
            owner: destination,
            position: String(forwardedPosition),
          });
          dirty = true;
          answerPosition = forwardedPosition;
        }
        sendMessage(destination, { ...message, answerPosition });
        return;
      }
      case 'op:get':
      case 'op:index': {
        const destination = routeOf(sessionKey, message.receiverDesc);
        if (destination === undefined) {
          throw Error(`ocapn hub: ${message.type} on the hub bootstrap`);
        }
        const destinationState = provideSessionState(destination);
        const forwardedPosition = destinationState.nextAnswer;
        destinationState.nextAnswer += 1n;
        session.answersOwed.set(String(message.answerPosition), {
          owner: destination,
          position: String(forwardedPosition),
        });
        dirty = true;
        sendMessage(destination, {
          ...message,
          answerPosition: forwardedPosition,
        });
        return;
      }
      case 'op:listen': {
        const destination = routeOf(sessionKey, message.to);
        if (destination === undefined) {
          throw Error('ocapn hub: cannot listen on the hub bootstrap');
        }
        sendMessage(destination, message);
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
        /** @type {Map<string, Array<bigint>>} */
        const grouped = new Map();
        for (const position of message.answerPositions) {
          const key = String(position);
          const row = session.answersOwed.get(key);
          if (row === undefined) {
            // eslint-disable-next-line no-continue
            continue;
          }
          session.answersOwed.delete(key);
          dirty = true;
          if ('owner' in row) {
            const list = grouped.get(row.owner) ?? [];
            list.push(BigInt(row.position));
            grouped.set(row.owner, list);
          }
        }
        for (const [owner, positions] of grouped.entries()) {
          sendMessage(owner, {
            type: 'op:gc-answers',
            answerPositions: positions,
          });
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

  return harden({
    /**
     * Attach a pre-authenticated session: the embedder owns identity
     * and transport. Returns the inbound frame sink. Reattaching the
     * same key (a successor process, a reconnect) rebinds `send`; the
     * tables carry over.
     *
     * @param {string} sessionKey
     * @param {{ send: (bytes: Uint8Array) => void }} powers
     */
    attachSession: (sessionKey, { send }) => {
      const session = provideSessionState(sessionKey);
      session.send = send;
      session.attached = true;
      persist();
      return harden({
        /** @param {Uint8Array} bytes one inbound OCapN frame */
        deliver: bytes => {
          try {
            const { readOcapnMessage } = provideCodecKit(sessionKey);
            const reader = codec.makeReader(bytes);
            const message = readOcapnMessage(reader);
            handleMessage(sessionKey, message);
            persist();
          } catch (error) {
            logError(`frame from ${sessionKey} dropped:`, error);
            persist();
          }
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
      const key =
        typeof swissnum === 'string'
          ? hexFromBytes(new TextEncoder().encode(swissnum))
          : hexFromBytes(swissnum);
      const row = provideRef(session, position, flavor);
      publications.set(key, row.refId);
      dirty = true;
      persist();
    },
    /** @param {string | Uint8Array} swissnum */
    unpublish: swissnum => {
      const key =
        typeof swissnum === 'string'
          ? hexFromBytes(new TextEncoder().encode(swissnum))
          : hexFromBytes(swissnum);
      const refId = publications.get(key);
      publications.delete(key);
      if (refId !== undefined) {
        const row = refs.get(refId);
        if (row !== undefined) {
          maybeReleaseRef(row);
        }
      }
      dirty = true;
      persist();
    },
    /**
     * The reachability graph for vat-level GC: which origin sessions
     * are referenced by publications, and which sessions hold
     * references into which origins.
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
        holdings: [...refs.values()].map(row => ({
          origin: row.origin,
          holders: [...row.facing.keys()],
        })),
      }),
  });
};
harden(makeOcapnHub);
