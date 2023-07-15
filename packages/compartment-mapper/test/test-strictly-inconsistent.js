import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';

scaffold(
  'inconsistently strictly required between directories',
  test,
  new URL('fixtures-strictly-inconsistent-directories/main.js', import.meta.url)
    .href,
  t => {
    t.pass();
  },
  1,
);

scaffold(
  'inconsistently strictly required between packages',
  test,
  new URL('fixtures-strictly-inconsistent-packages/main.js', import.meta.url)
    .href,
  t => t.pass(),
  1,
);
