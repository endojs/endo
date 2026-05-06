// @ts-check

/**
 * Saboteur tests for the Browser exo. Each test attacks a specific
 * invariant the module claims and asserts the failure mode the module
 * names. A test that passes here is shipped as defensive coverage; a
 * test that surfaces a real bug is filed separately, not silently
 * fixed inside this commit.
 *
 * Per `skills/adversarial-tests.md`: stop when the next gotcha would
 * test a property the module does not claim. The Browser claims
 * origin confinement, read-only mediation, revocation, and post-close
 * rejection; the adversarial set below is scoped to those four.
 */

import test from '@endo/ses-ava/prepare-endo.js';
import { E } from '@endo/far';

import { makeBrowserAndControl } from '../src/browser.js';

/**
 * Minimal fake backend just for these adversarial tests. Tracks open
 * count and lets the test inject behavior into newPage / close.
 *
 * @param {object} [options]
 * @param {() => Promise<void>} [options.onClose] - Run on backend close.
 * @param {(url: string) => Promise<any>} [options.newPage] - Override
 *   page creation.
 */
const makeFakeBackend = ({ onClose, newPage } = {}) => {
  const opened = [];
  const defaultNewPage = async url => {
    opened.push(url);
    let pageClosed = false;
    return {
      url: () => url,
      title: async () => 'fake',
      textContent: async (/** @type {string} */ _selector) => 'fake',
      fill: async (
        /** @type {string} */ _selector,
        /** @type {string} */ _value,
      ) => {},
      click: async (/** @type {string} */ _selector) => {},
      submit: async (/** @type {string} */ _selector) => {},
      snapshot: async () => `snapshot of ${url}`,
      waitForSelector: async (/** @type {string} */ _selector) => {},
      close: async () => {
        if (pageClosed) {
          throw new Error('double-close on backend page');
        }
        pageClosed = true;
      },
    };
  };
  return {
    backend: {
      newPage: newPage || defaultNewPage,
      close: onClose || (async () => {}),
    },
    opened,
  };
};

const ALLOWED = 'https://airline.example.com';
const ALLOWED_URL = `${ALLOWED}/`;

test('SABOTEUR: protocol-relative URL is treated as a relative URL and rejected', async t => {
  // A guest passes a protocol-relative URL "//evil.example.com/foo".
  // The WHATWG URL constructor without a base rejects this. We expect
  // the goto to fail with the malformed-URL error, not with a
  // silently-mis-parsed origin.
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED],
  });
  await t.throwsAsync(() => E(browser).goto('//evil.example.com/'), {
    message: /Invalid URL/,
  });
  t.deepEqual(fake.opened, []);
});

test('SABOTEUR: empty-string URL is rejected, not treated as ALLOWED', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED],
  });
  await t.throwsAsync(() => E(browser).goto(''), {
    message: /Invalid URL/,
  });
});

test('SABOTEUR: an origin entry with trailing slash is rejected up front', async t => {
  // `https://example.com` is the origin; `https://example.com/` has a
  // path component and must be rejected so a guest cannot construct a
  // URL whose origin happens to be `https://example.com` without
  // trailing slash and bypass intent.
  const fake = makeFakeBackend();
  t.throws(
    () =>
      makeBrowserAndControl({
        backend: fake.backend,
        allowedOrigins: ['https://example.com/'],
      }),
    { message: /must be exactly the origin/ },
  );
});

test('SABOTEUR: data:-URL goto is rejected when data: not in allowlist', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED],
  });
  // `new URL('data:text/html,<script>...').origin` is the literal
  // string 'null' for opaque-origin schemes. The allowlist does not
  // include 'null', so the goto must reject. This is the structural
  // safety property under attack from a passive payload.
  await t.throwsAsync(
    () =>
      E(browser).goto('data:text/html,<script>fetch("https://evil/")</script>'),
    { message: /not in the allowed-origin list/ },
  );
});

test('SABOTEUR: javascript:-URL goto is rejected', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED],
  });
  // Constructed at runtime so the literal does not trip no-script-url.
  const jsUrl = `${'java'}${'script'}:fetch("https://evil/")`;
  await t.throwsAsync(() => E(browser).goto(jsUrl), {
    message: /not in the allowed-origin list/,
  });
});

test('SABOTEUR: file:-URL goto is rejected', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED],
  });
  await t.throwsAsync(() => E(browser).goto('file:///etc/passwd'), {
    message: /not in the allowed-origin list/,
  });
});

test('SABOTEUR: URL with userinfo is normalized then origin-checked', async t => {
  // `https://attacker@airline.example.com/` parses with origin
  // `https://airline.example.com`. The allowlist contains exactly that
  // origin, so the navigation IS allowed. The point of this test: the
  // URL parser strips userinfo before computing origin, so the
  // allowlist check is on the post-normalization origin, which is what
  // the host operator expects.
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED],
  });
  const page = await E(browser).goto(`https://attacker@airline.example.com/`);
  t.is(await E(page).url(), `https://attacker@airline.example.com/`);
  // backend received the userinfo-bearing URL unchanged; that is the
  // backend's problem, not the allowlist's.
});

