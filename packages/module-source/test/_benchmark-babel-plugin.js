import Benchmark from 'benchmark';
import fs from 'fs';
import url from 'url';
import { makeTransformSource } from '../src/transform-source.js';
import makeModulePlugins from '../src/babel-plugin.js';
import { createSourceOptions } from '../src/source-options.js';

const suite = new Benchmark.Suite();

const resolveLocal = path => url.fileURLToPath(new URL(path, import.meta.url));
const cases = [
  {
    name: 'small',
    fixture: fs.readFileSync(resolveLocal('./fixtures/small.js'), 'utf8'),
  },
  {
    name: 'large',
    fixture: fs.readFileSync(resolveLocal('./fixtures/large.js'), 'utf8'),
  },
  {
    name: 'exportheavy',
    fixture: fs.readFileSync(resolveLocal('./fixtures/exportheavy.js'), 'utf8'),
  },
];

const transformSource = makeTransformSource(makeModulePlugins);

cases.map(testCase =>
  suite.add(testCase.name, () => {
    transformSource(testCase.fixture, createSourceOptions());
  }),
);

suite
  .on('cycle', event => {
    console.log(String(event.target));
  })
  .on('error', event => {
    console.log(String(event.target), event.target.error);
  })
  .run();
