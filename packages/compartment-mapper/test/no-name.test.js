// @ts-check
import 'ses';
import fs from 'fs';
import url from 'url';
import test from 'ava';

import { makeBundle } from '../bundle.js';
import { mapNodeModules } from '../node-modules.js';
import { makeReadPowers } from '../node-powers.js';

const readPowers = makeReadPowers({ fs, url });

const escapeRegex = /** @param {string} s */ s =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const dependencyEntry = new URL(
  'fixtures-no-name/node_modules/app/index.js',
  import.meta.url,
).toString();

const noNameEntry = new URL(
  'fixtures-no-name/node_modules/no-name-pkg/index.js',
  import.meta.url,
).toString();

const dependencyDescriptorLocation = new URL(
  'fixtures-no-name/node_modules/no-name-pkg/package.json',
  import.meta.url,
).toString();

const entryDescriptorLocation = new URL(
  'fixtures-no-name/node_modules/no-name-pkg/package.json',
  import.meta.url,
).toString();

test('mapNodeModules: dependency package.json without "name" yields a precise diagnostic', async t => {
  await t.throwsAsync(mapNodeModules(readPowers, dependencyEntry), {
    message: new RegExp(
      `package\\.json at "${escapeRegex(
        dependencyDescriptorLocation,
      )}" must have a "name" field`,
    ),
  });
});

test('mapNodeModules: entry package.json without "name" yields a precise diagnostic', async t => {
  await t.throwsAsync(mapNodeModules(readPowers, noNameEntry), {
    message: new RegExp(
      `package\\.json at "${escapeRegex(
        entryDescriptorLocation,
      )}" must have a "name" field`,
    ),
  });
});

test('makeBundle: dependency package.json without "name" yields a precise diagnostic', async t => {
  await t.throwsAsync(makeBundle(readPowers.read, dependencyEntry), {
    message: new RegExp(
      `package\\.json at "${escapeRegex(
        dependencyDescriptorLocation,
      )}" must have a "name" field`,
    ),
  });
});
