import test from 'ava';
import '../index.js';

import { tameFauxDataProperty as tfdp } from '../src/tame-faux-data-properties.js';

const { freeze, defineProperty, getOwnPropertyDescriptor } = Object;

test('unit test tameFauxDataProperty', t => {
  t.is(tfdp(undefined, 'foo', 'bar'), false, 'the object does not exist');
  t.is(tfdp({}, 'foo', 'bar'), false, 'the property does not exist');
  t.is(tfdp({ foo: 'bar' }, 'foo', 'bar'), false, 'an actual data property');

  t.is(
    tfdp(
      {
        get foo() {
          return 'bar';
        },
      },
      'foo',
      'bar',
    ),
    false,
    'a getter without a setter',
  );

  t.is(
    tfdp({
      get foo() {
        return 'bar';
      },
      set foo(_newValue) {
        throw TypeError('always throws');
      },
    }),
    false,
    'setter should not always throw',
  );

  t.is(
    tfdp({
      get foo() {
        return 'bar';
      },
      set foo(_newValue) {
        // never throws
      },
    }),
    false,
    'setter should throw when "this === obj"',
  );

  const subject1 = {
    get foo() {
      return 'bar';
    },
    set foo(_newValue) {
      if (this === subject1) {
        throw TypeError('throws only when it should');
      }
    },
  };
  t.is(tfdp(subject1, 'foo', 'bar'), false, 'does not assign when it should');

  const subject2 = {
    get foo() {
      return 'bar';
    },
    set foo(newValue) {
      defineProperty(this, 'foo', { value: newValue });
    },
  };
  t.is(
    tfdp(subject2, 'foo', 'bar'),
    false,
    'setter must fail when "this === obj"',
  );

  const subject3 = {
    get foo() {
      return 'bar';
    },
    set foo(newValue) {
      if (this === subject3) {
        throw TypeError('throws only when it should');
      }
      defineProperty(this, 'foo', { value: newValue });
    },
  };
  t.is(
    tfdp(freeze(subject3), 'foo', 'bar'),
    false,
    'genuine faux data property, but non-configurable so we cannot change it anyway',
  );

  const subject4 = {
    get foo() {
      return 'zip';
    },
    set foo(newValue) {
      if (this === subject4) {
        throw TypeError('throws only when it should');
      }
      defineProperty(this, 'foo', { value: newValue });
    },
  };
  t.is(
    tfdp(subject4, 'foo', 'bar'),
    false,
    'genuine faux data property, but not the expected value',
  );

  const desc4 = getOwnPropertyDescriptor(subject4, 'foo');
  t.deepEqual(
    desc4,
    {
      get: desc4.get,
      set: desc4.set,
      enumerable: true,
      configurable: true,
    },
    'what the faux data property looks like',
  );
  t.is(tfdp(subject4, 'foo', 'zip'), true, 'changed into actual data prop');
  t.deepEqual(
    getOwnPropertyDescriptor(subject4, 'foo'),
    {
      value: 'zip',
      writable: true,
      enumerable: true,
      configurable: true,
    },
    'what the resulting actual data property looks like',
  );
});
