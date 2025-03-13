import url from 'url';
import fs from 'fs';
import test from 'ava';
import { ModuleSource } from '../src/module-source.js';
import './_lockdown.js';

function readFixture(filename) {
  return fs.readFileSync(
    url.fileURLToPath(new URL(filename, import.meta.url)),
    'utf-8',
  );
}

test('preserves formatting', t => {
  const { __syncModuleProgram__: actual } = new ModuleSource(
    readFixture('fixtures/preserve-format.js'),
  );
  const expected = readFixture('fixtures/format-preserved.txt');
  t.is(actual, expected);
});
