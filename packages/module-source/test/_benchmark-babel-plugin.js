import Benchmark from 'benchmark';
import fs from 'fs';
import url from 'url';
import { makeModuleAnalyzer } from '../src/transform-analyze.js';

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

const analyzeModuleSource = makeModuleAnalyzer();

cases.map(testCase =>
  suite.add(testCase.name, () => {
    analyzeModuleSource(testCase.fixture);
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
