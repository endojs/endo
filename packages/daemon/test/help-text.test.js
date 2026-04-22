import test from '@endo/ses-ava/prepare-endo.js';

import { makeHelp } from '../src/help-text.js';

test('makeHelp returns overview for empty method name', t => {
  const help = makeHelp({ '': 'Overview text' });
  t.is(help(), 'Overview text');
  t.is(help(''), 'Overview text');
});

test('makeHelp returns method documentation', t => {
  const help = makeHelp({ list: 'Lists items' });
  t.is(help('list'), 'Lists items');
});

test('makeHelp falls back to fallback help texts', t => {
  const primary = { list: 'Primary list' };
  const fallback = { remove: 'Fallback remove' };
  const help = makeHelp(primary, [fallback]);
  t.is(help('remove'), 'Fallback remove');
});

test('makeHelp returns default message for unknown method', t => {
  const help = makeHelp({});
  t.is(help('unknown'), 'No documentation available for method "unknown".');
});

test('makeHelp returns default message for missing overview', t => {
  const help = makeHelp({});
  t.is(help(), 'No documentation available for this interface.');
});
