import fs from 'fs';
import path from 'path';
import url from 'url';
import test262Parser from 'test262-parser';

// eslint-disable-next-line no-underscore-dangle
const __filename = url.fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(__filename);

/*
 * The full path to the harness directory.
 */
export function getAbsolutePath(...segments) {
  return path.join(__dirname, ...segments);
}

/*
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

/*
 * Read a test file and return the parsed front matter.
 */
export function readTestInfo({ rootPath }, filePath) {
  const contents = fs.readFileSync(filePath, 'utf-8');

  const file = { contents };
  test262Parser.parseFile(file);

  const fileUrl = `file://${filePath}`;
  const rootUrl = `file://${rootPath}`;
  const relativePath = filePath.replace(rootPath, '.');
  const displayPath = relativePath.replace('./', '');

  return {
    contents,
    fileUrl,
    filePath,
    rootPath,
    rootUrl,
    relativePath,
    displayPath,
    ...file.attrs,
  };
}
