import test from 'ava';

import { greeter } from './index.js';

test('the greeter greets', (t) => {
  const name = 'Huey';
  const result = greeter(name);
  t.is(result, 'Hello, Huey!');
});
