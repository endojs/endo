import test from 'ava';
import { formatMessage } from '../src/message-format.js';

test('message format', t => {
  t.is(formatMessage([], []), JSON.stringify(''));
  t.is(formatMessage(['Hello.'], []), JSON.stringify('Hello.'));
  t.is(
    formatMessage(['Hello, ', '!'], ['world']),
    JSON.stringify('Hello, @world!'),
  );
  t.is(
    formatMessage(['team@example.com'], []),
    JSON.stringify(String.raw`team\@example.com`),
  );
});
