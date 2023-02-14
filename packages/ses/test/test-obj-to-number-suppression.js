import '../index.js';
import test from 'ava';

lockdown();

test('plus append still works', t => {
  t.is({} + {}, '[object Object][object Object]');
});

test('relational compare throws', t => {
  // eslint-disable-next-line no-self-compare
  t.throws(() => ({} < {}), {
    message: 'Suppressing conversion of "[[object Object]]" to number',
  });
});
