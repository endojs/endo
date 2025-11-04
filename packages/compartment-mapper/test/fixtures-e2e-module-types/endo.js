import 'ses';
import fs from 'fs';
import url from 'url';
import { importLocation } from '../../src/import.js';
import { makeReadPowers } from '../../src/node-powers.js';

const readPowers = makeReadPowers({ fs, url });
const { read } = readPowers;

const arg1 = process.argv[2];

const location = new URL(arg1, import.meta.url).toString();

importLocation(read, location, {
  globals: { console },
});

