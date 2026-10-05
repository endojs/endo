import test from 'ava';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { makeFileRd, makeFileRW } from '../src/file.js';

const { isFrozen } = Object;

test('makeFileRd returns frozen object', t => {
  const fileRd = makeFileRd('/tmp', { fs, fsp, path });
  t.true(isFrozen(fileRd), 'FileRd object should be frozen');
});

test('makeFileRW returns frozen object', t => {
  const fileRW = makeFileRW('/tmp', { fs, fsp, path });
  t.true(isFrozen(fileRW), 'FileRW object should be frozen');
});

test('makeFileRd joined objects are frozen', t => {
  const fileRd = makeFileRd('/tmp', { fs, fsp, path });
  const joined = fileRd.join('subdir');
  t.true(isFrozen(joined), 'Joined FileRd object should be frozen');
});

test('makeFileRW joined objects are frozen', t => {
  const fileRW = makeFileRW('/tmp', { fs, fsp, path });
  const joined = fileRW.join('subdir');
  t.true(isFrozen(joined), 'Joined FileRW object should be frozen');
});

test('makeFileRW readOnly returns frozen object', t => {
  const fileRW = makeFileRW('/tmp', { fs, fsp, path });
  const readOnly = fileRW.readOnly();
  t.true(isFrozen(readOnly), 'ReadOnly object should be frozen');
});
