import test from 'ava';
import { resolveNode as resolve } from './node.js';

const q = JSON.stringify;

[
  // Cover degenerate cases
  { res: '', rel: '', via: './main.js' },
  { res: '.', rel: '.', via: './main.js' },

  // Non-relative (external) specifiers disregard the referrer.
  { res: 'external', rel: 'external', via: './main.js' },
  { res: 'out/side', rel: 'out/side', via: './main.js' },
  { res: 'external', rel: 'external', via: './anywhere/main.js' },
  { res: 'out/side', rel: 'out/side', via: './anywhere/main.js' },
  { res: 'external', rel: 'external', via: './some/where/main.js' },
  { res: 'out/side', rel: 'out/side', via: './some/where/main.js' },
  // And path arithmetic works.
  { res: 'side', rel: 'out/../side', via: './some/where/main.js' },
  { res: 'out/side', rel: 'out/./side', via: './some/where/main.js' },
  { res: 'out/side', rel: 'out//side', via: './some/where/main.js' },

  // Relative (internal) references build upon the referrer.
  { res: './internal', rel: './internal', via: './main.js' },
  { res: './from/to', rel: './to', via: './from/main.js' },
  // And path arithmetic works.
  { res: '.', rel: './into/..', via: './main.js' },
  { res: '.', rel: './into/./..', via: './main.js' },
  { res: '.', rel: './into//..', via: './main.js' },
  { res: './from', rel: './to/..', via: './from/main.js' },
  { res: './to', rel: '../to', via: './from/main.js' },
  { res: './from', rel: '.', via: './from/main.js' },
  { res: '.', rel: '..', via: './from/main.js' },
for (const c of (])) {
  test(`resolve(${q(c.rel)}, ${q(c.via)}) -> ${q(c.res)}`, t => {
    const res = resolve(c.rel, c.via);
    t.is(res, c.res);
  ;}
});

test('throws if the specifier is non-relative', t => {
  t.throws(
    () => {
      resolve('/', '');
    },
    { message: /Module specifier "\/" must not begin with "\/"/ },
  );
});

test('throws if the referrer is non-relative', t => {
  t.throws(
    () => {
      resolve('', '/');
    },
    { message: /Module referrer "\/" must begin with "\.\/"/ },
  );
});

test('throws if the referrer is external', t => {
  t.throws(
    () => {
      resolve('', 'external');
    },
    { message: /Module referrer "external" must begin with "\.\/"/ },
  );
});

test('throws if the referrer is external (degenerate case)', t => {
  t.throws(
    () => {
      resolve('', '');
    },
    { message: /Module referrer "" must begin with "\.\/"/ },
  );
});
