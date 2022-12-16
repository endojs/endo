import 'ses';
import fs from 'fs';
import url from 'url';
import { makeBundle } from '../index.js';
import { makeReadPowers } from '../node-powers.js';

const fixture = new URL(
  '../test/fixtures-0/node_modules/bundle/main.js',
  import.meta.url,
).toString();
const target = new URL('../dist/bu.js', import.meta.url).toString();

const readPowers = makeReadPowers({ fs, url });

const bundle = await makeBundle(readPowers.read, fixture);
fs.writeFileSync(url.fileURLToPath(target), bundle);
// fs.writeFileSync(url.fileURLToPath(`${target}.${Date.now()}`), bundle);

console.log(`
#######################
size: ${bundle.length}
`);

// eslint-disable-next-line no-undef
global.print = console.log;
import(target);
