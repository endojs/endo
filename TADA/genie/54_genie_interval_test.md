# Work on @endo/genie — interval tests

Rework `packages/genie/test/interval.test.js`, the tests for `packages/genie/src/interval/`.

1. [x] use `ava` instead of rolling our own raw unit test
  - I've already installed the dev dependency in genie's package.json, including a file glob for `test/**/*.test.*`

2. [x] tests should look like:
  ```javascript
  import test from 'ava';

  test('test a thing', t => {
    // TODO test the thing
    t.pass(); // ... and remove this example "pass call"
  });
  ```

3. [x] you may even decide to break the test up into topic sections like `packages/genie/test/interval/topic.test.js`
  - Split into 4 topic files:
    - `test/interval/scheduler.test.js` — creation, facets, validation, cancel, setPeriod, listing, help (11 tests)
    - `test/interval/ticking.test.js` — tick firing, fields, resolve, reschedule, timeout, idempotency (6 tests)
    - `test/interval/control.test.js` — pause/resume, revoke, setMaxActive, setMinPeriodMs (6 tests)
    - `test/interval/persistence.test.js` — disk persistence and recovery (2 tests)
  - All 25 tests passing
  - Updated package.json scripts to use `ava` runner
  - Removed old monolithic `test/interval.test.js`
