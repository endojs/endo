// Based on sync-context-original.js

// Shallow binding implementation of SyncContext.
// Should not be observably different than sync-context-original.js
// but implemented without top-level state, showing
//    * no nonflict with ocap principles, therefore
//    * no introduction of ambient communications channel.

export class SyncContext {
  #state;

  run(val, cb, args = []) {
    const prev = this.#state;
    try {
      this.#state = val;
      return cb(...args);
    } finally {
      this.#state = prev;
    }
  }

  get() {
    return this.#state;
  }
}
harden(SyncContext);
