import test from 'ava';
import {
  PathPrefixTree,
  PathPrefixTreeNode,
  makeMultiSubpathReplacer,
  assertMatchingWildcardCount,
} from '../src/pattern-replacement.js';

// PathPrefixTreeNode tests

test('PathPrefixTreeNode - creates empty node', t => {
  const node = new PathPrefixTreeNode();
  t.is(node.value, null);
  t.deepEqual(Object.keys(node.children), []);
});

test('PathPrefixTreeNode - setValue stores pattern and replacement parts', t => {
  const node = new PathPrefixTreeNode();
  node.setValue(['a', '*', 'c'], ['x', '*', 'z']);
  t.deepEqual(node.value, {
    patternParts: ['a', '*', 'c'],
    replacementParts: ['x', '*', 'z'],
  });
});

test('PathPrefixTreeNode - appendChild creates and returns child nodes', t => {
  const node = new PathPrefixTreeNode();
  const child1 = node.appendChild('foo');
  const child2 = node.appendChild('bar');
  const child1Again = node.appendChild('foo');

  t.true(child1 instanceof PathPrefixTreeNode);
  t.true(child2 instanceof PathPrefixTreeNode);
  t.is(child1, child1Again); // Should return existing child
  t.not(child1, child2);
});

// PathPrefixTree tests

test('PathPrefixTree - creates with empty root', t => {
  const prefixTree = new PathPrefixTree();
  t.true(prefixTree.root instanceof PathPrefixTreeNode);
  t.is(prefixTree.root.value, null);
});

test('PathPrefixTree - insert and search exact match', t => {
  const prefixTree = new PathPrefixTree();
  prefixTree.insert('./foo/bar', './lib/baz');

  const result = prefixTree.search('./foo/bar');
  t.deepEqual(result, {
    patternParts: ['.', 'foo', 'bar'],
    replacementParts: ['.', 'lib', 'baz'],
    captures: [],
  });
});

test('PathPrefixTree - search returns null for non-match', t => {
  const prefixTree = new PathPrefixTree();
  prefixTree.insert('./foo/bar', './lib/baz');

  t.is(prefixTree.search('./foo'), null);
  t.is(prefixTree.search('./foo/bar/extra'), null);
  t.is(prefixTree.search('./other'), null);
});

test('PathPrefixTree - wildcard matches exactly one segment', t => {
  const prefixTree = new PathPrefixTree();
  prefixTree.insert('./foo/*/bar', './lib/*/baz');

  // Should match single segment
  const result = prefixTree.search('./foo/x/bar');
  t.deepEqual(result, {
    patternParts: ['.', 'foo', '*', 'bar'],
    replacementParts: ['.', 'lib', '*', 'baz'],
    captures: ['x'],
  });

  // Should NOT match multiple segments (Node.js semantics)
  t.is(prefixTree.search('./foo/x/y/bar'), null);

  // Should NOT match zero segments
  t.is(prefixTree.search('./foo/bar'), null);
});

test('PathPrefixTree - exact match takes precedence over wildcard', t => {
  const prefixTree = new PathPrefixTree();
  prefixTree.insert('./foo/*', './wild/*');
  prefixTree.insert('./foo/specific', './exact');

  const exact = prefixTree.search('./foo/specific');
  t.deepEqual(exact, {
    patternParts: ['.', 'foo', 'specific'],
    replacementParts: ['.', 'exact'],
    captures: [],
  });

  const wild = prefixTree.search('./foo/other');
  t.deepEqual(wild, {
    patternParts: ['.', 'foo', '*'],
    replacementParts: ['.', 'wild', '*'],
    captures: ['other'],
  });
});

// assertMatchingWildcardCount tests

test('assertMatchingWildcardCount - passes for matching counts', t => {
  t.notThrows(() => assertMatchingWildcardCount('./foo', './bar'));
  t.notThrows(() => assertMatchingWildcardCount('./*/foo', './*/bar'));
  t.notThrows(() => assertMatchingWildcardCount('./*/foo/*', './*/bar/*'));
});

