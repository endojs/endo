/**
 * test262/main.js
 * This test executes all tests found in the root test262/test
 * directory, except tests designated to be skipped by path or
 * by the description in their front matter.
 */
import { tameFunctionConstructors } from '@agoric/tame-function-constructors';
import { getRootPath, getJSFiles } from './file';
import { processTest } from './processor';

/**
 * Main.
 */
(async () => {
  tameFunctionConstructors();

  const rootPath = getRootPath();
  for await (const filePath of getJSFiles(rootPath)) {
    processTest(filePath);
  }
})();
