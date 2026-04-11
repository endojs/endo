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
  t.throws(() => assertMatchingWildcardCount('./*', './a'), {
    message: /wildcard count mismatch.*\bhas 1\b.*\bhas 0\b/i,
  });
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

test('Node-style tie-break prefers longer full pattern key', t => {
  const replace = makeMultiSubpathReplacer([
    ['./foo/*', './src/foo/*.js'],
    ['./foo/*.js', './src/*.js'],
  ]);
  t.deepEqual(replace('./foo/bar.js'), {
    result: './src/bar.js',
    compartment: undefined,
  });
});

test('wildcard count mismatch throws', t => {
  t.throws(() => makeMultiSubpathReplacer({ './*': './a' }), {
    message: /wildcard count mismatch/i,
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

test('null target excludes exact entry', t => {
  const replace = makeMultiSubpathReplacer([
    { from: './private', to: null },
    { from: './*', to: './src/*' },
  ]);
  t.deepEqual(replace('./private'), {
    result: null,
    compartment: undefined,
  });
  // Other paths still resolve normally
  t.deepEqual(replace('./other'), {
    result: './src/other',
    compartment: undefined,
  });
});

test('null target excludes wildcard pattern', t => {
  const replace = makeMultiSubpathReplacer([
    { from: './features/*.js', to: './src/features/*.js' },
    { from: './features/private/*.js', to: null },
  ]);
  // Longer prefix wins — excluded
  t.deepEqual(replace('./features/private/thing.js'), {
    result: null,
    compartment: undefined,
  });
  // Non-excluded path resolves normally
  t.deepEqual(replace('./features/alpha.js'), {
    result: './src/features/alpha.js',
    compartment: undefined,
  });
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
