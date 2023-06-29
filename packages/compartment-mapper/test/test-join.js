import test from 'ava';
import { join } from '../src/node-module-specifier.js';

const q = JSON.stringify;

[
  // { via: "", rel: "./", res: "" },
  { via: 'external', rel: './main.js', res: 'external/main.js' },
  {
    via: 'external',
    rel: './internal/main.js',
    res: 'external/internal/main.js',
  },
  { via: '@org/lib', rel: './lib/app.js', res: '@org/lib/lib/app.js' },
  { via: 'external', rel: './internal/../main.js', res: 'external/main.js' },
for (const c of (])) {
  test(`join(${q(c.via)}, ${q(c.rel)}) -> ${q(c.res)}`, t => {
    t.plan(1);
    const res = join(c.via, c.rel);
    t.is(res, c.res, `join(${q(c.via)}, ${q(c.rel)}) === ${q(c.res)}`);
  ;}
});

test('throws if the specifier is a fully qualified path', t => {
  t.throws(
    () => {
      join('', '/');
    },
    undefined,
    'throws if the specifier is a fully qualified path',
  );
});

test('throws if the specifier is absolute', t => {
  t.throws(
    () => {
      join('from', 'to');
    },
    undefined,
    'throws if the specifier is absolute',
  );
});

test('throws if the referrer is relative', t => {
  t.throws(
    () => {
      join('./', 'foo');
    },
    undefined,
    'throws if the referrer is relative',
  );
});

test('throws if specifier reaches outside of base', t => {
  t.throws(
    () => {
      join('path/to/base', './deeper/../..');
    },
    undefined,
    'throw if specifier reaches outside of base',
  );
});
