import '../install-ses.js';
import test from 'ava';

test('globals are present', t => {
  t.is(typeof Compartment, 'function');
  t.is(typeof harden, 'function');
});
