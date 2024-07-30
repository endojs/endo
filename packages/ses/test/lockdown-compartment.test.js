import test from 'ava';
import '../index.js';

test('lockdown returns or throws', t => {
  t.plan(3);

  // Compartment constructor does not throw before lockdown.
  (() => {
    const c = new Compartment();
    const functionConstructor = c.evaluate('Function.prototype.constructor');
    t.is(
      functionConstructor,
      Function,
      'before lockdown, compartments have the same privileged Function.prototype.constructor as the start compartment',
    );
  })();

  lockdown();

  // Compartment constructor does not throw after lockdown.
  (() => {
    const c = new Compartment();
    const cf = c.evaluate('Function.prototype.constructor');
    t.not(
      cf,
      Function,
      'after lockdown, Function.prototype.constructor must be tamed inside compartments',
    );

    const d = new Compartment();
    const df = d.evaluate('Function.prototype.constructor');
    t.is(
      cf,
      df,
      'after lockdown, every compartment must have the same tamed Function.prototype.constructor',
    );
  })();
});
