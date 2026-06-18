import { createElement, render } from 'preact';
import { confineComponent } from '../src/compartment.js';
import { setupScratch, teardown } from './_util/helpers.js';

/** @jsx createElement */

// This file deliberately NEVER calls `renderConfined` before its
// assertions, so the `preact/secure` module is "cold" (its option
// hooks were never armed by a `renderConfined()` call). It is a
// regression test for the dormant-fail-fast XSS found in round-6
// review:
//
//   Secure's fail-fast (which throws when a secure-reentry component
//   like a Confined renders without a SecureBoundary ancestor) lives
//   in `options._render`, installed only by secure's `install()`.
//   Previously `install()` ran ONLY from `renderConfined()`. A host
//   that wired `confineComponent` but mounted a Confined via plain
//   `render()` — never calling `renderConfined()` — got NO sanitization
//   and NO error: live `javascript:` URLs and `dangerouslySet-
//   InnerHTML` reached the DOM. The fix arms secure's hooks at
//   registration time (inside `_registerSecureReentryType` /
//   `_registerTrustedExitType`), so merely defining a Confined is
//   enough to make the gate fire.
//
// NOTE: this relies on per-file module isolation. Keep this file free
// of any `renderConfined` import/call before the assertions, and do not
// merge these cases into `confine.test.jsx` (which arms install() via
// its earlier tests and would mask the regression).
describe('preact/compartment cold-module fail-fast', () => {
  /** @type {HTMLDivElement} */
  let scratch;

  beforeEach(() => {
    scratch = setupScratch();
  });

  afterEach(() => {
    teardown(scratch);
  });

  it('Confined via plain render throws even with no prior renderConfined (cold module)', () => {
    const Confined = confineComponent(({ h }) =>
      h('a', { href: 'javascript:alert(1)' }, 'click'),
    );
    expect(() => render(createElement(Confined, null), scratch)).to.throw(
      /renderConfined/,
    );
    // Nothing leaked to the DOM.
    expect(scratch.querySelector('a')).to.equal(null);
  });

  it('a dangerouslySetInnerHTML Confined is also blocked cold (no HTML injection)', () => {
    window.__COLD_PWNED = undefined;
    const Confined = confineComponent(({ h }) =>
      h('div', {
        dangerouslySetInnerHTML: {
          __html: '<img src=x onerror="window.__COLD_PWNED=1">',
        },
      }),
    );
    expect(() => render(createElement(Confined, null), scratch)).to.throw(
      /renderConfined/,
    );
    expect(window.__COLD_PWNED).to.equal(undefined);
  });
});
