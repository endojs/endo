/* eslint-disable import/no-extraneous-dependencies */
import { test } from 'tape-promise/tape';
import { evaluateProgram as evaluate } from '@agoric/evaluate';
import makeModuleTransformer from '@agoric/transform-module';
import * as babelCore from '@babel/core';
import fs from 'fs';
import path from 'path';

import makeImporter, * as mi from '../src';

const readFile = ({ pathname }) => fs.promises.readFile(pathname, 'utf-8');

const protoHandlers = new Map([['file', readFile]]);

const setup = rootUrl => {
  const boxedTransform = [];
  const importer = makeImporter({
    resolve: mi.makeRootedResolver(rootUrl),
    locate: mi.makeSuffixLocator('.js'),
    retrieve: mi.makeProtocolRetriever(protoHandlers),
    rewrite: mi.makeTransformRewriter(boxedTransform),
    rootLinker: mi.makeEvaluateLinker(evaluate),
  });
  boxedTransform[0] = makeModuleTransformer(babelCore, importer);
  const endowments = {
    insist(assertion, description) {
      if (!assertion) {
        throw Error(description);
      }
    },
  };
  return { importer, endowments };
};

test('moddir index.js', async t => {
  try {
    const rootUrl = `file://${path.join(__dirname, 'moddir')}`;
    const { importer, endowments } = setup(rootUrl);
    t.deepEqual(
      await importer({ spec: '.', url: `${rootUrl}/` }, endowments),
      {
        default: 42,
        mu: 89,
        ex: 23,
        ex2: 23,
        co: 77,
        xx: 33,
        vv: 'xChanged',
        f: 'f',
        g: 'gChanged',
        h: 'gChanged',
      },
      `importer works`,
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

test('moddir function.js', async t => {
  try {
    const rootUrl = `file://${path.join(__dirname, 'moddir')}`;
    const { importer, endowments } = setup(rootUrl);
    const ns = await importer(
      { spec: './function', url: `${rootUrl}/` },
      endowments,
    );
    t.is(typeof ns.fn1, 'function', `function fn1 is exported`);
    t.is(ns.fn1(), 'fn1', 'function fn1 is executable');
    t.is(typeof ns.fn2, 'function', `function fn2 is exported`);
    t.is(ns.fn2(), 'fn2', 'function fn2 is executable');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

test('moddir exports', async t => {
  try {
    const rootUrl = `file://${path.join(__dirname, 'moddir')}`;
    const { importer, endowments } = setup(rootUrl);
    t.deepEqual(
      await importer({ spec: './exportNS', url: `${rootUrl}/` }, endowments),
      {
        ns2: {
          f: 'f',
          g: 'gChanged',
        },
      },
      'namespace is exported',
    );

    t.deepEqual(
      await importer({ spec: './exportAll', url: `${rootUrl}/` }, endowments),
      {},
      're-exporting nothing',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

test('invalid export all', async t => {
  try {
    const rootUrl = `file://${path.join(__dirname, 'invalid')}`;
    const { importer, endowments } = setup(rootUrl);
    await t.rejects(
      importer({ spec: './index', url: `${rootUrl}/` }, endowments),
      SyntaxError,
      'exporting all default fails',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
