/* eslint-disable import/no-extraneous-dependencies */
import { test } from 'tape-promise/tape';
import fs from 'fs';
import path from 'path';

import { makeProtocolRetriever } from '../src';

const readFile = ({ pathname }) => fs.promises.readFile(pathname, 'utf-8');

test('filesystem retriever', async t => {
  try {
    const retrieve = makeProtocolRetriever({ file: readFile });
    const sr = `file://${path.join(__dirname, 'simple-retrieve')}`;
    await t.rejects(
      retrieve('http://www.example.com'),
      TypeError,
      'cannot retrieve missing protocol handler',
    );
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
