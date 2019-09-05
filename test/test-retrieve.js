/* eslint-disable import/no-extraneous-dependencies */
import { test } from 'tape-promise/tape';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

import { makeFetchRetriever } from '../src';

const readFile = file => fs.promises.readFile(file, 'utf-8');

test.only('filesystem retriever', async t => {
  try {
    const retrieve = makeFetchRetriever(fetch, readFile);
    const sr = `file://${path.join(__dirname, 'simple-retrieve')}`;
    console.log(sr);
    await t.rejects(
      retrieve(`${sr}/nonexistent`),
      Error,
      'cannot retrieve nonexistent',
    );
    t.equal(
      await retrieve(`${sr}/hello.txt`),
      `Hello, world!\n`,
      `retrieve existing file`,
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
