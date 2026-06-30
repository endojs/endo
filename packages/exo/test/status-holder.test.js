/* eslint-disable no-new */
/* eslint-disable class-methods-use-this */
/* eslint-disable @endo/restrict-comparison-operands */
/* eslint-disable max-classes-per-file */

/*
 * Example transliterated from
 * https://papers.agoric.com/papers/robust-composition/abstract/
 * Section 13.1 "Sequential Interleaving Hazards"
 * and Figures 13.1 and 13.2 .
 * See Chapter 13 for context.
 */

import test from '@endo/ses-ava/prepare-endo.js';

export class StatusHolder {
  #myStatus;

  #myListeners = [];

  constructor(status) {
    this.#myStatus = status;
  }

  addListener(newListener) {
    this.#myListeners.push(newListener);
  }

  get status() {
    return this.#myStatus;
  }

  set status(newStatus) {
    this.#myStatus = newStatus;
    for (const listener of this.#myListeners) {
      listener.statusChanged(newStatus);
    }
  }
}

const Nat = n => {
  if (typeof n === 'bigint' && n >= 0) {
    return n;
  }
  throw new Error('something bad happened');
};

export class AcctMgr {
  #statusHolder;

  constructor() {
    this.#statusHolder = new StatusHolder(0n);
  }

  get statusHolder() {
    return this.#statusHolder;
  }

  withdraw(amount) {
    this.#statusHolder.status = Nat(this.#statusHolder.status - Nat(amount));
  }

  deposit(amount) {
    this.#statusHolder.status += Nat(amount);
  }
}

export class FinanceListener {
  #statusHolder;

  constructor(acctMgr) {
    this.#statusHolder = acctMgr.statusHolder;
    this.#statusHolder.addListener(this);
  }

  statusChanged(newStatus) {
    if (newStatus < 4000n) {
      this.#statusHolder.status += 1000n;
    }
  }
}

const log = [];

export class CellViewer {
  constructor(acctMgr) {
    const statusHolder = acctMgr.statusHolder;
    log.push(statusHolder.status);
    statusHolder.addListener(this);
  }

  statusChanged(newStatus) {
    log.push(newStatus);
  }
}

test('nested publication bug', t => {
  const acctMgr = new AcctMgr();
  const statusHolder = acctMgr.statusHolder;
  t.is(statusHolder.status, 0n);
  t.deepEqual(log, []);
  new FinanceListener(acctMgr);
  new CellViewer(acctMgr);
  t.deepEqual(log, [0n]);

  acctMgr.deposit(4000n);
  t.is(statusHolder.status, 4000n);
  t.deepEqual(log, [0n, 4000n]);

  acctMgr.withdraw(100n);
  t.is(statusHolder.status, 4900n);
  t.deepEqual(log, [0n, 4000n, 4900n, 3900n]);
});
