import 'ses';

import test from 'ava';
import { scaffold } from './scaffold.js';

const fixture = new URL(
  'fixtures-dynamic-import-esm/node_modules/app/index.js',
  import.meta.url,
).toString();

scaffold(
  'fixtures-dynamic-import-esm',
  test,
  fixture,
  async (t, { namespace }) => {
    // @ts-expect-error - untyped
    const foo = await namespace.getFoo();
    t.is(foo, 'foo');
  },
  1,
  {
    knownArchiveFailure: true,
  },
);
