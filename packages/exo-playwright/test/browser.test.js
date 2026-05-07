// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { E } from '@endo/far';

import { makeBrowserAndControl } from '../src/browser.js';

/**
 * @typedef {import('../src/browser.js').Backend} Backend
 * @typedef {import('../src/browser.js').BackendPage} BackendPage
 */

/**
 * Build an in-memory fake backend. Tracks every page opened and closed so
 * tests can assert that revocation tears down outstanding pages.
 *
 * @param {object} [options]
 * @param {Map<string, { title?: string, text?: Record<string, string> }>} [options.pages]
 *   Optional map keyed by URL with stub responses. URLs not present
 *   resolve to a default empty page.
 * @returns {{
 *   backend: Backend,
 *   opened: string[],
 *   closedPages: number,
 *   closedBackend: () => boolean,
 *   filledFields: Array<{ url: string, selector: string, value: string }>,
 *   submitted: Array<{ url: string, selector: string }>,
 * }}
 */
const makeFakeBackend = ({ pages = new Map() } = {}) => {
  /** @type {string[]} */
  const opened = [];
  /** @type {Array<{ url: string, selector: string, value: string }>} */
  const filledFields = [];
  /** @type {Array<{ url: string, selector: string }>} */
  const submitted = [];
  let closedPages = 0;
  let backendClosed = false;

  /**
   * @param {string} url
   * @returns {Promise<BackendPage>}
   */
  const newPage = async url => {
    if (backendClosed) {
      throw new Error('backend closed');
    }
    opened.push(url);
    const stub = pages.get(url) || {};
    const page = {
      url: () => url,
      title: async () => stub.title || 'untitled',
      textContent: async (/** @type {string} */ selector) => {
        const text = stub.text && stub.text[selector];
        if (text === undefined) {
          throw new Error(`selector ${selector} not found`);
        }
        return text;
      },
      fill: async (
        /** @type {string} */ selector,
        /** @type {string} */ value,
      ) => {
        filledFields.push({ url, selector, value });
      },
      click: async (/** @type {string} */ _selector) => {},
      submit: async (/** @type {string} */ selector) => {
        submitted.push({ url, selector });
      },
      snapshot: async () => `snapshot of ${url}`,
      waitForSelector: async (/** @type {string} */ _selector) => {},
      close: async () => {
        closedPages += 1;
      },
    };
    return page;
  };

  const backend = {
    newPage,
    close: async () => {
      backendClosed = true;
    },
  };

  // Returned object is intentionally not hardened so the test can still
  // observe mutation via opened/filledFields/submitted from inside backend
  // methods. The backend object itself is hardened by makeBrowserAndControl
  // when stored.
  return {
    backend,
    opened,
    get closedPages() {
      return closedPages;
    },
    closedBackend: () => backendClosed,
    filledFields,
    submitted,
  };
};

const ALLOWED_ORIGIN = 'https://airline.example.com';
const DENIED_ORIGIN = 'https://evil.example.com';
const ALLOWED_URL = `${ALLOWED_ORIGIN}/checkin`;
const DENIED_URL = `${DENIED_ORIGIN}/exfil`;

test('goto rejects URLs whose origin is not allowed', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
  });
  await t.throwsAsync(() => E(browser).goto(DENIED_URL), {
    message: /not in the allowed-origin list/,
  });
  // The backend was never asked to navigate.
  t.deepEqual(fake.opened, []);
});

test('goto opens a page when the origin is allowed', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
  });
  const page = await E(browser).goto(ALLOWED_URL);
  t.is(await E(page).url(), ALLOWED_URL);
  t.deepEqual(fake.opened, [ALLOWED_URL]);
});

test('the empty allowlist denies every URL', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({ backend: fake.backend });
  await t.throwsAsync(() => E(browser).goto(ALLOWED_URL), {
    message: /not in the allowed-origin list/,
  });
});

test('setAllowedOrigins replaces, not appends', async t => {
  const fake = makeFakeBackend();
  const { browser, control } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
  });
  // Replace the original allowlist with a different origin.
  await E(control).setAllowedOrigins(['https://other.example.com']);
  await t.throwsAsync(() => E(browser).goto(ALLOWED_URL), {
    message: /not in the allowed-origin list/,
  });
  await E(browser).goto('https://other.example.com/');
  t.deepEqual(fake.opened, ['https://other.example.com/']);
});

test('an allowlist entry must be exactly an origin (no path)', async t => {
  const fake = makeFakeBackend();
  t.throws(
    () =>
      makeBrowserAndControl({
        backend: fake.backend,
        allowedOrigins: ['https://example.com/path'],
      }),
    { message: /must be exactly the origin/ },
  );
});

test('readOnly disables fill, click, and submit but not navigation', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
    readOnly: true,
  });
  const page = await E(browser).goto(ALLOWED_URL);
  // Reads still work.
  t.is(await E(page).snapshot(), `snapshot of ${ALLOWED_URL}`);
  // Mutations are denied.
  await t.throwsAsync(() => E(page).fill('#name', 'Jane'), {
    message: /read-only/,
  });
  await t.throwsAsync(() => E(page).click('#button'), {
    message: /read-only/,
  });
  await t.throwsAsync(() => E(page).submit('#form'), {
    message: /read-only/,
  });
  t.deepEqual(fake.filledFields, []);
  t.deepEqual(fake.submitted, []);
});

