// The live-model eval runs only via `yarn workspace @endo/agentry test:live`,
// never under the default `yarn test`. It is a separate ava config so that a
// host with `ENDO_LLM_*` / `LAL_*` credentials in its environment does not run
// the live eval (which reaches a real provider) as a side effect of a plain
// `yarn test` at the package or workspace root. See test/eval-live.test.js and
// src/eval/README.md.
export default {
  files: ['test/eval-live.test.js'],
  timeout: '5m',
};
