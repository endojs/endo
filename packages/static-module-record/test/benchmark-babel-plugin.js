import Benchmark from 'benchmark';
import fs from 'fs';
import url from 'url';
import { makeTransformSource } from '../src/transformSource.js';
import makeModulePlugins from '../src/babelPlugin.js';

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
const freshOptions = () => {
  return {
    sourceType: 'module',
    fixedExportMap: Object.create(null),
    imports: Object.create(null),
    exportAlls: [],
    liveExportMap: Object.create(null),
    hoistedDecls: [],
    importSources: Object.create(null),
    importDecls: [],
    importMeta: { present: false },
  };
};

cases.map(testCase =>
  suite.add(testCase.name, () => {
    transformSource(testCase.fixture, freshOptions());
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
