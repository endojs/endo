import test from 'ava';
import { basename } from '../src/node-modules.js';

test('basename', t => {
  t.is(basename('https://example.com/directory/file'), 'file');
  t.is(basename('https://example.com/directory/'), 'directory');
  t.is(basename('https://example.com/file'), 'file');
  t.is(basename('https://example.com/'), '');
});
