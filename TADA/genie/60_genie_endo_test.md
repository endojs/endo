# Work on @endo/genie — test the unconfined plugin

- we need to test the new unconfined plugin:
  - defined in `packages/genie/main.js`
  - with setup script in `packages/genie/setup.js`
  - similar to how @endo/lal works

## Approach

Use the `endo` cli command and a set of testing environment config:

```bash
ENDO_TEST_DIR=some.testing/scratch/dir
ENDO_STATE_PATH=$ENDO_TEST_DIR/state
ENDO_EPHEMERAL_STATE_PATH=$ENDO_TEST_DIR/run
ENDO_SOCK_PATH=$ENDO_TEST_DIR/cap.sock
ENDO_CACHE_PATH=$ENDO_TEST_DIR/cache
ENDO_ADDR=127.0.0.1:54321 # choose some test-specific high port
GENIE_HOME=$ENDO_TEST_DIR/workspace
```

### Fixture setup

- run `endo purge -f` between rounds to reset daemon state

- to start a round, after purge and `endo start` run:
  - `yarn workspace @endo/genie run setup`

- respond to genie's setup form as necessary to start its agent

### Main test

The test main then uses endo messaging commands to interact with the running agent.

## TODO

- [x] write a test automation shell script inside the @endo/genie package to automate this kind of integration testing
  - Created `packages/genie/test/integration.sh`
  - Added `test:integration` script to package.json
  - Script boots isolated daemon, runs setup.js with auto-submit,
    sends a test message, and polls for agent reply

- [x] write a follow up `TODO/62_genie_endo_use_test.md` for next steps on how to use this test script, but don't go deep yet on actually using it
  - Created `TODO/62_genie_endo_use_test.md` with next steps for
    running, validating, mocking, and CI-integrating the test
