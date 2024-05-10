/* global process */
import fs from 'fs';
import path from 'path';

const { raw } = String;

/** @param {string} dirname */
const makeConfig = (dirname) => {
  return {
    statePath: path.join(dirname, 'state'),
    ephemeralStatePath: path.join(dirname, 'run'),
    cachePath: path.join(dirname, 'cache'),
    sockPath:
      process.platform === 'win32'
        ? raw`\\?\pipe\endo-${root.join('-')}-test.sock`
        : path.join(dirname, 'endo.sock'),
    pets: new Map(),
    values: new Map(),
  };
};

export const makeNamespace = async ({ dirname }) => {
  const config = makeConfig(dirname);
  const {
    statePath,
    ephemeralStatePath,
    cachePath,
    sockPath,
  } = config;
  const envFileContent = [
    `ENDO_STATE=${statePath}`,
    `ENDO_TEMP_STATE=${ephemeralStatePath}`,
    `ENDO_CACHE=${cachePath}`,
    `ENDO_SOCK=${sockPath}`,
  ].join('\n');
  await fs.promises.writeFile('.env', envFileContent);
  console.log('Namespace created.');
};
