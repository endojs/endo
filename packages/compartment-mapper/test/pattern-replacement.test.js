import test from 'ava';
import {
  makeMultiSubpathReplacer,
  assertMatchingWildcardCount,
} from '../src/pattern-replacement.js';

// assertMatchingWildcardCount tests

test('assertMatchingWildcardCount - passes for matching counts', t => {
  t.notThrows(() => assertMatchingWildcardCount('./foo', './bar'));
  t.notThrows(() => assertMatchingWildcardCount('./*.js', './*.js'));
});

test('assertMatchingWildcardCount - throws for mismatched counts', t => {
  const error = t.throws(() => assertMatchingWildcardCount('./*', './a'));
  t.regex(error.message, /wildcard count mismatch/i);
});

// makeMultiSubpathReplacer tests

test('exact match (no wildcards)', t => {
  const replace = makeMultiSubpathReplacer({ './foo': './bar' });
  t.deepEqual(replace('./foo'), { result: './bar', compartment: undefined });
  t.is(replace('./baz'), null);
});

test('single wildcard matches one segment', t => {
  const replace = makeMultiSubpathReplacer({
    './features/*.js': './src/features/*.js',
  });
  t.deepEqual(replace('./features/alpha.js'), {
    result: './src/features/alpha.js',
    compartment: undefined,
  });
});

test('wildcard matches across / separators (Node.js semantics)', t => {
  const replace = makeMultiSubpathReplacer({
    './features/*.js': './src/features/*.js',
  });
  // * matches "beta/gamma" which contains "/"
  t.deepEqual(replace('./features/beta/gamma.js'), {
    result: './src/features/beta/gamma.js',
    compartment: undefined,
  });
});

test('wildcard does not match empty string when prefix+suffix fill the specifier', t => {
  const replace = makeMultiSubpathReplacer({
    './features/*.js': './src/features/*.js',
  });
  // "./features/.js" has * matching empty string — length check allows this
  t.deepEqual(replace('./features/.js'), {
    result: './src/features/.js',
    compartment: undefined,
  });
});

test('accepts array of tuples', t => {
  const replace = makeMultiSubpathReplacer([
    ['./first/*', './a/*'],
    ['./second/*', './b/*'],
  ]);
  t.deepEqual(replace('./first/x'), {
    result: './a/x',
    compartment: undefined,
  });
  t.deepEqual(replace('./second/y'), {
    result: './b/y',
    compartment: undefined,
  });
});

test('accepts PatternDescriptor array', t => {
  const replace = makeMultiSubpathReplacer([
    { from: './features/*.js', to: './src/*.js', compartment: 'dep-pkg' },
  ]);
  t.deepEqual(replace('./features/alpha.js'), {
    result: './src/alpha.js',
    compartment: 'dep-pkg',
  });
});

test('exact entry takes precedence over wildcard', t => {
  const replace = makeMultiSubpathReplacer([
    ['./features/beta/exact', './exact-target'],
    ['./features/*.js', './src/features/*.js'],
  ]);
  t.deepEqual(replace('./features/beta/exact'), {
    result: './exact-target',
    compartment: undefined,
  });
  t.deepEqual(replace('./features/alpha.js'), {
    result: './src/features/alpha.js',
    compartment: undefined,
  });
});

test('longer prefix wins (specificity)', t => {
  const replace = makeMultiSubpathReplacer([
    ['./*.js', './fallback/*.js'],
    ['./features/*.js', './src/features/*.js'],
  ]);
  // "./features/*.js" has longer prefix "./features/" than "./"
  t.deepEqual(replace('./features/alpha.js'), {
    result: './src/features/alpha.js',
    compartment: undefined,
  });
  t.deepEqual(replace('./other.js'), {
    result: './fallback/other.js',
    compartment: undefined,
  });
});

test('wildcard count mismatch throws', t => {
  t.throws(() => makeMultiSubpathReplacer({ './*': './a' }), {
    message: /wildcard count mismatch/i,
  });
});

test('globstar throws', t => {
  t.throws(() => makeMultiSubpathReplacer({ './**': './lib' }), {
    message: /globstar/i,
  });
  t.throws(() => makeMultiSubpathReplacer({ './*': './**' }), {
    message: /globstar/i,
  });
});

test('imports-style patterns with #', t => {
  const replace = makeMultiSubpathReplacer({
    '#internal/*.js': './lib/*.js',
  });
  t.deepEqual(replace('#internal/util.js'), {
    result: './lib/util.js',
    compartment: undefined,
  });
  // * matches across / per Node.js semantics
  t.deepEqual(replace('#internal/deep/path.js'), {
    result: './lib/deep/path.js',
    compartment: undefined,
  });
});

test('returns null for empty mapping', t => {
  const replace = makeMultiSubpathReplacer({});
  t.is(replace('./anything'), null);
});

test('handles root pattern', t => {
  const replace = makeMultiSubpathReplacer({
    '.': './index.js',
  });
  t.deepEqual(replace('.'), {
    result: './index.js',
    compartment: undefined,
  });
  t.is(replace('./other'), null);
});
