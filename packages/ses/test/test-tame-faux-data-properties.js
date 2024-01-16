import test from 'ava';
import '../index.js';

import { tameFauxDataProperty as tfdp } from '../src/tame-faux-data-properties.js';

const { freeze, defineProperty, getOwnPropertyDescriptor } = Object;

test('unit test tameFauxDataProperty', t => {
  t.is(tfdp(undefined, 'foo', 'bar'), false);
  t.is(tfdp({}, 'foo', 'bar'), false);
  t.is(tfdp({ foo: 'bar' }, 'foo', 'bar'), false);

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
  t.is(tfdp(subject1, 'foo', 'bar'), false);

  const subject2 = {
    get foo() {
      return 'bar';
    },
    set foo(newValue) {
      defineProperty(this, 'foo', { value: newValue });
    },
  };
  t.is(tfdp(subject2, 'foo', 'bar'), false);

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
  t.is(tfdp(freeze(subject3), 'foo', 'bar'), false);

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
  t.is(tfdp(subject4, 'foo', 'bar'), false);

  const desc4 = getOwnPropertyDescriptor(subject4, 'foo');
  t.deepEqual(desc4, {
    get: desc4.get,
    set: desc4.set,
    enumerable: true,
    configurable: true,
  });
  t.is(tfdp(subject4, 'foo', 'zip'), true);
  t.deepEqual(getOwnPropertyDescriptor(subject4, 'foo'), {
    value: 'zip',
    writable: true,
    enumerable: true,
    configurable: true,
  });
});
