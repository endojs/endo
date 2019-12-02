import fs from 'fs';
import path from 'path';
// eslint-disable-next-line import/no-extraneous-dependencies
import test262Parser from 'test262-parser';
import {
  excludePaths,
  relativeTestRootPath,
  relativeTestHarnessPath,
} from './configuration';

export function getRootPath() {
  return path.join(__dirname, relativeTestRootPath);
}

export function getHarnessPath() {
  return path.join(__dirname, relativeTestHarnessPath);
}

/**
 * Recursively find all *.js files in a directory tree.
 */
export async function* getJSFiles(dir) {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* getJSFiles(res);
    } else if (dirent.isFile() && dirent.name.endsWith('.js')) {
      yield res;
    }
  }
}

/**
 * Read a test file and return the parsed front matter.
 */
export function readTestInfo(testPath) {
  const rootPath = getRootPath();
  const filePath = path.join(rootPath, testPath);
  const contents = fs.readFileSync(filePath, 'utf-8');
  const file = { contents };
  test262Parser.parseFile(file);
  return { contents, ...file.attrs };
}

/**
 * Given the relative path to a test, return true if the test must
 * be skiped because it contains a blacklisted path segment. We use
 * the relative path to avoid a false positive on the root path.
 */
export function hasExcludedPath(filePath) {
  if (typeof filePath === 'string') {
    if (excludePaths.some(exclude => filePath.includes(exclude))) {
      return true;
    }
  }
  return false;
}

/**
 * Read a test file and return the parsed front matter.
 */
export function readTestInclude(include) {
  const harnessPath = getHarnessPath();
  const filePath = path.join(harnessPath, include);
  const contents = fs.readFileSync(filePath, 'utf-8');
  return contents;
}
