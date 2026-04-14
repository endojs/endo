// @ts-check
/* global globalThis, trace */

/**
 * Polyfills that the daemon needs inside XS but the worker does not.
 *
 * `daemon.js` and its transitive dependencies use `console`,
 * `setTimeout`/`clearTimeout`, and `URL` — none of which XS provides
 * natively.  This module installs minimal shims on first evaluation
 * and is a no-op on subsequent re-evaluations.
 *
 * The worker bundle intentionally does not import this module so that
 * its footprint stays small.
 */

// ---------------------------------------------------------------------------
// console polyfill — routes through trace (stderr via Rust)
// ---------------------------------------------------------------------------

if (typeof globalThis.console === 'undefined') {
  const makeLogFn =
    /** @param {string} prefix */
    prefix =>
    (/** @type {unknown[]} */ ...args) => {
      const parts = args.map(a => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      });
      trace(`${prefix}${parts.join(' ')}`);
    };
  globalThis.console = /** @type {any} */ ({
    log: makeLogFn(''),
    warn: makeLogFn('[warn] '),
    error: makeLogFn('[error] '),
    info: makeLogFn('[info] '),
    debug: makeLogFn('[debug] '),
    trace: makeLogFn('[trace] '),
  });
}

// ---------------------------------------------------------------------------
// setTimeout/clearTimeout polyfill — fires callbacks on the microtask
// queue because XS has no real event loop
// ---------------------------------------------------------------------------

if (typeof globalThis.setTimeout === 'undefined') {
  let nextTimerId = 1;
  /** @type {Set<number>} */
  const activeTimers = new Set();

  globalThis.setTimeout = /** @type {any} */ (
    (/** @type {Function} */ fn, /** @type {number} */ _ms) => {
      const id = nextTimerId;
      nextTimerId += 1;
      activeTimers.add(id);
      void Promise.resolve().then(() => {
        if (activeTimers.has(id)) {
          activeTimers.delete(id);
          fn();
        }
      });
      return id;
    }
  );

  globalThis.clearTimeout = /** @type {any} */ (
    (/** @type {number} */ id) => {
      activeTimers.delete(id);
    }
  );
}

// ---------------------------------------------------------------------------
// URL polyfill — sufficient for endo:// locators
// ---------------------------------------------------------------------------

if (typeof globalThis.URL === 'undefined') {
  /**
   * @param {string} input
   * @this {any}
   */
  const URLPolyfill = function URL(input) {
    const protocolEnd = input.indexOf('://');
    if (protocolEnd === -1) throw new Error(`Invalid URL: ${input}`);
    this.protocol = `${input.slice(0, protocolEnd)}:`;
    const rest = input.slice(protocolEnd + 3);
    const pathStart = rest.indexOf('/');
    const queryStart = rest.indexOf('?');

    if (pathStart === -1 && queryStart === -1) {
      this.host = rest;
      this.hostname = rest;
      this.pathname = '/';
    } else if (queryStart !== -1 && (pathStart === -1 || queryStart < pathStart)) {
      this.host = rest.slice(0, queryStart);
      this.hostname = this.host;
      this.pathname = '/';
    } else {
      this.host = rest.slice(0, pathStart);
      this.hostname = this.host;
      const pathEnd = queryStart !== -1 ? queryStart : rest.length;
      this.pathname = rest.slice(pathStart, pathEnd);
    }

    /** @type {Array<[string, string]>} */
    const params = [];
    const qIdx = input.indexOf('?');
    if (qIdx !== -1) {
      const qs = input.slice(qIdx + 1);
      for (const pair of qs.split('&')) {
        if (!pair) continue;
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) {
          params.push([decodeURIComponent(pair), '']);
        } else {
          params.push([
            decodeURIComponent(pair.slice(0, eqIdx)),
            decodeURIComponent(pair.slice(eqIdx + 1)),
          ]);
        }
      }
    }

    this.searchParams = {
      /** @param {string} key @param {string} value */
      set(key, value) {
        let i = params.length;
        while (i--) {
          if (params[i][0] === key) params.splice(i, 1);
        }
        params.push([key, value]);
      },
      /** @param {string} key @param {string} value */
      append(key, value) {
        params.push([key, value]);
      },
      /** @param {string} key @returns {string | null} */
      get(key) {
        for (const [k, v] of params) {
          if (k === key) return v;
        }
        return null;
      },
      /** @param {string} key @returns {string[]} */
      getAll(key) {
        return params.filter(([k]) => k === key).map(([, v]) => v);
      },
      /** @param {string} key @returns {boolean} */
      has(key) {
        return params.some(([k]) => k === key);
      },
      *keys() {
        for (const [k] of params) yield k;
      },
      /** @returns {string} */
      toString() {
        return params
          .map(
            ([k, v]) =>
              `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
          )
          .join('&');
      },
    };

    this.toString = () => {
      const qs = this.searchParams.toString();
      const base = `${this.protocol}//${this.hostname}${this.pathname}`;
      return qs ? `${base}?${qs}` : base;
    };

    Object.defineProperty(this, 'href', {
      get: () => this.toString(),
      enumerable: true,
      configurable: true,
    });
  };

  URLPolyfill.canParse = (/** @type {string} */ input) => {
    try {
      // eslint-disable-next-line no-new
      new (/** @type {any} */ (URLPolyfill))(input);
      return true;
    } catch {
      return false;
    }
  };

  globalThis.URL = /** @type {any} */ (URLPolyfill);
}