test('SABOTEUR: setAllowedOrigins after revoke is rejected', async t => {
  // The host should not be able to widen the allowlist of a revoked
  // browser. Verify that the assertion fires.
  const fake = makeFakeBackend();
  const { control } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED],
  });
  await E(control).revoke();
  await t.throwsAsync(
    () => E(control).setAllowedOrigins(['https://evil.example.com']),
    { message: /revoked/ },
  );
});

test('SABOTEUR: setReadOnly after revoke is rejected', async t => {
  const fake = makeFakeBackend();
  const { control } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED],
  });
  await E(control).revoke();
  await t.throwsAsync(() => E(control).setReadOnly(false), {
    message: /revoked/,
  });
});

test('SABOTEUR: revoke survives a backend.close that throws', async t => {
  // Backend.close() throwing must not prevent the browser from
  // becoming revoked or the BrowserControl from reporting that.
  const fake = makeFakeBackend({
    onClose: async () => {
      throw new Error('backend close failed');
    },
  });
  const { control } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED],
  });
  // The revoke promise itself must resolve; the backend error is swallowed.
  await E(control).revoke();
  t.true(await E(control).isRevoked());
});

test('SABOTEUR: revoke survives a backendPage.close that throws', async t => {
  // A page whose backend close throws must not block revocation of
  // the browser or close of the other pages.
  let throwOnNextClose = true;
  const fake = makeFakeBackend({
    newPage: async url => {
      let pageClosed = false;
      return {
        url: () => url,
        title: async () => 'fake',
        textContent: async () => 'fake',
        fill: async () => {},
        click: async () => {},
        submit: async () => {},
        snapshot: async () => `snapshot of ${url}`,
        waitForSelector: async () => {},
        close: async () => {
          if (pageClosed) return;
          pageClosed = true;
          if (throwOnNextClose) {
            throwOnNextClose = false;
            throw new Error('first page close throws');
          }
        },
      };
    },
  });
  const { browser, control } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED],
  });
  await E(browser).goto(ALLOWED_URL);
  await E(browser).goto(ALLOWED_URL);
  await E(control).revoke();
  t.true(await E(control).isRevoked());
});

test('SABOTEUR: read-only is enforced even on a brand-new page opened in read-only mode', async t => {
  // The flag is per-browser, not per-page. A page opened AFTER
  // setReadOnly(true) must inherit the restriction.
  const fake = makeFakeBackend();
  const { browser, control } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED],
  });
  await E(control).setReadOnly(true);
  const page = await E(browser).goto(ALLOWED_URL);
  await t.throwsAsync(() => E(page).fill('#name', 'Jane'), {
    message: /read-only/,
  });
});

test('SABOTEUR: idempotent close on a single page does not reach the backend twice', async t => {
  // Backends should be tolerant of double-close, but the exo's
  // pageClosed flag should usually short-circuit the second call. Verify.
  let backendCloseCount = 0;
  const fake = makeFakeBackend({
    newPage: async url => {
      let pageClosed = false;
      return {
        url: () => url,
        title: async () => 'fake',
        textContent: async () => 'fake',
        fill: async () => {},
        click: async () => {},
        submit: async () => {},
        snapshot: async () => `snapshot of ${url}`,
        waitForSelector: async () => {},
        close: async () => {
          backendCloseCount += 1;
          if (pageClosed) return;
          pageClosed = true;
        },
      };
    },
  });
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED],
  });
  const page = await E(browser).goto(ALLOWED_URL);
  await E(page).close();
  await E(page).close();
  // Sequential second close must short-circuit on pageClosed before
  // the backend is invoked.
  t.is(backendCloseCount, 1);
});

test('SABOTEUR: a non-array allowedOrigins is rejected at construction', async t => {
  const fake = makeFakeBackend();
  t.throws(
    () =>
      makeBrowserAndControl({
        backend: fake.backend,
        // @ts-expect-error - intentionally wrong type
        allowedOrigins: 'https://example.com',
      }),
    { message: /must be an array/ },
  );
});

test('SABOTEUR: a non-string entry in allowedOrigins is rejected', async t => {
  const fake = makeFakeBackend();
  t.throws(
    () =>
      makeBrowserAndControl({
        backend: fake.backend,
        // @ts-expect-error - intentionally wrong type
        allowedOrigins: [123],
      }),
    { message: /must be a string/ },
  );
});

test('SABOTEUR: a missing backend is rejected at construction', async t => {
  t.throws(
    () =>
      // @ts-expect-error - intentionally missing
      makeBrowserAndControl({ allowedOrigins: [ALLOWED] }),
    { message: /backend is required/ },
  );
});
