// Worker entrypoint. One worker hosts one OCapN client.
//
// Lifecycle:
//   1. Main thread postMessages { type: 'sim/init', designator, peerDesignators, latencyMs }.
//   2. Worker registers netlayer + one sturdy ref: DemoController (buildChain, demoMessage).
//   3. Worker postMessages { type: 'sim/ready', location }.
//   4. Main thread:
//        - sim/stop-noop-ticker  stop demoMessage ticker and clear chain root
//        - sim/start-noop-ticker  start ticker only if noopRootPromise is set (chain root exists)
//        - sim/kickoff           { chainPath: string[], traceId }  URLs like simworker://B
//        - sim/shutdown
//   5. Client locators in buildChain are netlayer URL strings: simworker://<designator>
//
// The netlayer brokers MessagePorts through the main thread; see sim-netlayer.js.

// Must be first: installs HandledPromise shim, imports SES, and runs lockdown.
import '@endo/init/debug.js';

import harden from '@endo/harden';
import { Far } from '@endo/marshal';
import { E } from '@endo/eventual-send';
import { makeClient, encodeSwissnum, locationToLocationId } from '@endo/ocapn';
import { getSelectorName } from '../../ocapn/src/selector.js';
import { nameForPassableSymbol } from '@endo/pass-style';

import { makeSimNetlayerFactory } from './sim-netlayer.js';

/** Single app sturdy ref; same swiss string used in registerSturdyRef + fetch. */
const SWISSNUM_DEMO = 'DemoController';

/** @type {string} */
let myDesignator;
/** @type {string[]} */
let peerDesignators = [];
let latencyMs = 500;
/** @type {boolean} */
let enableFlushFeature = true;
/** @type {ReturnType<typeof makeClient> | null} */
let client;
let netlayer;
/** @type {ReturnType<typeof Far> | null} */
let demoController = null;