test('toggling readOnly off re-enables mutation', async t => {
  const fake = makeFakeBackend();
  const { browser, control } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
    readOnly: true,
  });
  const page = await E(browser).goto(ALLOWED_URL);
  await E(control).setReadOnly(false);
  await E(page).fill('#name', 'Jane');
  t.deepEqual(fake.filledFields, [
    { url: ALLOWED_URL, selector: '#name', value: 'Jane' },
  ]);
});

test('readOnly applies retroactively to already-open pages', async t => {
  const fake = makeFakeBackend();
  const { browser, control } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
  });
  const page = await E(browser).goto(ALLOWED_URL);
  // Open page first, then put the browser in read-only mode.
  await E(control).setReadOnly(true);
  await t.throwsAsync(() => E(page).fill('#name', 'Jane'), {
    message: /read-only/,
  });
});

test('revoke closes outstanding pages and the backend', async t => {
  const fake = makeFakeBackend();
  const { browser, control } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
  });
  const page = await E(browser).goto(ALLOWED_URL);
  await E(control).revoke();
  t.true(await E(control).isRevoked());
  t.is(fake.closedPages, 1);
  t.true(fake.closedBackend());
  // Subsequent goto fails.
  await t.throwsAsync(() => E(browser).goto(ALLOWED_URL), {
    message: /revoked/,
  });
  // Subsequent page operations fail.
  await t.throwsAsync(() => E(page).snapshot(), { message: /revoked/ });
});

test('revoke is idempotent', async t => {
  const fake = makeFakeBackend();
  const { control } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
  });
  await E(control).revoke();
  await E(control).revoke();
  t.true(fake.closedBackend());
});

test('explicit page.close removes the page from the live set', async t => {
  const fake = makeFakeBackend();
  const { browser, control } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
  });
  const page = await E(browser).goto(ALLOWED_URL);
  await E(page).close();
  t.is(fake.closedPages, 1);
  // After explicit close, revoke must not double-close the page.
  await E(control).revoke();
  t.is(fake.closedPages, 1);
});

test('a closed page rejects subsequent operations', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
  });
  const page = await E(browser).goto(ALLOWED_URL);
  await E(page).close();
  await t.throwsAsync(() => E(page).snapshot(), { message: /closed/ });
});

test('goto rejects malformed URLs', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
  });
  await t.throwsAsync(() => E(browser).goto('not a url'), {
    message: /Invalid URL/,
  });
});

test('isReadOnly and getAllowedOrigins reflect host-side state', async t => {
  const fake = makeFakeBackend();
  const { control } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
    readOnly: false,
  });
  await null;
  t.is(await E(control).isReadOnly(), false);
  t.deepEqual(await E(control).getAllowedOrigins(), [ALLOWED_ORIGIN]);
  await E(control).setReadOnly(true);
  await E(control).setAllowedOrigins([ALLOWED_ORIGIN, 'https://b.example.com']);
  t.is(await E(control).isReadOnly(), true);
  t.deepEqual(await E(control).getAllowedOrigins(), [
    ALLOWED_ORIGIN,
    'https://b.example.com',
  ]);
});

test('different ports are different origins', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    // Allow port 443 (default for https) only.
    allowedOrigins: ['https://api.example.com'],
  });
  await t.throwsAsync(() => E(browser).goto('https://api.example.com:8443/'), {
    message: /not in the allowed-origin list/,
  });
  await E(browser).goto('https://api.example.com/');
  t.deepEqual(fake.opened, ['https://api.example.com/']);
});

test('http and https on the same host are different origins', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: ['https://example.com'],
  });
  await t.throwsAsync(() => E(browser).goto('http://example.com/'), {
    message: /not in the allowed-origin list/,
  });
});

test('subdomains are not implicitly allowed', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: ['https://example.com'],
  });
  // example.com does NOT cover sub.example.com; this is intentional.
  await t.throwsAsync(() => E(browser).goto('https://sub.example.com/'), {
    message: /not in the allowed-origin list/,
  });
});

test('fill, click, submit forward to the backend page', async t => {
  const fake = makeFakeBackend();
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
  });
  const page = await E(browser).goto(ALLOWED_URL);
  await E(page).fill('#name', 'Jane');
  await E(page).click('#submit');
  await E(page).submit('#form');
  t.deepEqual(fake.filledFields, [
    { url: ALLOWED_URL, selector: '#name', value: 'Jane' },
  ]);
  t.deepEqual(fake.submitted, [{ url: ALLOWED_URL, selector: '#form' }]);
});

test('textContent is forwarded and rejects the missing-selector case', async t => {
  const pages = new Map();
  pages.set(ALLOWED_URL, { text: { '#name': 'Jane' } });
  const fake = makeFakeBackend({ pages });
  const { browser } = makeBrowserAndControl({
    backend: fake.backend,
    allowedOrigins: [ALLOWED_ORIGIN],
  });
  const page = await E(browser).goto(ALLOWED_URL);
  t.is(await E(page).textContent('#name'), 'Jane');
  await t.throwsAsync(() => E(page).textContent('#missing'), {
    message: /not found/,
  });
});

test('Browser and BrowserControl announce themselves via help', async t => {
  const fake = makeFakeBackend();
  const { browser, control } = makeBrowserAndControl({
    backend: fake.backend,
  });
  await null;
  t.regex(await E(browser).help(), /Browser/);
  t.regex(await E(control).help(), /BrowserControl/);
});
