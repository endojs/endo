# Chat Playwright Build-and-Load Smoke

| | |
|---|---|
| **Created** | 2026-05-06 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The repository has a `Browser Tests` GitHub Actions workflow
(`.github/workflows/browser-test.yml`, job `browser-tests`) that
already provisions Playwright and exercises the SES UMD bundle in a
real browser via `browser-test/tests/canary.spec.js`.
The Chat application (`packages/chat`) is a substantial Vite-built
React/SES application whose bundle is not exercised by that job today.

A regression in the Chat entry point (a stray top-level import that
fails under SES, a Vite plugin misconfiguration, a dependency upgrade
that breaks the bundle, a CSS import that 404s, a runtime error before
the WebSocket connection is attempted) currently lands silently.
The first signal is a contributor running `yarn dev` locally and
seeing a blank page or a `pageerror` in the devtools console.

The sibling design `chat-test-coverage.md` (Complete) describes the
unit, component, and Playwright e2e tests that already live inside
`packages/chat/test/`.
Those tests exercise UI behaviors against `yarn dev` (Vite dev server)
and require a daemon-shaped powers fixture.
They are valuable but they do not currently run in CI, and they do
not catch the narrower class of regression this design targets:
"the production bundle builds, parses, lockdown runs, and the entry
script reaches its first user-visible state without throwing".

This design proposes a single Playwright smoke that proves the
Chat production bundle builds and loads, run as an additional step
in the existing `browser-tests` job.
It is deliberately scoped narrower than the Chat e2e suite so it can
run without a daemon, without `yarn dev`, and without test fixtures.

## Design

### Build step

Chat already builds with Vite via `yarn build` in `packages/chat/`
(`packages/chat/package.json`, `"build": "vite build"`).
The output lands in `packages/chat/dist/`, configured in
`packages/chat/vite.config.js` (`base: './'`, `outDir: 'dist'`).
The relative `base` is what makes `dist/` directly servable as
static files from any path.

The browser-tests job already runs `yarn build` at the workspace
root (`.github/workflows/browser-test.yml`, step "Build artifacts"),
which builds every workspace including `@endo/chat`.
The new smoke can rely on the existing build step; it does not need
its own `yarn workspace @endo/chat run build` invocation.

### Serve step

The smoke needs `packages/chat/dist/index.html` and its assets
served over HTTP so the bundle module URLs resolve as a browser
expects.
Two acceptable approaches, in preference order:

1. Reuse the Playwright `webServer` config in
   `browser-test/playwright.config.js` by adding a second entry that
   serves `packages/chat/dist`.
   Playwright supports an array of `webServer` entries.
   The serve command can be `npx http-server packages/chat/dist -p
   3001 -c-1 --silent` if `http-server` is added as a dev dependency
   to `browser-test/`, or a tiny static file server in
   `browser-test/chat-server.js` mirroring `browser-test/server.js`.
2. If the first approach proves awkward (`http-server` adds a
   dependency, or the second `webServer` does not compose cleanly
   with the existing one), extend `browser-test/server.js` to serve
   `packages/chat/dist/*` from a `/chat/` URL prefix.
   This keeps the dependency surface unchanged.

Either path is acceptable.
The second is fewer dependencies and matches the existing
`browser-test/server.js` shape; it is the recommended starting point.

### Playwright fixture

A new spec at `browser-test/tests/chat.spec.js` does the following.

```js
// @ts-check
const { test, expect } = require('@playwright/test');

test('chat bundle builds and loads', async ({ page }) => {
  /** @type {string[]} */
  const pageErrors = [];
  /** @type {{ url: string, status: number }[]} */
  const failedRequests = [];

  page.on('pageerror', err => {
    pageErrors.push(err.stack || err.message);
  });
  page.on('requestfailed', req => {
    failedRequests.push({
      url: req.url(),
      status: req.response()?.status() ?? 0,
    });
  });

  await page.goto('http://127.0.0.1:3000/chat/');

  // The entry point at packages/chat/main.js renders a
  // "Gateway not configured" heading when navigated without a
  // fragment containing gateway and agent parameters.  Reaching
  // that heading proves SES lockdown succeeded, the bundle parsed,
  // and the entry script ran past its top-level imports.
  await expect(
    page.getByRole('heading', { name: /Gateway not configured/i }),
  ).toBeVisible({ timeout: 30_000 });

  expect(pageErrors, 'no uncaught page errors').toEqual([]);
  expect(failedRequests, 'no failed requests').toEqual([]);
});
```

The chosen invariant ("Gateway not configured" heading is visible
and zero uncaught errors / zero failed requests) is the strongest
assertion the smoke can make without spinning up a daemon.
It catches:

- Bundle parse failures (SES rejection of an asset, Vite output
  syntax surprises).
- Top-level import failures in `main.js` (`ses`, `@endo/eventual-send/shim.js`,
  `connection.js`, `chat.js` and their transitive imports).
