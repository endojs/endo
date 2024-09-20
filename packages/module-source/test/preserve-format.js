import url from 'url';
import fs from 'fs';
import { ModuleSource } from '../src/module-source.js';
import './lockdown.js';

function readFixture(filename) {
  return fs.readFileSync(
    url.fileURLToPath(new URL(filename, import.meta.url)),
    'utf-8',
  );
}

const { __syncModuleProgram__ } = new ModuleSource(
  readFixture('fixtures/preserve-format.js'),
);
console.error(__syncModuleProgram__);
