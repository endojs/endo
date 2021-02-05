import test from 'ava';
import {
  filterFileName as ff,
  shortenCallSiteString as scs,
} from '../../src/error/tame-v8-error-constructor.js';

test('filter file name unit test', t => {
  t.truthy(ff(undefined), 'Keep frames with no fileName.');
  t.falsy(
    ff(
      '/Users/markmiller/src/ongithub/agoric/SES-shim/node_modules/ava/lib/runner.js',
    ),
    'Drop frames from package dependents of the current package.',
  );
  t.falsy(ff('internal/process/task_queues.js'));
  t.falsy(
    ff(
      'file:///Users/markmiller/src/ongithub/agoric/SES-shim/packages/ses/src/error/assert.js',
    ),
    'Drop frames from the assert.js module',
  );
  t.falsy(
    ff(
      '/Users/markmiller/src/ongithub/agoric/agoric-sdk/packages/eventual-send/src/track-turns.js',
    ),
    'Drop frames from the eventual-send shim package.',
  );
  t.truthy(
    ff(
      'file:///Users/markmiller/src/ongithub/agoric/SES-shim/packages/ses/test/error/test-tame-console',
    ),
    'Keep frames like this, that passes all the censors.',
  );
});

// See https://github.com/Agoric/agoric-sdk/issues/2326
test('shorten call site string unit test', t => {
  t.is(
    scs('async Promise.all (index 3)'),
    'async Promise.all (index 3)',
    'Frames with no recognized pattern should not be shortened.',
  );
  t.is(
    scs(
      'file:///Users/markmiller/src/ongithub/agoric/SES-shim/packages/ses/test/error/test-tame-console-unfilteredError.js:41:12',
    ),
    'packages/ses/test/error/test-tame-console-unfilteredError.js:41:12',
    'If a /packages/ is found, drop the likely path prefix left of packages/',
  );
  t.is(
    scs(
      'Object.bootstrap (v1/SwingSet/test/vat-admin/terminate/bootstrap-speak-to-dead.js:40:59)',
    ),
    'Object.bootstrap (v1/SwingSet/test/vat-admin/terminate/bootstrap-speak-to-dead.js:40:59)',
    'Paths created by packagers with no clue about what to keep are not shortened.',
  );
  t.is(
    scs(
      'Object.bootstrap (v1/packages/SwingSet/test/vat-admin/terminate/bootstrap-speak-to-dead.js:40:59)',
    ),
    'Object.bootstrap (packages/SwingSet/test/vat-admin/terminate/bootstrap-speak-to-dead.js:40:59)',
    'If the packager keeps the /packages/ then drop prior to packages/',
  );
  t.is(
    scs(
      'Object.bootstrap (v1/.../SwingSet/test/vat-admin/terminate/bootstrap-speak-to-dead.js:40:59)',
    ),
    'Object.bootstrap (SwingSet/test/vat-admin/terminate/bootstrap-speak-to-dead.js:40:59)',
    'If the packager inserts /.../ then drop prefix up to an including it.',
  );
});
