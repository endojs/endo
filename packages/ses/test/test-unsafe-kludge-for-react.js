import test from 'ava';
import '../lockdown.js';

lockdown({
  __unsafeKludgeForReact__: 'unsafe',
});

test('Unsafe kludge for react', t => {
  t.false(Object.isFrozen(Object.prototype));

  const x = {};
  x.toString = () => 'foo';
  x.constructor = 'Foo';
  t.is(`${x}`, 'foo');
  t.is(x.constructor, 'Foo');

  harden(x);

  t.true(Object.isFrozen(Object.prototype));

  const y = {};
  y.toString = () => 'bar';
  t.throws(
    () => {
      y.constructor = 'Bar';
    },
    undefined,
    'Override should not be enabled for "constructor".',
  );
  t.is(`${y}`, 'bar');
  t.is(y.constructor, Object);
});
