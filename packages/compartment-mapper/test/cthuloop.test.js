import 'ses';
import test from 'ava';
import { readPowers } from './scaffold.js';
import { loadLocation, makeArchive, parseArchive } from '../index.js';

const fixture = new URL(
  'fixtures-cthuloops/main.js',
  import.meta.url,
).toString();

test('load unrunnable program (infinite loop)', async t => {
  await loadLocation(readPowers, fixture, {});
  t.pass();
});

test('archive unrunnable program (infinite loop)', async t => {
  const archive = await makeArchive(readPowers, fixture, {});
  await parseArchive(archive);
  t.pass();
});