test('assertMatchingWildcardCount - throws for mismatched counts', t => {
  const error = t.throws(() => assertMatchingWildcardCount('./*/a/*', './*'));
  t.regex(error.message, /wildcard count mismatch/i);
  t.regex(error.message, /2/);
  t.regex(error.message, /1/);
});

// makeMultiSubpathReplacer tests

test('makeMultiSubpathReplacer - exact match (no wildcards)', t => {
  const replace = makeMultiSubpathReplacer({ './foo': './bar' });
  t.is(replace('./foo'), './bar');
  t.is(replace('./baz'), null);
});

test('makeMultiSubpathReplacer - single wildcard matches one segment', t => {
  const replace = makeMultiSubpathReplacer({ './foo/*/bar': './lib/*/baz' });
  t.is(replace('./foo/x/bar'), './lib/x/baz');
  t.is(replace('./foo/x/y/bar'), null); // * matches exactly one segment
  t.is(replace('./foo/bar'), null); // needs exactly one segment
});

test('makeMultiSubpathReplacer - dual wildcards (required by issue)', t => {
  const replace = makeMultiSubpathReplacer({
    './x/*/y/*/z': './src/x/*/y/*/z.js',
  });
  t.is(replace('./x/foo/y/bar/z'), './src/x/foo/y/bar/z.js');
  t.is(replace('./x/a/y/b/z'), './src/x/a/y/b/z.js');
  t.is(replace('./x/foo/bar/y/baz/qux/z'), null); // wrong structure
});

test('makeMultiSubpathReplacer - accepts array format', t => {
  const replace = makeMultiSubpathReplacer([
    ['./first/*', './a/*'],
    ['./second/*', './b/*'],
  ]);
  t.is(replace('./first/x'), './a/x');
  t.is(replace('./second/y'), './b/y');
});

test('makeMultiSubpathReplacer - exact match takes precedence', t => {
  const replace = makeMultiSubpathReplacer([
    ['./specific/path', './first'],
    ['./*', './second/*'],
  ]);
  // Note: Since we insert both and prefix tree tries exact first,
  // this depends on insertion order and prefix tree behavior
  t.is(replace('./specific/path'), './first');
  t.is(replace('./other'), './second/other');
});

test('makeMultiSubpathReplacer - wildcard count mismatch throws', t => {
  t.throws(
    () =>
      makeMultiSubpathReplacer({
        './*/a/*': './*', // 2 wildcards vs 1
      }),
    { message: /wildcard count mismatch/i },
  );
});

test('makeMultiSubpathReplacer - globstar throws', t => {
  t.throws(() => makeMultiSubpathReplacer({ './**': './lib' }), {
    message: /globstar/i,
  });
  t.throws(() => makeMultiSubpathReplacer({ './*': './**' }), {
    message: /globstar/i,
  });
});

test('makeMultiSubpathReplacer - imports-style patterns with #', t => {
  const replace = makeMultiSubpathReplacer({
    '#internal/*': './lib/*.js',
  });
  t.is(replace('#internal/util'), './lib/util.js');
  t.is(replace('#internal/deep/path'), null); // only one segment
});

test('makeMultiSubpathReplacer - complex pattern with multiple wildcards', t => {
  const replace = makeMultiSubpathReplacer({
    './components/*/styles/*.css': './dist/styles/*/*.css',
  });
  t.is(replace('./components/button/styles/main.css'), './dist/styles/button/main.css');
  t.is(replace('./components/card/styles/dark.css'), './dist/styles/card/dark.css');
});

test('makeMultiSubpathReplacer - returns null for empty mapping', t => {
  const replace = makeMultiSubpathReplacer({});
  t.is(replace('./anything'), null);
});

test('makeMultiSubpathReplacer - handles root pattern', t => {
  const replace = makeMultiSubpathReplacer({
    '.': './index.js',
  });
  t.is(replace('.'), './index.js');
  t.is(replace('./other'), null);
});
