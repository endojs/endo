import test from 'ava';
import { parseLocatedJson } from '../src/json.js';

test('parseLocatedJson parses valid JSON', t => {
  const result = parseLocatedJson('{"a":1}', 'test.json');
  t.deepEqual(result, { a: 1 });
});

test('parseLocatedJson annotates SyntaxError with location', t => {
  t.throws(() => parseLocatedJson('{invalid', 'bad-file.json'), {
    instanceOf: SyntaxError,
    message: /Cannot parse JSON from bad-file\.json/,
  });
});
