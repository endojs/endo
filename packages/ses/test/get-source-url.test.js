/* eslint max-depth: "off" */
import tap from 'tap';
import { getSourceURL } from '../src/get-source-url.js';

const { test } = tap;

test('getSourceURL', t => {
  t.plan(2 + 1 * 2 * 2 * 2 * 3 * 2);

  t.equal(getSourceURL(''), '<unknown>');
  t.equal(getSourceURL(`//@sourceURL=path/file.js`), 'path/file.js');

  for (const fileName of ['path/to/file.js']) {
    for (const [startComment, endComment] of [
      ['//', '\n'],
      ['/*', '*/'],
    ]) {
      for (const prefix of ['@', '#']) {
        for (const delimiter of ['', ' ']) {
          for (const header of ['', 'const ignoreMe = 10;', 'ignoreMe()\n\n']) {
            for (const footer of [
              '',
              delimiter +
                [
                  startComment,
                  prefix,
                  'sourceMapURL',
                  '=',
                  `${fileName}.json`,
                  endComment,
                ].join(delimiter),
            ]) {
              const source =
                header +
                [
                  startComment,
                  prefix,
                  'sourceURL',
                  '=',
                  fileName,
                  endComment,
                ].join(delimiter) +
                footer;
              t.equal(getSourceURL(source), fileName, JSON.stringify(source));
            }
          }
        }
      }
    }
  }
});
