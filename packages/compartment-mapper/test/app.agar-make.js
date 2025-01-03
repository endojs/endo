// @ts-nocheck
// This script regenerates app.agar, an archived application generated
// from the test fixtures.
// This should be done *manually*, *rarely* and *deliberately*.
// The checked-in archive exists to verify that the current archive importer
// can recognize an archive generated with a previous version.
// The archive may need to be regenerated if the test fixture and assertions
// have been changed.

/* global process */

import 'ses';
import fs from 'fs';
import crypto from 'crypto';
import url from 'url';
import { writeArchive } from '../archive.js';
import { makeReadPowers, makeWritePowers } from '../src/node-powers.js';

const readPowers = makeReadPowers({ fs, crypto, url });
const { write } = makeWritePowers({ fs, url });

const fixture = new URL(
  'fixtures-0/node_modules/app/main.js',
  import.meta.url,
).toString();
const archiveFixture = new URL('app.agar', import.meta.url).toString();

const mitt = err =>
  process.nextTick(() => {
    throw err;
  });

writeArchive(write, readPowers, archiveFixture, fixture, {
  conditions: new Set(['development']),
  modules: {
    builtin: true,
  },
}).catch(mitt);
