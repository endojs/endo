import test from 'ava';
import '../index.js';

// See https://github.com/zloirock/core-js/issues/1092
const originalPush = Array.prototype.push;
// eslint-disable-next-line no-extend-native
Array.prototype.push = function push(...args) {
  return Reflect.apply(originalPush, this, args);
};

lockdown();

test('tolerate empty prototype', t => {
  t.assert('prototype' in Array.prototype.push);
});
