import test from 'ava';
import {
  makeSubpathReplacer,
  PathTrie,
  PathTrieNode,
  makeMultiSubpathReplacer,
  revivePathTrie,
} from '../src/subpath.js';

test('no wildcard subpath replacement', t => {
  t.plan(5);
  const replaceSubpath = makeSubpathReplacer('a/b/c', 'x/y/z');
  t.is(replaceSubpath(''), null);
  t.is(replaceSubpath('a'), null);
  t.is(replaceSubpath('a/b'), null);
  t.is(replaceSubpath('a/b/c'), 'x/y/z');
  t.is(replaceSubpath('a/b/c/d'), null);
});

test('single wildcard subpath replacement', t => {
  t.plan(6);
  const replaceSubpath = makeSubpathReplacer('a/*/c', 'x/*/z');
  t.is(replaceSubpath(''), null);
  t.is(replaceSubpath('a'), null);
  t.is(replaceSubpath('a/b'), null);
  t.is(replaceSubpath('a/*/c'), 'x/*/z');
  t.is(replaceSubpath('a/b/c'), 'x/b/z');
  t.is(replaceSubpath('a/1/2/c'), 'x/1/2/z');
});

test('multiple wildcard subpath replacement', t => {
  const replaceSubpath = makeSubpathReplacer('a/*/b/*/c', 'x/*/y/*/z');
  t.is(replaceSubpath('a/1/2/b/3/4/c'), 'x/1/2/y/3/4/z');
});

test('multiple wildcard subpath replacement without slashes', t => {
  const replaceSubpath = makeSubpathReplacer('a*b*c', 'x*y*z');
  t.is(replaceSubpath('a12b34c'), 'x12y34z');
});

test('mismatched subpath', t => {
  const replaceSubpath = makeSubpathReplacer('*-*', '*');
  t.is(replaceSubpath('1-2'), null);
});

test('PathTrieNode - initializes correctly', t => {
  t.plan(2);
  const node = new PathTrieNode();
  t.deepEqual(node.children, {});
  t.is(node.value, null);
});

test('PathTrie - inserts patterns and replacements correctly', t => {
  t.plan(4);
  const trie = new PathTrie();
  trie.insert('a/*/c', 'x/*/z');
  t.truthy(trie.root.children['a']);
  t.truthy(trie.root.children['a'].children['*']);
  t.truthy(trie.root.children['a'].children['*'].children['c']);
  t.deepEqual(trie.root.children['a'].children['*'].children['c'].value, {
    patternParts: ['a', '*', 'c'],
    replacementParts: ['x', '*', 'z'],
  });
});

test('PathTrie - searches patterns correctly', t => {
  const trie = new PathTrie();
  trie.insert('a/*/c', 'x/*/z');
  const result = trie.search('a/b/c');
  t.deepEqual(result, {
    patternParts: ['a', '*', 'c'],
    replacementParts: ['x', '*', 'z'],
  });
});

test('makeMultiSubpathReplacer - replaces multiple patterns correctly', t => {
  t.plan(4);
  const replaceSubpath = makeMultiSubpathReplacer({
    'a/*/c': 'x/*/z',
    'b/*/d': 'y/*/w',
    'e/*': 'z/*',
  });
  t.is(replaceSubpath('a/b/c'), 'x/b/z');
  t.is(replaceSubpath('b/e/d'), 'y/e/w');
  t.is(replaceSubpath('c/f/g'), null);
  t.is(replaceSubpath('e/f'), 'z/f');
});

test('makeMultiSubpathReplacer - handles no matching patterns', t => {
  const replaceSubpath = makeMultiSubpathReplacer({
    'a/*/c': 'x/*/z',
    'b/*/d': 'y/*/w',
  });
  t.is(replaceSubpath('c/f/g'), null);
});

test('makeMultiSubpathReplacer - does not support globstar in patterns', t => {
  t.throws(
    () =>
      makeMultiSubpathReplacer({
        'a/**/*/c': 'x/*/*/z',
      }),
    { instanceOf: TypeError },
  );
});

test('makeMultiSubpathReplacer - does not support globstar in replacements', t => {
  t.throws(
    () =>
      makeMultiSubpathReplacer({
        'a/*/*/c': 'x/**/*/z',
      }),
    { instanceOf: TypeError },
  );
});

test('makeMultiSubpathReplacer - handles array input', t => {
  t.plan(3);
  const replaceSubpath = makeMultiSubpathReplacer([
    ['a/*/c', 'x/*/z'],
    ['b/*/d', 'y/*/w'],
  ]);
  t.is(replaceSubpath('a/b/c'), 'x/b/z');
  t.is(replaceSubpath('b/e/d'), 'y/e/w');
  t.is(replaceSubpath('c/f/g'), null);
});

test('PathTrie.fromJSON - should create a PathTrie from JSON string', t => {
  t.plan(3);
  const trie = new PathTrie();
  trie.insert('a/*/c', 'x/*/z');
  const trie1JsonString = JSON.stringify(trie);
  const trie2 = PathTrie.fromJSON(trie1JsonString);
  t.deepEqual(trie1JsonString, JSON.stringify(trie2));
  t.true(trie2 instanceof PathTrie);
  t.true(trie2.root instanceof PathTrieNode);
});

test('PathTrie.fromTrie - should create a PathTrie from Trie object', t => {
  t.plan(3);
  const trie = new PathTrie();
  trie.insert('a/*/c', 'x/*/z');
  const trie1Json = JSON.stringify(trie);
  const trie2 = PathTrie.fromTrie(JSON.parse(trie1Json));
  t.deepEqual(trie1Json, JSON.stringify(trie2));
  t.true(trie2 instanceof PathTrie);
  t.true(trie2.root instanceof PathTrieNode);
});
