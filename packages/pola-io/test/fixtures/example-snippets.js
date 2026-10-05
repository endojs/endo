import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const paths = {
  cmdRunner: require.resolve('./cmd-runner-example.js'),
  readonlyFile: require.resolve('./readonly-file-example.js'),
};

const loadExample = async path => {
  const text = await readFile(path, 'utf-8');
  return text.replace(/\/\/ eslint.*\n/, '').trim();
};

await null;

export const cmdRunnerExample = await loadExample(paths.cmdRunner);

export const readonlyFileExample = await loadExample(paths.readonlyFile);
