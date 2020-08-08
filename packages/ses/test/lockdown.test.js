/* global Compartment, lockdown */
import test from 'tape';
import '../ses.js';

test('lockdown returns boolean or throws in SES', t => {
  // Compartment constructor does not throw before lockdown.
  (() => {
    const c = new Compartment({}, {}, {});
    const functionConstructor = c.evaluate('Function.prototype.constructor');
    t.equal(
      functionConstructor,
      Function,
      'before lockdown, compartments have the same privileged Function.prototype.constructor as the start compartment',
    );
  })();

  t.ok(lockdown(), 'return true when called from JS without options');
  t.notOk(
    lockdown(),
    'return false when called from SES with the same options',
  );
  t.throws(
    () => lockdown({ dateTaming: 'unsafe' }),
    'throws when attempting to untame Date',
  );
  t.throws(
    () => lockdown({ errorTaming: 'unsafe' }),
    'throws when attempting to untame Error',
  );
  t.throws(
    () => lockdown({ mathTaming: 'unsafe' }),
    'throws when attempting to untame Math',
  );
  t.throws(
    () => lockdown({ regExpTaming: 'unsafe' }),
    'throws when attempting to untame RegExp',
  );

  // Compartment constructor does not throw after lockdown.
  (() => {
    const c = new Compartment({}, {}, {});
    const cf = c.evaluate('Function.prototype.constructor');
    t.notEqual(
      cf,
      Function,
      'after lockdown, Function.prototype.constructor must be tamed inside compartments',
    );

    const d = new Compartment({}, {}, {});
    const df = d.evaluate('Function.prototype.constructor');
    t.equal(
      cf,
      df,
      'after lockdown, every compartment must have the same tamed Function.prototype.constructor',
    );
  })();

  t.end();
});
