// @ts-check

/**
 * Browser capability with structural origin confinement.
 *
 * Per the `endoclaw-browser` design, a `Browser` exo gives a guest agent a
 * confined web-browsing context. The host configures an origin allowlist
 * up front; the agent navigates, reads page text, fills inputs, clicks,
 * and submits forms, but only against URLs whose origin appears in the
 * allowlist. The agent has no way to construct a URL that escapes the
 * configured set: `goto()` rejects the request before any network or
 * Playwright call runs.
 *
 * The browser action is performed by a `Backend` parameter the factory
 * accepts. The shape of the `Backend` is the seam where a real Playwright
 * driver plugs in; in tests, a small in-memory fake stands in. Splitting
 * the safety property (origin enforcement, read-only mediation,
 * revocation) from the transport (Playwright) lets the load-bearing
 * properties be tested without bringing in a 150 MB chromium download.
 *
 * The companion `BrowserControl` exo lets the host change the allowlist,
 * toggle a read-only mode that disables `fill`/`click`/`submit` on every
 * live page, and revoke the browser. Revocation closes the backend and
 * causes every subsequent operation, on both the browser and any
 * outstanding page, to throw.
 *
 * Choices not specified by the design are documented at the call site:
 * `textContent` returns the first match (browser DOM convention,
 * matching Playwright); `goto` follows redirects per the underlying
 * backend; allowlist matching is by exact origin
 * (scheme + host + port). Subdomain wildcards are intentionally a
 * follow-up; the design does not specify them and the smallest cut is
 * the strictest match.
 */

import harden from '@endo/harden';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeError, q, X } from '@endo/errors';

/** @import { Passable } from '@endo/pass-style' */

/**
 * @typedef {object} BackendPage
 * Backend-shaped per-page handle. The Browser exo wraps each
 * BackendPage in a Page exo that mediates allowlist, read-only, and
 * revocation; the BackendPage itself is unconfined and is never
 * exposed to the guest.
 *
 * @property {() => string} url - The current page URL after navigation
 *   (after redirects, if any).
 * @property {() => Promise<string>} title
 * @property {(selector: string) => Promise<string>} textContent
 *   First match's textContent, the empty string if the selector
 *   matches an empty element, or rejects if the selector matches
 *   nothing. Backends should match Playwright's behavior.
 * @property {(selector: string, value: string) => Promise<void>} fill
 * @property {(selector: string) => Promise<void>} click
 * @property {(selector: string) => Promise<void>} submit
 * @property {() => Promise<string>} snapshot - Backend-defined; e.g.,
 *   visible text, an HTML serialization, or a base64 screenshot.
 * @property {(selector: string) => Promise<void>} waitForSelector
 * @property {() => Promise<void>} close
 */

/**
 * @typedef {object} Backend
 * The transport seam. A real implementation drives Playwright; the test
 * fake responds in-memory. The Backend never sees the allowlist; it is
 * the Browser exo's job to filter URLs before calling `newPage`.
 *
 * @property {(url: string) => Promise<BackendPage>} newPage - Open a
 *   page navigated to the given URL. The Browser exo only calls this
 *   after the URL has cleared the origin allowlist.
 * @property {() => Promise<void>} close - Tear down the underlying
 *   browser process (if any). Called on revocation and at most once.
 */

/**
 * Parse the origin (scheme + host + port) of a URL string. Throws if the
 * input is not a valid absolute URL.
 *
 * @param {string} urlString
 * @returns {string}
 */
const originOf = urlString => {
  if (typeof urlString !== 'string') {
    throw makeError(X`URL must be a string, got ${q(urlString)}`);
  }
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch (err) {
    throw makeError(
      X`Invalid URL ${q(urlString)}: ${q(/** @type {Error} */ (err).message)}`,
    );
  }
  return parsed.origin;
};

