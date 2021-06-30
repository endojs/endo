import test from 'ava';
import '../index.js';

test('harden must not exist before lockdown', t => {
  t.assert(typeof harden === 'undefined');
});

test('harden must not exist before lockdown in compartments', t => {
  t.assert(new Compartment().evaluate('typeof harden') === 'undefined');
});
