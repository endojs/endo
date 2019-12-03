/**
 * test262/main.js
 * This test executes all tests found in the root test262/test
 * directory, except tests designated to be skipped by path or
 * by the description in their front matter.
 */
import { getRootPath, getJSFiles } from './file';
import { processTest } from './processor';
import { repairFunctionConstructors } from '../../example/repairFunctionConstructors';

/**
 * Main.
 */
(async () => {
  repairFunctionConstructors();

  const rootPath = getRootPath();
  for await (const filePath of getJSFiles(rootPath)) {
    processTest(filePath);
  }
})();
