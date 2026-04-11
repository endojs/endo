// @ts-check

import test from 'ava';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { parseBlocks } from '../src/parse-blocks.js';
import { renderBlocks } from '../src/render-dom.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesDir = path.join(__dirname, 'fixtures');
const mdDir = path.join(fixturesDir, 'md');
const htmlDir = path.join(fixturesDir, 'html');

/**
 * Render markdown text to an HTML string using happy-dom.
 *
 * @param {string} markdown
 * @returns {string}
 */
const renderToHTML = markdown => {
  const window = new Window();
  const doc = /** @type {Document} */ (/** @type {unknown} */ (window.document));
  const blocks = parseBlocks(markdown);
  const fragment = renderBlocks(blocks, { document: doc });
  // Serialize fragment to HTML via a wrapper div
  const wrapper = doc.createElement('div');
  wrapper.appendChild(/** @type {Node} */ (/** @type {unknown} */ (fragment)));
  return wrapper.innerHTML;
};

// Discover all .md fixture files
const mdFiles = fs
  .readdirSync(mdDir)
  .filter(f => f.endsWith('.md'))
  .sort();

for (const mdFile of mdFiles) {
  const name = mdFile.replace(/\.md$/, '');
  const htmlFile = `${name}.html`;

  test(`fixture: ${name}`, t => {
    const mdContent = fs.readFileSync(path.join(mdDir, mdFile), 'utf-8');
    const expectedPath = path.join(htmlDir, htmlFile);

    if (!fs.existsSync(expectedPath)) {
      t.fail(`Missing expected HTML fixture: ${htmlFile}`);
      return;
    }

    const expected = fs.readFileSync(expectedPath, 'utf-8').trim();
    const actual = renderToHTML(mdContent.trimEnd());

    t.is(actual, expected);
  });
}
