// Main-thread bridge: brokers MessagePort pairs between workers in
// response to their `sim/connect` requests.
//
// One Bridge instance per simulation. The controller adds workers to
// the bridge with their stable designator; the bridge wires each
// worker's outgoing-message stream to a single dispatch handler.

export class Bridge {
  constructor() {
    /** @type {Map<string, Worker>} */
    this.workers = new Map(); // designator -> Worker
    /** @type {(msg: any) => void} */
    this.onUnknownMessage = () => {};
  }

  /**
   * @param {string} designator
   * @param {Worker} worker
   */
  add(designator, worker) {
    this.workers.set(designator, worker);
    worker.addEventListener('message', ev => {
      const msg = ev.data;
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'sim/connect') {
        this.broker(designator, msg.toDesignator);
      } else {
        this.onUnknownMessage({ from: designator, msg });
      }
    });
  }

  /**
   * Create a MessageChannel and hand each end to the appropriate
   * worker. The requester gets `sim/outgoing-port`; the responder gets
   * `sim/incoming-port`.
   *
   * @param {string} fromDesignator
   * @param {string} toDesignator
   */
  broker(fromDesignator, toDesignator) {
    const fromWorker = this.workers.get(fromDesignator);
    const toWorker = this.workers.get(toDesignator);
    if (!fromWorker) return;
    if (!toWorker) {
      fromWorker.postMessage({
        type: 'sim/connect-failed',
        toDesignator,
        reason: `no such peer ${toDesignator}`,
      });
      return;
    }
    const channel = new MessageChannel();
    fromWorker.postMessage(
      {
        type: 'sim/outgoing-port',
        toDesignator,
        port: channel.port1,
      },
      [channel.port1],
    );
    toWorker.postMessage(
      {
        type: 'sim/incoming-port',
        peerDesignator: fromDesignator,
        port: channel.port2,
      },
      [channel.port2],
    );
  }

  shutdown() {
    for (const worker of this.workers.values()) {
      try {
        worker.postMessage({ type: 'sim/shutdown' });
      } catch {}
      try {
        worker.terminate();
      } catch {}
    }
    this.workers.clear();
  }
}
