// @ts-check

// Select the lockdown taming level before `@endo/init` runs `lockdown()`.
//
// `@endo/init` (imported next in main.js) hands off to `@endo/lockdown`,
// whose `lockdown()` reads a `LOCKDOWN_OPTIONS` global (or env var) — a JSON
// options bag — to choose taming. `@endo/preact-container` requires
// `overrideTaming: 'severe'`: Preact instantiates function components by
// assigning `component.constructor = type`, which hits the SES "override
// mistake" under the default 'moderate' (and 'min') taming. 'severe' makes
// `Object.prototype` properties overridable so that assignment succeeds.
// Monaco and the rest of the bundle are verified compatible (see
// test/monaco-lockdown).
//
// IMPORTANT: this module must be the FIRST import in the app entry and have
// no imports of its own. ES module imports are hoisted and evaluated in
// source order before the importing module's body, so this assignment runs
// before `@endo/init` evaluates `lockdown()`.
globalThis.LOCKDOWN_OPTIONS = JSON.stringify({ overrideTaming: 'severe' });
