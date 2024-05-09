import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';

scaffold(
  'fixtures-order',
  test,
  new URL('fixtures-order/index.js', import.meta.url).toString(),
  (t, { globals }) => {
    t.deepEqual(globals.log.splice(0), [
      'On the other hand,',
      'are other fingers.',
    ]);
  },
  1,
  {
    addGlobals: {
      log: [],
    },
  },
);
