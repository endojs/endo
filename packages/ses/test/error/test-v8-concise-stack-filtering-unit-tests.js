import test from 'ava';
import {
  filterFileName as ff,
  shortenCallSiteString as scs,
} from '../../src/error/tame-v8-error-constructor.js';

test('filter file name unit test', t => {
  t.truthy(ff(undefined));
  t.falsy(
    ff(
      '/Users/markmiller/src/ongithub/agoric/SES-shim/node_modules/ava/lib/runner.js',
    ),
  );
  t.falsy(ff('internal/process/task_queues.js'));
  t.falsy(
    ff(
      'file:///Users/markmiller/src/ongithub/agoric/SES-shim/packages/ses/src/error/assert.js',
    ),
  );
  t.falsy(
    ff(
      '/Users/markmiller/src/ongithub/agoric/agoric-sdk/packages/eventual-send/src/track-turns.js',
    ),
  );
  t.truthy(
    ff(
      'file:///Users/markmiller/src/ongithub/agoric/SES-shim/packages/ses/test/error/test-tame-console',
    ),
  );
});

// See https://github.com/Agoric/agoric-sdk/issues/2326
test('shorten call site string unit test', t => {
  t.is(scs('async Promise.all (index 3)'), 'async Promise.all (index 3)');
  t.is(
    scs(
      'file:///Users/markmiller/src/ongithub/agoric/SES-shim/packages/ses/test/error/test-tame-console-unfilteredError.js:41:12',
    ),
    'packages/ses/test/error/test-tame-console-unfilteredError.js:41:12',
  );
  t.is(
    scs(
      'Object.bootstrap (v1/SwingSet/test/vat-admin/terminate/bootstrap-speak-to-dead.js:40:59)',
    ),
    'Object.bootstrap (v1/SwingSet/test/vat-admin/terminate/bootstrap-speak-to-dead.js:40:59)',
  );
  t.is(
    scs(
      'Object.bootstrap (v1/packages/SwingSet/test/vat-admin/terminate/bootstrap-speak-to-dead.js:40:59)',
    ),
    'Object.bootstrap (packages/SwingSet/test/vat-admin/terminate/bootstrap-speak-to-dead.js:40:59)',
  );
  t.is(
    scs(
      'Object.bootstrap (v1/.../SwingSet/test/vat-admin/terminate/bootstrap-speak-to-dead.js:40:59)',
    ),
    'Object.bootstrap (SwingSet/test/vat-admin/terminate/bootstrap-speak-to-dead.js:40:59)',
  );
});
