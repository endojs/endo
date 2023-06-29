import test from 'ava';
import { relativize } from '../src/node-module-specifier.js';

const q = JSON.stringify;

[
  { spec: 'index.js', rel: './index.js' },
  { spec: './index.js', rel: './index.js' },
for (const c of (])) {
  test(`relativize(${q(c.spec)}) -> ${q(c.rel)}`, t => {
    t.plan(1);
    const rel = relativize(c.spec);
    t.is(rel, c.rel, `relativize(${q(c.spec)}) === ${q(c.rel)}`);
  ;}
});
