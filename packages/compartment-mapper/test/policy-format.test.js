import 'ses';
import test from 'ava';

import {
  assertPackagePolicy,
  assertPolicy,
  WILDCARD_POLICY_VALUE,
} from '../src/policy-format.js';

const q = JSON.stringify;

[
  {},
  { packages: {}, globals: {}, builtins: {} },
  { packages: {}, globals: {}, builtins: {}, noGlobalFreeze: true },
  {
    packages: WILDCARD_POLICY_VALUE,
    globals: WILDCARD_POLICY_VALUE,
    builtins: WILDCARD_POLICY_VALUE,
  },
  {
    packages: {
      foo: true,
    },
  },
  {
    globals: {
      foo: true,
    },
  },
  {
    builtins: {
      foo: true,
    },
  },
  {
    builtins: {
      foo: true,
      bar: {
        attenuate: 'foo',
      },
    },
  },
  {
    builtins: {
      foo: true,
      bar: {
        attenuate: 'foo',
        params: ['a', {}],
      },
    },
  },
  {
    builtins: {
      foo: true,
      bar: ['a', {}],
    },
  },
  {
    globals: {
      attenuate: 'foo',
    },
  },
  {
    globals: {
      attenuate: 'foo',
      params: ['a', {}],
    },
  },
  {
    globals: ['a', {}],
  },
  {
    options: {
      winken: ['blinken', 'nod'],
      abc: 123,
    },
  },
].forEach(sample => {
  test(`assertPackagePolicy(${q(sample)}) -> valid`, t => {
    t.plan(1);
    t.notThrows(() => assertPackagePolicy(sample, 'policy'));
  });
});

[
  { unexpectedField: true },
  { packages: [] },
  { builtins: [] },
  { packages: ['a'] },
  { builtins: ['a'] },
  { packages: null },
  { packages: 'invalid text' },
  { noGlobalFreeze: {} },
  {
    packages: {
      foo: 'invalid text',
    },
  },
  {
    globals: {
      foo: 'invalid text',
    },
  },
  {
    builtins: {
      foo: 'invalid text',
    },
  },
  {
    builtins: {
      foo: true,
      bar: {
        notAnAttenuator: true,
      },
    },
  },
  {
    globals: {
      foo: true,
      bar: {
        attenuate: 'foo',
        params: ['a', {}],
      },
    },
  },
  {
    globals: {
      foo: true,
      bar: ['a', {}],
    },
  },
  {
    packages: {
      foo: {
        attenuate: 'foo',
        params: ['a', {}],
      },
    },
  },
  {
    packages: ['a', {}],
  },
].forEach(sample => {
  test(`assertPackagePolicy(${q(sample)}) -> invalid`, t => {
    t.plan(1);
    try {
      assertPackagePolicy(sample, 'policy');
      t.fail('expected a failed assertion');
    } catch (e) {
      t.snapshot(e);
    }
  });
});

[
  {
    defaultAttenuator: 'a',
    resources: {},
  },
].forEach(sample => {
  test(`assertPolicy(${q(sample)}) -> valid`, t => {
    t.plan(1);
    t.notThrows(() => assertPolicy(sample));
  });
});

[
  {},
  {
    resources: [],
  },
  {
    resources: null,
  },
  {
    defaultAttenuator: ['a'],
    resources: {},
  },
  {
    resources: {},
    oink: true,
  },
].forEach(sample => {
  test(`assertPolicy(${q(sample)}) -> invalid`, t => {
    t.plan(1);
    try {
      assertPolicy(sample);
      t.fail('expected a failed assertion');
    } catch (e) {
      t.snapshot(e);
    }
  });
});
