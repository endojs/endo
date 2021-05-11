// This script regenerates app.agar, an archived application generated
// from the test fixtures.
// This should be done *manually*, *rarely* and *deliberately*.
// The checked-in archive exists to verify that the current archive importer
// can recognize an archive generated with a previous version.
// The archive may need to be regenerated if the test fixture and assertions
// have been changed.

import 'ses';
import fs from 'fs';
import { writeArchive } from '../src/main.js';

const fixture = new URL('node_modules/app/main.js', import.meta.url).toString();
const archiveFixture = new URL('app.agar', import.meta.url).toString();

const read = async location => fs.promises.readFile(new URL(location).pathname);
const write = async (location, data) =>
  fs.promises.writeFile(new URL(location).pathname, data);

writeArchive(write, read, archiveFixture, fixture);
