import test from 'ava';
import {
  OriginalWeakMap,
  OriginalWeakSet,
  AltWeakMap,
  AltWeakSet,
} from '../src/AltWeakMapSet.js';

const x = {};
const y = {};
const z = {};

const testWeakMapClass = (title, WeakMapClass) => {
  test(title, t => {
    const wmi = new WeakMapClass([
      [x, 'a'],
      [y, 'b'],
    ]);
    t.true(wmi.has(x));
    t.false(wmi.has(z));
    t.is(wmi.get(x), 'a');
    t.is(wmi.get(z), undefined);
    t.false(wmi.delete(z));
    t.true(wmi.delete(x));
    t.false(wmi.has(x));
    t.false(wmi.delete(x));
    t.is(wmi.set(z, 'c'), wmi);
    t.true(wmi.has(z));
    t.is(wmi.get(z), 'c');
    t.is(wmi.set(z, 'd'), wmi);
    t.is(wmi.get(z), 'd');
    t.throws(() => wmi.set(88, 'e'));
  });
};

testWeakMapClass('test OriginalWeakMap', OriginalWeakMap);
testWeakMapClass('test AltWeakMap', AltWeakMap);

const testWeakSetClass = (title, WeakSetClass) => {
  test(title, t => {
    const wsi = new WeakSetClass([x, y]);
    t.true(wsi.has(x));
    t.false(wsi.has(z));
    t.false(wsi.delete(z));
    t.true(wsi.delete(x));
    t.false(wsi.has(x));
    t.false(wsi.delete(x));
    t.is(wsi.add(z), wsi);
    t.true(wsi.has(z));
    t.is(wsi.add(z), wsi);
    t.true(wsi.has(z));
    t.throws(() => wsi.add(88));
  });
};

testWeakSetClass('test OriginalWeakSet', OriginalWeakSet);
testWeakSetClass('test AltWeakSet', AltWeakSet);
