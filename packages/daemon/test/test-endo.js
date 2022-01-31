// @ts-check
/* global process */
import test from 'ava';
import url from 'url';
import path from 'path';
import { start, stop, restart, clean } from '../index.js';

const { raw } = String;

const dirname = url.fileURLToPath(new URL('.', import.meta.url)).toString();

const locator = {
  statePath: path.join(dirname, 'endo'),
  cachePath: dirname,
  sockPath:
    process.platform === 'win32'
      ? raw`\\?\pipe\endo-test.sock`
      : path.join(dirname, 'endo.sock'),
};

test.serial('lifecycle', async t => {
  await clean(locator);
  await start(locator);
  await stop(locator);
  await restart(locator);
  await stop(locator);
  t.pass();
});
