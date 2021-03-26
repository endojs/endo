import test from 'ava';
import '../lockdown.js';

lockdown({
  __unsafeKludgeForReact__: 'unsafe',
  overrideTaming: 'min',
});

test('Unsafe kludge for react', t => {
  t.false(Object.isFrozen(Object.prototype));

  const x = {};
  x.toString = () => 'foo';
  x.constructor = 'Foo';
  t.is(`${x}`, 'foo');
  t.is(x.constructor, 'Foo');

  harden(x);
  // Because harden is tranisitively contagious up inheritance chain,
  // hardening x also hardens Object.prototype.
  t.true(Object.isFrozen(Object.prototype));

  const y = {};
  // Under even the 'min' override taming, we still enable
  // Object.prototype.toString to be overridden by assignment.
  y.toString = () => 'bar';
  t.throws(
    () => {
      // At the 'min' override taming, we do not enable
      // Object.prototype.constructor to be overridden by
      // assignment. This did not matter before hardening
      // x because the override mistake only applies to
      // non-writable properties and Object.prototype had
      // not yet been frozen.
      y.constructor = 'Bar';
    },
    undefined,
    'Override should not be enabled for "constructor".',
  );
  t.is(`${y}`, 'bar');
  t.is(y.constructor, Object);
});