- Asset path mismatches (404 on the bundle, on `index.css`, on a
  chunk).
- Lockdown-time errors that throw before the entry script can render
  any UI at all.

The fragment-less navigation is intentional.
Supplying a fake gateway and agent would force the bundle into
WebSocket connection logic which would fail without a daemon;
filtering those errors out would weaken the assertion.
The "Gateway not configured" path is the deterministic, daemon-free
state the entry point already implements
(`packages/chat/main.js`, lines 33 to 46).

### CI integration

Add a new step to the `browser-tests` job in
`.github/workflows/browser-test.yml`, between
`Install Playwright Browsers` and `Run Playwright tests`,
that ensures `packages/chat/dist/` is present
(it is, after the existing `Build artifacts` step builds the
workspace), and let the existing `Run Playwright tests` step pick up
the new spec automatically because it lives under
`browser-test/tests/`.
No new step is required if the static-file server is wired into
`browser-test/server.js`.
A new step IS required if the second approach (a separate `webServer`
entry) is taken; in that case the step is purely "ensure the second
server starts".

The smoke must run before any heavier Chat e2e test that depends on
a daemon, because if the bundle does not load there is no point
exercising deeper behavior.

## Dependencies

| Dependency | Relationship |
|---|---|
| `.github/workflows/browser-test.yml` (job `browser-tests`) | The existing CI job this design extends. |
| `browser-test/playwright.config.js` and `browser-test/server.js` | The existing Playwright + static-server infrastructure the new spec reuses. |
| `packages/chat/` | The application under test. The smoke depends on `vite build` producing `dist/index.html` and on the entry point's "Gateway not configured" fallback path. |
| `chat-test-coverage.md` (Complete) | Sibling design covering the broader unit, component, and e2e test surface inside `packages/chat/test/`. This smoke is intentionally narrower (build-and-load only); the full e2e suite is out of scope. |
| `@playwright/test` | Already a dev dependency of `browser-test/` and of `packages/chat/`. No new dependency needed. |

## Test Plan

The design's claim is that the proposed smoke catches build-and-load
regressions in the Chat bundle.
Two verification steps prove this once implemented:

1. With the smoke in place on a clean tree, the spec passes: `cd
   browser-test && npx playwright test tests/chat.spec.js`.
2. Inject a deliberate regression (rename a top-level import in
   `packages/chat/main.js` to a missing module; rebuild; rerun the
   spec) and confirm the spec fails with a `pageerror` or a missing
   heading.
   Revert the regression and confirm the spec passes again.

Out of scope for this design (left to follow-up coverage):

- Interaction tests (typing in the command bar, sending a message,
  inventory rendering).
- Tests that require a live daemon or a mocked gateway.
- Visual regression / screenshot diffs.
- Cross-browser coverage beyond the engine the existing
  `browser-tests` job already exercises.

## Open Questions

1. **Browser engine.** The existing `browser-tests` job runs
   `chrome-dev` (the `chromium-next` Playwright project) against the
   pre-installed unstable Chrome image.
   Should the Chat smoke run only against that project, or should
   it also run against the stock `chromium` / `firefox` / `webkit`
   projects defined in `browser-test/playwright.config.js`?
   The narrower scope is faster and matches the existing canary;
   the broader scope catches engine-specific bundle issues earlier.
2. **Console-error strictness.** The proposed assertion fails on any
   `pageerror`.
   Chat's entry point also writes diagnostic `console.log` /
   `console.error` lines (e.g. `[Chat] Starting application`).
   Those are not `pageerror` events, so the strict assertion is
   safe today.
   Should the assertion also fail on `console.error` calls, or is
   `pageerror` the right signal?
3. **Failed-request strictness.** Some asset 404s during a Vite
   build are benign (e.g. a missing favicon when one is not
   configured).
   The current Chat `index.html` declares an inline data-URI
   favicon, so no 404 is expected.
   If a future change adds an external asset, the strict
   `requestfailed` assertion would catch a regression but might also
   surface a benign change.
   Maintainer call: keep strict, or filter to same-origin
   requests only?
4. **Serve mechanism.** Does the maintainer prefer extending
   `browser-test/server.js` to mount `/chat/` (no new dependency,
   touches an existing file) or adding a second Playwright
   `webServer` entry that runs `npx http-server` (cleaner separation,
   one new dev dependency)?
5. **Screenshot artifact.** Should the smoke upload a screenshot of
   the loaded page to the existing `actions/upload-artifact` step
   for after-the-fact inspection?
   The existing job uploads `playwright-report/`; a screenshot
   embedded in that report is one extra `await page.screenshot(...)`.

## Prompt

> Please dispatch a designer to propose verifying that the Chat
> application builds and loads properly in Playwright. This should
> be added to the existing browser CI job.
