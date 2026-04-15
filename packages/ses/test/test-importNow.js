'use strict';

import test from 'ava';
import { importNow } from '../src/importNow.js';
import { makePromiseControl } from '../src/promise-control.js';

const drainMicrotasks = () => new Promise(resolve => queueMicrotask(resolve));

const waitForAllImports = async importPromises => {
  const results = await Promise.all(importPromises);
  await drainMicrotasks();
  await drainMicrotasks();
  return results;
};

test('importNow single module', async t => {
  const source = `export default 42;`;
  const ns = await importNow('file:///single.js', source);
  t.is(ns.default, 42);
});

test('importNow multiple independent modules complete deterministically', async t => {
  const sources = [
    { specifier: 'file:///a.js', source: `export const val = 1;` },
    { specifier: 'file:///b.js', source: `export const val = 2;` },
    { specifier: 'file:///c.js', source: `export const val = 3;` },
  ];

  const importPromises = sources.map(({ specifier, source }) =>
    importNow(specifier, source),
  );

  const results = await waitForAllImports(importPromises);

  const values = results.map(ns => ns.val).sort();
  t.deepEqual(values, [1, 2, 3]);
});

test('importNow dependent modules resolve after dependencies', async t => {
  const depSource = `export const x = 10;`;
  const importerSource = `export { x } from 'file:///dep.js'; export const y = x + 5;`;

  const importPromises = [
    importNow('file:///dep.js', depSource),
    importNow('file:///importer.js', importerSource),
  ];

  const [depNs, importerNs] = await waitForAllImports(importPromises);

  t.is(depNs.x, 10);
  t.is(importerNs.x, 10);
  t.is(importerNs.y, 15);
});

test('importNow circular dependencies complete without deadlock', async t => {
  const sourceA = `import { b } from 'file:///b.js'; export const a = 1 + b;`;
  const sourceB = `import { a } from 'file:///a.js'; export const b = 1 + a;`;

  const importPromises = [
    importNow('file:///a.js', sourceA),
    importNow('file:///b.js', sourceB),
  ];

  const [nsA, nsB] = await waitForAllImports(importPromises);

  t.is(typeof nsA.a, 'number');
  t.is(typeof nsB.b, 'number');
  t.is(nsA.a, nsB.b);
});

test('importNow re-exports are available after completion', async t => {
  const originalSource = `export const item = 'original';`;
  const reexportSource = `export { item } from 'file:///original.js';`;

  const importPromises = [
    importNow('file:///original.js', originalSource),
    importNow('file:///reexport.js', reexportSource),
  ];

  await waitForAllImports(importPromises);

  const reNs = await importNow('file:///reexport.js', reexportSource);
  await drainMicrotasks();
  t.is(reNs.item, 'original');
});

test('importNow errors are reported deterministically', async t => {
  const badSource = `throw new Error('boom');`;

  await t.throwsAsync(
    async () => {
      await importNow('file:///bad.js', badSource);
      await drainMicrotasks();
    },
    { message: 'boom' },
  );
});

test('importNow multiple errors collected deterministically', async t => {
  const badSources = [
    { specifier: 'file:///bad1.js', source: `throw new Error('err1');` },
    { specifier: 'file:///bad2.js', source: `throw new Error('err2');` },
  ];

  const importPromises = badSources.map(({ specifier, source }) =>
    importNow(specifier, source).catch(e => e),
  );

  const results = await waitForAllImports(importPromises);

  const messages = results
    .filter(r => r instanceof Error)
    .map(e => e.message)
    .sort();

  t.deepEqual(messages, ['err1', 'err2']);
});