const log = (...parts) => {
  postMessage({
    type: 'sim/log',
    args: parts.map(p => String(p)),
  });
};
const reportEvent = (event, detail = {}) => {
  postMessage({ type: 'sim/event', from: myDesignator, event, detail });
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/** @returns {number} 0..999 ms */
const randomDelay = () => Math.floor(Math.random() * 1000);

/**
 * Client locator URL for this transport (see sim-netlayer location shape).
 * @param {string} url
 */
const parseLocator = url => {
  const m = /^simworker:\/\/([^/]+)$/.exec(String(url).trim());
  if (!m) {
    throw Error(
      `invalid client locator (expected simworker://<designator>): ${url}`,
    );
  }
  return harden({
    type: /** @type {'ocapn-peer'} */ ('ocapn-peer'),
    transport: /** @type {'simworker'} */ ('simworker'),
    designator: m[1],
    hints: harden({}),
  });
};

/** @type {Promise<void>} */
let noopWaveChain = Promise.resolve();

/** Only `E(demoController).buildChain(path)` on A (until stop/shutdown error). Steady demoMessage pipelines on this; no fallback enliven. */
let promiseChainEntryPromise = null;

/** Monotonic seq passed only as demoMessage(seq) (wire + viz). */
let demoSeqCounter = 0;

/** @type {WeakSet<object>} */
const wireTappedOcapn = new WeakSet();

let noopTimer;

/**
 * @param {unknown} v
 * @returns {number}
 */
const toNum = v =>
  typeof v === 'bigint' ? Number(v) : Number(/** @type {any} */ (v));

const countCapSlots = table => {
  let n = 0;
  for (let pos = 0n; pos < 64n; pos += 1n) {
    for (const typ of ['o', 'p', 'a']) {
      const locSlot = `${typ}+${pos}`;
      const remSlot = `${typ}-${pos}`;
      if (table.getValueForSlot(locSlot) !== undefined) {
        if (typ === 'o' && pos === 0n) continue;
        n += 1;
      }
      if (table.getValueForSlot(remSlot) !== undefined) {
        n += 1;
      }
    }
  }
  return n;
};

const argHasHandoffDesc = (v, depth = 0) => {
  if (depth > 10 || v === null || v === undefined || typeof v !== 'object') {
    return false;
  }
  const inner = v.object !== undefined ? v.object : v;
  if (
    inner &&
    typeof inner === 'object' &&
    (inner.type === 'desc:handoff-give' ||
      inner.type === 'desc:handoff-receive')
  ) {
    return true;
  }
  for (const k of Object.keys(v)) {
    if (argHasHandoffDesc(v[k], depth + 1)) return true;
  }
  return false;
};

const deliverMethodName = firstArg => {
  if (typeof firstArg === 'string') return firstArg;
  if (typeof firstArg === 'symbol') {
    const name = nameForPassableSymbol(firstArg);
    if (typeof name === 'string' && !name.startsWith('@@')) {
      return name;
    }
    try {
      return getSelectorName(firstArg);
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * @param {'send' | 'receive'} direction
 * @param {string} peerDesignator
 * @param {any} message
 * @returns {object | null}
 */
const classifyVizMessage = (direction, peerDesignator, message) => {
  if (!message || typeof message !== 'object') return null;
  const t = message.type;

  if (t === 'op:flush' || t === 'op:flush-done') {
    return {
      kind: 'flush',
      direction,
      peer: peerDesignator,
      msgType: t,
      position:
        message.position !== undefined ? toNum(message.position) : undefined,
    };
  }

  if (t === 'op:abort') {
    return {
      kind: 'abort',
      direction,
      peer: peerDesignator,
      reason:
        message.reason !== undefined && message.reason !== null
          ? String(message.reason)
          : undefined,
    };
  }

  if (
    t === 'op:deliver' &&
    Array.isArray(message.args) &&
    message.args.length > 0
  ) {
    const method = deliverMethodName(message.args[0]);
    const rest = message.args.slice(1);

    if (method === 'demoMessage' && rest.length >= 1) {
      return {
        kind: 'noop',
        direction,
        peer: peerDesignator,
        seq: toNum(rest[0]),
      };
    }

    if (method === 'buildChain' && rest.length >= 1 && Array.isArray(rest[0])) {
      return {
        kind: 'forward',
        direction,
        peer: peerDesignator,
        n: rest[0].length,
      };
    }

    if (method === 'deposit-gift' || method === 'withdraw-gift') {
      return { kind: 'handoff', direction, peer: peerDesignator, method };
    }

    if (method && message.args.some(a => argHasHandoffDesc(a))) {
      return {
        kind: 'handoff',
        direction,
        peer: peerDesignator,
        method,
      };
    }
  }

  return null;
};

/**
 * @param {{ _debug?: { subscribeMessages: Function } }} ocapn
 * @param {string} peerDesignator
 */
const attachWireTap = (ocapn, peerDesignator) => {
  const dbg = ocapn._debug;
  if (!dbg || wireTappedOcapn.has(ocapn)) return;
  wireTappedOcapn.add(ocapn);
  dbg.subscribeMessages((direction, message) => {
    const viz = classifyVizMessage(direction, peerDesignator, message);
    if (viz) {
      reportEvent('viz-op', viz);
    }
  });
};

const ensureWireTaps = () => {
  if (!client?._debug) return;
  for (const peer of peerDesignators) {
    const peerLocation = harden({
      type: /** @type {'ocapn-peer'} */ ('ocapn-peer'),
      transport: /** @type {'simworker'} */ ('simworker'),
      designator: peer,
      hints: harden({}),
    });
    const session = client._debug.sessionManager.getActiveSession(
      locationToLocationId(peerLocation),
    );
    if (session?.ocapn) {
      attachWireTap(session.ocapn, peer);
    }
  }
};

const createDemoController = () =>
  Far('DemoController', {
    /**
     * @param {string[]} locators Net URLs: simworker://&lt;designator&gt;
     * @returns {Promise<any>}
     */
    buildChain: locators => {
      if (!client?._debug) {
        throw Error('no client debug api');
      }
      const list = Array.isArray(locators) ? [...locators] : [];
      // If end of chain, return a Destination object.
      if (list.length === 0) {
        log('buildChain: empty path -> local Destination');
        // await sleep(randomDelay());
        // await sleep(randomDelay());
        return Far('Destination', {
          demoMessage: async seq => {
            void seq;
          },
        });
      }
      const [head, ...rest] = list;
      // const beforeTime = randomDelay();
      // const afterTime = randomDelay();
      // await sleep(beforeTime);
      const loc = parseLocator(head);
      const sessionP = client.provideSession(loc);
      const bootstrapP = E(sessionP).getBootstrap();
      const demoControllerP = E(bootstrapP).fetch(
        encodeSwissnum(SWISSNUM_DEMO),
      );
      return E(demoControllerP).buildChain(rest);
    },
  });

const makeMainBridge = () =>
  harden({
    postToMain: (msg, transfer) => {
      if (transfer) {
        postMessage(msg, transfer);
      } else {
        postMessage(msg);
      }
    },
    onMainMessage: handler => {
      addEventListener('message', ev => {
        const msg = ev.data;
        if (
          msg &&
          typeof msg.type === 'string' &&
          msg.type.startsWith('sim/')
        ) {
          if (
            msg.type === 'sim/incoming-port' ||
            msg.type === 'sim/outgoing-port' ||
            msg.type === 'sim/connect-failed'
          ) {
            handler(msg);
          }
        }
      });
    },
  });

const setupClient = async () => {
  client = makeClient({
    debugLabel: `worker-${myDesignator.slice(0, 6)}`,
    verbose: false,
    debugMode: true,
    enableFlush: enableFlushFeature,
  });
  demoController = createDemoController();
  client.registerSturdyRef(SWISSNUM_DEMO, demoController);
  netlayer = await client.registerNetlayer(
    makeSimNetlayerFactory({
      designator: myDesignator,
      getLatencyMs: () => latencyMs,
      mainBridge: makeMainBridge(),
      reportPreSessionWire: detail => reportEvent('viz-op', detail),
    }),
  );
};

const reportSnapshot = () => {
  ensureWireTaps();
  const peers = [];
  if (client?._debug) {
    for (const peer of peerDesignators) {
      const peerLocation = harden({
        type: /** @type {'ocapn-peer'} */ ('ocapn-peer'),
        transport: /** @type {'simworker'} */ ('simworker'),
        designator: peer,
        hints: harden({}),
      });
      const session = client._debug.sessionManager.getActiveSession(
        locationToLocationId(peerLocation),
      );
      if (
        session?.ocapn?._debug &&
        countCapSlots(session.ocapn._debug.ocapnTable) > 0
      ) {
        peers.push({ designator: peer });
      }
    }
  }
  postMessage({ type: 'sim/snapshot', from: myDesignator, peers });
};

let snapshotTimer;

const startSnapshotLoop = () => {
  stopSnapshotLoop();
  snapshotTimer = setInterval(reportSnapshot, 500);
};
const stopSnapshotLoop = () => {
  if (snapshotTimer !== undefined) {
    clearInterval(snapshotTimer);
    snapshotTimer = undefined;
  }
};

const stopNoopLoop = () => {
  if (noopTimer !== undefined) {
    clearInterval(noopTimer);
    noopTimer = undefined;
  }
  noopWaveChain = Promise.resolve();
};

const resumeSteadyDemoMessages = () => {
  if (peerDesignators.length === 0) {
    log('resumeSteadyDemoMessages: skip - no peers');
    return;
  }
  if (promiseChainEntryPromise == null) {
    log(
      'steady demo: no chain root — ticker off (Restart or a successful kickoff required)',
    );
    return;
  }
  log('steady demo: starting ticker on buildChain promise root');
  startNoopLoop();
};

const startNoopLoop = () => {
  stopNoopLoop();
  noopTimer = setInterval(() => {
    if (promiseChainEntryPromise === null) return;
    demoSeqCounter += 1;
    const seq = demoSeqCounter;
    const run = () => {
      try {
        // E.sendOnly(noopRootPromise).demoMessage(seq);
        E(promiseChainEntryPromise)
          .demoMessage(seq)
          .catch(err => {
            log('demoMessage tick failed', `seq=${seq}`, String(err));
          });
      } catch (err) {
        log('demoMessage tick failed', `seq=${seq}`, String(err));
      }
    };
    noopWaveChain = noopWaveChain.then(run).catch(err => {
      log('demoMessage queue chain failed', String(err));
    });
  }, 200);
};

addEventListener('message', async ev => {
  const msg = ev.data;
  if (!msg || typeof msg.type !== 'string') return;
  try {
    if (msg.type === 'sim/init') {
      myDesignator = msg.designator;
      peerDesignators = (msg.peerDesignators || []).filter(
        d => d !== myDesignator,
      );
      latencyMs = msg.latencyMs ?? 500;
      enableFlushFeature = msg.enableFlush !== false;
      promiseChainEntryPromise = null;
      demoSeqCounter = 0;
      stopNoopLoop();
      demoController = null;
      await setupClient();
      startSnapshotLoop();
      postMessage({
        type: 'sim/ready',
        from: myDesignator,
        location: { ...netlayer.location },
      });
    } else if (msg.type === 'sim/update-peers') {
      peerDesignators = (msg.peerDesignators || []).filter(
        d => d !== myDesignator,
      );
      latencyMs = msg.latencyMs ?? latencyMs;
    } else if (msg.type === 'sim/stop-noop-ticker') {
      stopNoopLoop();
      promiseChainEntryPromise = null;
    } else if (msg.type === 'sim/start-noop-ticker') {
      demoSeqCounter = 0;
      resumeSteadyDemoMessages();
    } else if (msg.type === 'sim/kickoff') {
      const { chainPath, traceId } = msg;
      const path = Array.isArray(chainPath) ? chainPath : [];
      reportEvent('kickoff', { chainLength: path.length });
      if (!demoController) {
        postMessage({
          type: 'sim/kickoff-result',
          from: myDesignator,
          traceId,
          error: 'DemoController not initialized',
        });
        return;
      }
      try {
        const startPromise = /** @type {Promise<any>} */ (
          /** @type {any} */ (E(demoController)).buildChain(path)
        );
        promiseChainEntryPromise = startPromise;
        demoSeqCounter = 0;
        startNoopLoop();
        log(
          'kickoff: demo ticker on buildChain promise',
          `hops=${path.length}`,
        );
        const result = await startPromise;
        postMessage({
          type: 'sim/kickoff-result',
          from: myDesignator,
          traceId,
          result:
            result && typeof result === 'object'
              ? '[Destination]'
              : String(result),
        });
      } catch (err) {
        stopNoopLoop();
        promiseChainEntryPromise = null;
        postMessage({
          type: 'sim/kickoff-result',
          from: myDesignator,
          traceId,
          error: String(err),
        });
      } finally {
        resumeSteadyDemoMessages();
      }
    } else if (msg.type === 'sim/shutdown') {
      stopSnapshotLoop();
      stopNoopLoop();
      promiseChainEntryPromise = null;
      try {
        client?.shutdown();
      } catch {}
    }
  } catch (err) {
    log('worker top-level error', String(err));
  }
});
