/* global Compartment harden */
import './install-ses';
import test from 'tape';

test('globals are present', t => {
  t.equal(typeof Compartment, 'function');
  t.equal(typeof harden, 'function');
  t.end();
});
