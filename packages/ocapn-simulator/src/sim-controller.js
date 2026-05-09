// Top-level orchestration. Owns the worker pool, the bridge, and world state
// derived from worker messages. Emits view updates via `emit` — no DOM.

import { Bridge } from './bridge.js';

/**
 * @typedef {(
 *   | {
 *       type: 'worldView';
 *       designators: string[];
 *       sessions: string[];
 *       active: string[];
 *       busyDesignators: string[];
 *       sessionSummaryText: string;
 *     }
 *   | {
 *       type: 'log';
 *       category: string;
 *       text: string;
 *       ooo?: boolean;
 *     }
 *   | { type: 'logClear' }
 *   | { type: 'vizClearFlights' }
 *   | {
 *       type: 'vizPulse';
 *       from: string;
 *       peer: string;
 *       flightMs: number;
 *       pulseClass: string;
 *       labelText?: string;
 *     }
 * )} SimViewEvent
 */

/**
 * Excel-style labels: A..Z, AA, AB, ...
 * @param {number} index 0-based
 * @returns {string}
 */
const alphabetDesignator = index => {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

/** @param {number} count */
const makeDesignators = count =>
  Array.from({ length: count }, (_, i) => alphabetDesignator(i));

const trim = (str, max) => (str.length <= max ? str : `${str.slice(0, max)}…`);

export class SimController {
  /**
   * @param {object} opts
   * @param {(e: SimViewEvent) => void} [opts.emit]
   */
  constructor({ emit } = {}) {
    /** @type {(e: SimViewEvent) => void} */
    this._emit = emit ?? (() => {});
    this.bridge = null;
    this.workers = []; // [{ designator, worker, ready }]
    this.designators = [];
    /** @type {Map<string, Set<string>>} */
    this.peersOfWorker = new Map(); // designator -> Set<peerDesignator> from snapshots
    /** @type {Map<string, number>} */
    this.activityScore = new Map(); // edgeKey -> last activity timestamp
    this.busyDesignators = new Set();
    this.traceCounter = 0;
    /** @type {Map<string, number>} directed `${sender}|${receiver}` -> next expected noop seq */
    this.noopExpected = new Map();
    /** @type {{ noop: boolean, forward: boolean, flush: boolean, handoff: boolean, handshake: boolean, abort: boolean }} */
    this.graphMessageFilters = {
      noop: true,
      forward: true,
      flush: true,
      handoff: true,
      handshake: true,
      abort: true,
    };
    /** Simulated one-way latency per worker (ms); matches sim-netlayer write + read delays. */
    this.latencyMs = 500;
    this.enableFlush = true;
  }

  /**
   * @param {'noop' | 'forward' | 'flush' | 'handoff' | 'handshake' | 'abort'} cat
   * @param {boolean} visible
   */
  setGraphMessageFilter(cat, visible) {
    if (this.graphMessageFilters[cat] === undefined) return;
    this.graphMessageFilters[cat] = visible;
  }

  edgeKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  /**
   * @param {'noop' | 'forward' | 'flush' | 'handoff' | 'handshake' | 'abort' | 'misc'} category
   * @param {string} text
   * @param {object} [opts]
   * @param {boolean} [opts.ooo]
   */
  appendLog(category, text, opts = {}) {
    if (
      ![
        'noop',
        'forward',
        'flush',
        'handoff',
        'handshake',
        'abort',
        'misc',
      ].includes(category)
    ) {
      category = 'misc';
    }
    const { ooo = false } = opts;
    this._emit({ type: 'log', category, text, ooo });
  }

  log(line) {
    this.appendLog('misc', line);
  }

  /**
   * @param {string} from designator of worker that emitted the event
   * @param {object} detail
   */
  applyVizOp(from, detail) {
    const { kind, direction, peer, seq, n, msgType, method, position, reason } =
      detail;
    const isSend = direction === 'send';
    /** One logical hop applies latency on send and again on receive (see sim-netlayer). */
    const flightMs = Math.max(1, 2 * this.latencyMs);
    const maybePulse = (pulseClass, filterKey, labelText) => {
      if (!isSend) return;
      if (!this.graphMessageFilters[filterKey]) return;
      this._emit({
        type: 'vizPulse',
        from,
        peer,
        flightMs,
        pulseClass,
        labelText,
      });
    };

    if (kind === 'forward') {
      maybePulse('flow-pulse-forward', 'forward');
      if (!isSend) {
        this.busyDesignators.add(from);
        setTimeout(() => {
          this.busyDesignators.delete(from);
          this.emitWorldView();
        }, 1500);
      } else {
        this.activityScore.set(this.edgeKey(from, peer), Date.now());
        this.busyDesignators.add(from);
        this.busyDesignators.add(peer);
        setTimeout(() => {
          this.busyDesignators.delete(from);
          this.busyDesignators.delete(peer);
          this.emitWorldView();
        }, 1500);
      }
      const nLabel = n === undefined || Number.isNaN(n) ? '?' : String(n);
      this.appendLog(
        'forward',
        `${direction} forward(n=${nLabel}) peer ${trim(peer, 6)}`,
      );
      return;
    }

    if (kind === 'noop') {
      const noopLabel =
        seq !== undefined && !Number.isNaN(seq) ? String(seq) : undefined;
      maybePulse('flow-pulse-noop', 'noop', noopLabel);
      if (seq === undefined || Number.isNaN(seq)) return;
      if (isSend) {
        this.appendLog('noop', `noop send #${seq} → ${trim(peer, 6)}`);
      } else {
        const key = `${peer}|${from}`;
        const exp = this.noopExpected.get(key) ?? 1;
        if (seq !== exp) {
          console.error('[ocapn-simulator] noop recv out of order', {
            from,
            peer,
            seq,
            expected: exp,
          });
          this.appendLog(
            'noop',
            `OUT OF ORDER noop #${seq} (expected ${exp}) ← ${trim(peer, 6)}`,
            { ooo: true },
          );
        } else {
          this.appendLog('noop', `noop recv #${seq} ← ${trim(peer, 6)}`);
        }
        this.noopExpected.set(key, exp + 1);
      }
      return;
    }

    if (kind === 'handshake') {
      maybePulse('flow-pulse-handshake', 'handshake');
      this.appendLog(
        'handshake',
        `${direction} op:start-session peer ${trim(peer, 6)}`,
      );
      return;
    }

    if (kind === 'abort') {
      maybePulse('flow-pulse-abort', 'abort');
      const r =
        reason !== undefined && reason !== null && reason !== ''
          ? trim(String(reason), 48)
          : '';
      this.appendLog(
        'abort',
        `${direction} op:abort${r ? ` (${r})` : ''} peer ${trim(peer, 6)}`,
      );
      return;
    }

    if (kind === 'flush') {
      const pos = position !== undefined ? String(position) : '';
      maybePulse('flow-pulse-flush', 'flush');
      this.appendLog(
        'flush',
        `${direction} ${msgType}${pos ? ` pos ${pos}` : ''} peer ${trim(peer, 6)}`,
      );
      return;
    }

    if (kind === 'handoff') {
      maybePulse('flow-pulse-handoff', 'handoff');
      const m = method || 'handoff';
      this.appendLog('handoff', `${direction} ${m} peer ${trim(peer, 6)}`);
    }
  }

  emitWorldView() {
    const sessions = new Set();
    for (const [from, peers] of this.peersOfWorker) {
      for (const peer of peers) {
        sessions.add(this.edgeKey(from, peer));
      }
    }
    const active = new Set();
    const now = Date.now();
    for (const [key, ts] of this.activityScore) {
      if (now - ts < 3000) active.add(key);
    }
    const lines = [];
    for (const designator of this.designators) {
      const peers = Array.from(this.peersOfWorker.get(designator) ?? []).map(
        p => trim(p, 6),
      );
      lines.push(`${trim(designator, 6)} : [${peers.join(', ')}]`);
    }
    this._emit({
      type: 'worldView',
      designators: [...this.designators],
      sessions: [...sessions],
      active: [...active],
      busyDesignators: [...this.busyDesignators],
      sessionSummaryText: lines.join('\n'),
    });
  }

  /**
   * @param {object} opts
   * @param {number} opts.clientCount
   * @param {number} opts.latencyMs
   * @param {boolean} [opts.enableFlush]
   * @param {number} opts.chainLength
   * @param {boolean} [opts.chainUniqueInPath=true] - when true, each hop targets a distinct node; length is capped by peer count. When false, nodes may repeat in the chain but never on two successive hops (always enforced).
   */
  async restart({
    clientCount,
    latencyMs,
    enableFlush = true,
    chainLength,
    chainUniqueInPath = true,
  }) {
    this.enableFlush = enableFlush;
    this.latencyMs = Math.max(0, Number(latencyMs) || 0);

    for (const { worker } of this.workers) {
      try {
        worker.postMessage({ type: 'sim/stop-noop-ticker' });
      } catch {
        /* worker may already be dead */
      }
    }

    this._emit({ type: 'logClear' });
    this._emit({ type: 'vizClearFlights' });

    if (this.bridge) {
      this.bridge.shutdown();
      this.bridge = null;
    }
    this.workers = [];
    this.peersOfWorker = new Map();
    this.activityScore = new Map();
    this.busyDesignators = new Set();
    this.noopExpected = new Map();
    this.designators = makeDesignators(clientCount);
    this.bridge = new Bridge();
    this.bridge.onUnknownMessage = ({ from, msg }) =>
      this.handleWorkerMessage(from, msg);

    const readyPromises = [];
    for (const designator of this.designators) {
      const worker = new Worker(new URL('./worker.js', import.meta.url), {
        type: 'module',
      });
      this.bridge.add(designator, worker);
      this.workers.push({ designator, worker });
      readyPromises.push(
        new Promise(resolve => {
          const onMsg = ev => {
            if (ev.data?.type === 'sim/ready') {
              worker.removeEventListener('message', onMsg);
              resolve();
            }
          };
          worker.addEventListener('message', onMsg);
        }),
      );
      worker.postMessage({
        type: 'sim/init',
        designator,
        peerDesignators: this.designators,
        latencyMs,
        enableFlush,
      });
    }

    this.appendLog(
      'misc',
      `Spawning ${clientCount} workers (latency=${latencyMs}ms, enableFlush=${enableFlush}, chainLength=${Math.min(20, Math.max(1, Number(chainLength) || 1))}, uniqueInChain=${chainUniqueInPath})…`,
    );
    await Promise.all(readyPromises);
    this.appendLog('misc', 'All workers ready.');
    this.kickoff({
      chainLength: Math.min(20, Math.max(1, Number(chainLength) || 1)),
      chainUniqueInPath,
    });
    this.emitWorldView();
  }

  handleWorkerMessage(from, msg) {
    switch (msg.type) {
      case 'sim/snapshot': {
        const set = new Set(msg.peers.map(p => p.designator));
        this.peersOfWorker.set(from, set);
        this.emitWorldView();
        break;
      }
      case 'sim/event': {
        const { event, detail } = msg;
        if (event === 'viz-op') {
          this.applyVizOp(from, detail);
        }
        break;
      }
      case 'sim/log': {
        const parts = msg.args;
        const body = Array.isArray(parts)
          ? parts.map(p => String(p)).join(' ')
          : String(parts ?? '');
        this.appendLog('misc', `[${trim(from, 6)}] ${body}`);
        break;
      }
      case 'sim/kickoff-result': {
        if (msg.error) {
          this.appendLog(
            'misc',
            `kickoff-result (${trim(from, 6)}): error ${msg.error}`,
          );
        } else {
          const r = msg.result;
          const text = typeof r === 'string' ? r : JSON.stringify(r);
          this.appendLog('misc', `kickoff-result (${trim(from, 6)}): ${text}`);
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Hop path as `simworker://` URLs (all clients except initiator A).
   * Successive hops never target the same node. Optional `uniqueInChain` (default true)
   * also forbids repeating a node later in the path; effective length ≤ peer count.
   * @param {number} chainLength
   * @param {boolean} [uniqueInChain=true]
   * @returns {string[]}
   */
  pickChainPath(chainLength, uniqueInChain = true) {
    const [, ...peers] = this.designators;
    const want = Math.min(
      20,
      Math.max(0, Math.floor(Number(chainLength) || 0)),
    );
    if (want === 0 || peers.length === 0) {
      return [];
    }
    if (peers.length === 1) {
      return [`simworker://${peers[0]}`];
    }
    if (uniqueInChain) {
      const cap = Math.min(want, peers.length);
      return peers.slice(0, cap).map(d => `simworker://${d}`);
    }
    const out = [];
    for (let i = 0; i < want; i++) {
      out.push(`simworker://${peers[i % peers.length]}`);
    }
    return out;
  }

  kickoff({ chainLength, chainUniqueInPath = true }) {
    if (this.workers.length === 0) {
      this.appendLog('misc', 'no workers; press Restart first');
      return;
    }
    const initiator = this.designators[0];
    const target = this.workers.find(w => w.designator === initiator);
    if (!target) {
      this.appendLog('misc', 'initiator client missing');
      return;
    }
    const traceId = ++this.traceCounter;
    const chainPath = this.pickChainPath(chainLength, chainUniqueInPath);
    const pathLabel = chainPath
      .map(s => s.replace(/^simworker:\/\//, ''))
      .join('→');
    this.appendLog(
      'misc',
      `kickoff #${traceId}: ${initiator} buildChain(${pathLabel})`,
    );
    for (const { worker } of this.workers) {
      worker.postMessage({ type: 'sim/stop-noop-ticker' });
    }
    this.noopExpected.clear();
    target.worker.postMessage({
      type: 'sim/kickoff',
      chainPath,
      traceId,
    });
  }
}