/**
 * Validate and freeze a list of allowed-origin strings. Each entry must
 * be the origin component of a valid URL (`https://example.com:8443`,
 * not `https://example.com/path`). A path or query in an origin entry
 * is rejected up front so a stray `/foo` does not silently broaden the
 * allowlist.
 *
 * @param {ReadonlyArray<string>} origins
 * @returns {ReadonlyArray<string>}
 */
const validateOrigins = origins => {
  if (!Array.isArray(origins)) {
    throw makeError(X`Allowed origins must be an array, got ${q(origins)}`);
  }
  const validated = origins.map(origin => {
    if (typeof origin !== 'string') {
      throw makeError(X`Allowed origin must be a string, got ${q(origin)}`);
    }
    let parsed;
    try {
      parsed = new URL(origin);
    } catch (err) {
      throw makeError(
        X`Invalid allowed origin ${q(origin)}: ${q(
          /** @type {Error} */ (err).message,
        )}`,
      );
    }
    if (parsed.origin !== origin) {
      throw makeError(
        X`Allowed origin ${q(origin)} must be exactly the origin (no path, query, or fragment); expected ${q(parsed.origin)}`,
      );
    }
    return origin;
  });
  return harden(validated);
};

const BrowserInterface = M.interface('Browser', {
  goto: M.callWhen(M.string()).returns(M.remotable()),
  help: M.call().returns(M.string()),
});

const PageInterface = M.interface('Page', {
  url: M.call().returns(M.string()),
  title: M.callWhen().returns(M.string()),
  textContent: M.callWhen(M.string()).returns(M.string()),
  fill: M.callWhen(M.string(), M.string()).returns(),
  click: M.callWhen(M.string()).returns(),
  submit: M.callWhen(M.string()).returns(),
  snapshot: M.callWhen().returns(M.string()),
  waitForSelector: M.callWhen(M.string()).returns(),
  close: M.callWhen().returns(),
  help: M.call().returns(M.string()),
});

const BrowserControlInterface = M.interface('BrowserControl', {
  setAllowedOrigins: M.call(M.arrayOf(M.string())).returns(),
  setReadOnly: M.call(M.boolean()).returns(),
  isReadOnly: M.call().returns(M.boolean()),
  getAllowedOrigins: M.call().returns(M.arrayOf(M.string())),
  revoke: M.callWhen().returns(),
  isRevoked: M.call().returns(M.boolean()),
  help: M.call().returns(M.string()),
});

const browserHelp = `\
Browser - A confined web browser bounded to a host-configured set of allowed origins.

goto(url) navigates to a URL; the URL's origin must appear in the allowlist or
the call rejects. Returns a Page handle for further interaction.`;

const pageHelp = `\
Page - A handle on a single page within a Browser.

Read methods (url, title, textContent, snapshot, waitForSelector) work in any
mode. Mutation methods (fill, click, submit) are disabled when the host puts
the parent Browser in read-only mode.`;

const browserControlHelp = `\
BrowserControl - The host-side companion to a Browser. Lets the host change the
allowed-origin list, toggle read-only mode, and revoke the browser.`;

/**
 * Create a paired (Browser, BrowserControl) capability.
 *
 * @param {object} args
 * @param {Backend} args.backend - The transport seam. The factory takes
 *   ownership of the backend and closes it on revocation.
 * @param {ReadonlyArray<string>} [args.allowedOrigins] - Initial allowlist.
 *   Defaults to empty (denies everything until the host calls
 *   `BrowserControl.setAllowedOrigins`).
 * @param {boolean} [args.readOnly] - Initial read-only flag. Defaults to
 *   false.
 * @returns {{ browser: any, control: any }}
 */
