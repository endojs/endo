import test from 'tape';
import '../lockdown.js';
import { getOwnPropertyDescriptor } from '../src/commons.js';

const originalValueSymbol = Symbol.for('originalValue');

test('check if override-protected primordials are frozen', t => {
  lockdown();

  // After removing the detachedProperties mechanism and before adding
  // the originalValueSymbol mechanism, this test failed.
  t.ok(Object.isFrozen(Object.prototype.toString));

  // Just checking that reconstruction produces the *same* symbol
  t.equals(originalValueSymbol, Symbol.for('originalValue'));

  const desc = getOwnPropertyDescriptor(Object.prototype, 'toString');
  t.equals(desc.get[originalValueSymbol], Object.prototype.toString);

  t.end();
});
