// @ts-check
import 'ses';
import test from 'ava';
import { ZipReader, ZipWriter } from '@endo/zip';
import { makeArchive, parseArchive } from '../index.js';
import { readPowers } from './scaffold.js';

const fixture = new URL(
  'fixtures-0/node_modules/app/main.js',
  import.meta.url,
).toString();

test('extracting an archive with a superfluous file', async t => {
  const validBytes = await makeArchive(readPowers, fixture, {
    modules: {
      builtin: null,
    },
    dev: true,
  });

  const reader = new ZipReader(validBytes);
  const writer = new ZipWriter();
  writer.files = reader.files;
  writer.write('extraneous.txt', new TextEncoder().encode('Extra'));
  const invalidBytes = writer.snapshot();

  await t.throwsAsync(
    () =>
      parseArchive(invalidBytes, 'extra.zip', {
        computeSha512: readPowers.computeSha512,
        modules: {
          builtin: null,
        },
      }),
    {
      message:
        'Archive contains extraneous files: ["extraneous.txt"] in "extra.zip"',
    },
  );

  t.pass();
});

test('extracting an archive with an inconsistent hash', async t => {
  const validBytes = await makeArchive(readPowers, fixture, {
    modules: {
      builtin: null,
    },
    dev: true,
  });

  const reader = new ZipReader(validBytes);
  const writer = new ZipWriter();
  writer.files = reader.files;

  // Add a null byte to one file.
  const node = writer.files.get('app-v1.0.0-n0/main.js');
  const content = new Uint8Array(node.content.byteLength + 1);
  content.set(node.content, 0);
  node.content = content;

  const invalidBytes = writer.snapshot();

  await t.throwsAsync(
    () =>
      parseArchive(invalidBytes, 'corrupt.zip', {
        computeSha512: readPowers.computeSha512,
        modules: {
          builtin: null,
        },
      }),
    {
      message: `Failed to load module "./main.js" in package "app-v1.0.0-n0" (1 underlying failures: Module "main.js" of package "app-v1.0.0-n0" in archive "corrupt.zip" failed a SHA-512 integrity check`,
    },
  );

  t.pass();
});