export const makeBrowserAndControl = ({
  backend,
  allowedOrigins = [],
  readOnly = false,
}) => {
  if (backend === undefined || backend === null) {
    throw makeError(X`backend is required`);
  }

  /** @type {ReadonlyArray<string>} */
  let allowed = validateOrigins(allowedOrigins);
  let isReadOnly = readOnly === true;
  let revoked = false;

  /** @type {Set<{ close: () => Promise<void> }>} */
  const livePages = new Set();

  const assertNotRevoked = () => {
    if (revoked) {
      throw makeError(X`Browser has been revoked`);
    }
  };

  /**
   * @param {string} url
   */
  const assertOriginAllowed = url => {
    const origin = originOf(url);
    if (!allowed.includes(origin)) {
      throw makeError(X`Origin ${q(origin)} is not in the allowed-origin list`);
    }
  };

  const assertWritable = () => {
    if (isReadOnly) {
      throw makeError(X`Browser is in read-only mode`);
    }
  };

  /**
   * Wrap a backend page handle in a Page exo. The exo enforces revocation
   * and read-only at every method boundary.
   *
   * @param {BackendPage} backendPage
   */
  const makePage = backendPage => {
    let pageClosed = false;
    const assertPageOpen = () => {
      assertNotRevoked();
      if (pageClosed) {
        throw makeError(X`Page has been closed`);
      }
    };

    const page = makeExo('Page', PageInterface, {
      url: () => {
        assertPageOpen();
        return backendPage.url();
      },
      title: async () => {
        assertPageOpen();
        return backendPage.title();
      },
      textContent: async selector => {
        assertPageOpen();
        return backendPage.textContent(selector);
      },
      fill: async (selector, value) => {
        assertPageOpen();
        assertWritable();
        await backendPage.fill(selector, value);
      },
      click: async selector => {
        assertPageOpen();
        assertWritable();
        await backendPage.click(selector);
      },
      submit: async selector => {
        assertPageOpen();
        assertWritable();
        await backendPage.submit(selector);
      },
      snapshot: async () => {
        assertPageOpen();
        return backendPage.snapshot();
      },
      waitForSelector: async selector => {
        assertPageOpen();
        await backendPage.waitForSelector(selector);
      },
      close: async () => {
        await null;
        if (pageClosed) {
          return;
        }
        pageClosed = true;
        livePages.delete(closer);
        // Best-effort close on the backend; an already-revoked browser
        // may have torn the underlying page down already.
        try {
          await backendPage.close();
        } catch (_err) {
          // Closing a page should never fail visibly to the guest.
        }
      },
      help: () => pageHelp,
    });

    /** @type {{ close: () => Promise<void> }} */
    const closer = harden({
      close: async () => {
        await null;
        if (pageClosed) {
          return;
        }
        pageClosed = true;
        try {
          await backendPage.close();
        } catch (_err) {
          // see above
        }
      },
    });
    livePages.add(closer);
    return page;
  };

  const browser = makeExo('Browser', BrowserInterface, {
    goto: async url => {
      await null;
      assertNotRevoked();
      assertOriginAllowed(url);
      const backendPage = await backend.newPage(url);
      return makePage(backendPage);
    },
    help: () => browserHelp,
  });

  const control = makeExo('BrowserControl', BrowserControlInterface, {
    setAllowedOrigins: origins => {
      assertNotRevoked();
      allowed = validateOrigins(origins);
    },
    getAllowedOrigins: () => {
      // A revoked browser can still report what its allowlist used to
      // be; the only operation the host can no longer take is to widen
      // it.
      return harden([...allowed]);
    },
    setReadOnly: flag => {
      assertNotRevoked();
      isReadOnly = flag === true;
    },
    isReadOnly: () => isReadOnly,
    revoke: async () => {
      await null;
      if (revoked) {
        return;
      }
      revoked = true;
      // Close every outstanding page first, then the backend itself.
      // Errors from a single page must not prevent the rest from
      // closing or the backend from being torn down. Page closes run
      // in parallel; their order does not matter and a slow close on
      // one page should not block the others.
      const closures = [...livePages];
      livePages.clear();
      await Promise.allSettled(closures.map(closer => closer.close()));
      try {
        await backend.close();
      } catch (_err) {
        // best-effort
      }
    },
    isRevoked: () => revoked,
    help: () => browserControlHelp,
  });

  return harden({ browser, control });
};
harden(makeBrowserAndControl);
