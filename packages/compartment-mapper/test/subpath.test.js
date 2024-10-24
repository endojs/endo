import test from 'ava';
import { makeSubpathReplacer } from '../src/subpath.js';

test('no wildcard subpath replacement', t => {
  const replaceSubpath = makeSubpathReplacer('a/b/c', 'x/y/z');
  t.is(replaceSubpath(''), null);
  t.is(replaceSubpath('a'), null);
  t.is(replaceSubpath('a/b'), null);
  t.is(replaceSubpath('a/b/c'), 'x/y/z');
  t.is(replaceSubpath('a/b/c/d'), null);
});

test('single wildcard subpath replacement', t => {
  const replaceSubpath = makeSubpathReplacer('a/*/c', 'x/*/z');
  t.is(replaceSubpath(''), null);
  t.is(replaceSubpath('a'), null);
  t.is(replaceSubpath('a/b'), null);
  t.is(replaceSubpath('a/*/c'), 'x/*/z');
  t.is(replaceSubpath('a/b/c'), 'x/b/z');
  t.is(replaceSubpath('a/1/2/c'), 'x/1/2/z');
});

test('double wildcard subpath replacement', t => {
  const replaceSubpath = makeSubpathReplacer('a/*/b/*/c', 'x/*/y/*/z');
  t.is(replaceSubpath('a/1/2/b/3/4/c'), 'x/1/2/y/3/4/z');
});

test('double wildcard subpath replacement without slashes', t => {
  const replaceSubpath = makeSubpathReplacer('a*b*c', 'x*y*z');
  t.is(replaceSubpath('a12b34c'), 'x12y34z');
});

test('mismatched subpath', t => {
  const replaceSubpath = makeSubpathReplacer('*-*', '*');
  t.is(replaceSubpath('1-2'), null);
});
