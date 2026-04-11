// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { parseBlocks } from '../src/parse-blocks.js';
import { renderBlocks } from '../src/render-dom.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mdDir = path.join(__dirname, 'fixtures', 'md');
const htmlDir = path.join(__dirname, 'fixtures', 'html');

/**
 * @param {string} markdown
 * @returns {string}
 */
const renderToHTML = markdown => {
  const window = new Window();
  const doc = /** @type {Document} */ (/** @type {unknown} */ (window.document));
  const blocks = parseBlocks(markdown);
  const fragment = renderBlocks(blocks, { document: doc });
  const wrapper = doc.createElement('div');
  wrapper.appendChild(/** @type {Node} */ (/** @type {unknown} */ (fragment)));
  return wrapper.innerHTML;
};

/** @type {Record<string, string>} */
const fixtures = {
  emphasis: [
    '*italic text*',
    '_also italic_',
    'This is *partially* emphasized.',
  ].join('\n'),

  bold: [
    '**bold text**',
    '__also bold__',
    'This is **partially** bolded.',
  ].join('\n'),

  'code-spans': [
    '`inline code`',
    '`` code with `backtick` ``',
    'Some `code` in text.',
  ].join('\n'),

  'code-fences': [
    '```',
    'plain code',
    '```',
    '',
    '```js',
    'const x = 1;',
    '```',
    '',
    '````',
    '```',
    'inner fence',
    '```',
    '````',
    '',
    '~~~',
    'tilde fence',
    '~~~',
  ].join('\n'),

  headings: [
    '# Heading 1',
    '## Heading 2',
    '### Heading 3',
    '#### Heading 4',
    '##### Heading 5',
    '###### Heading 6',
  ].join('\n'),

  lists: [
    '- item 1',
    '- item 2',
    '- item 3',
    '',
    '1. first',
    '2. second',
    '3. third',
  ].join('\n'),

  'nested-lists': [
    '- item 1',
    '  - sub a',
    '  - sub b',
    '- item 2',
    '  - sub c',
  ].join('\n'),

  tables: [
    '| Name | Age |',
    '|------|-----|',
    '| Alice | 30 |',
    '| Bob | 25 |',
    '',
    '| Left | Center | Right |',
    '|:-----|:------:|------:|',
    '| L | C | R |',
  ].join('\n'),

  links: [
    '[basic link](https://example.com)',
    '[titled link](https://example.com "Example")',
    '[**bold link**](https://example.com)',
  ].join('\n'),

  blockquotes: [
    '> This is a quote.',
    '',
    '> Multi-line',
    '> blockquote here.',
  ].join('\n'),

  'horizontal-rules': [
    'Above',
    '',
    '---',
    '',
    'Below',
    '',
    '***',
    '',
    'End',
  ].join('\n'),

  escapes: [
    '\\*not italic\\*',
    '\\**not bold\\**',
    '\\_not italic\\_',
    '\\~not struck\\~',
    '\\`not code\\`',
  ].join('\n'),

  nesting: [
    '**bold *and italic***',
    '*italic and **bold***',
    '~~struck **and bold**~~',
  ].join('\n'),

  boundaries: [
    'foo_bar_baz stays literal',
    'snake_case_name no emphasis',
    'a*b*c is emphasis (CommonMark)',
    '1*2*3 is emphasis',
    'path/to/file no italic',
    'https://example.com/path/here safe',
  ].join('\n'),

  mixed: [
    '# Title',
    '',
    'This is a **bold** and *italic* paragraph with `code`.',
    '',
    '- List item with **bold**',
    '- Another *item*',
    '',
    '> A blockquote with *emphasis*',
    '',
    '| Col 1 | Col 2 |',
    '|-------|-------|',
    '| **a** | *b* |',
    '',
    '---',
    '',
    '[A link](https://example.com) at the end.',
  ].join('\n'),
};

for (const [name, md] of Object.entries(fixtures)) {
  const mdPath = path.join(mdDir, `${name}.md`);
  const htmlPath = path.join(htmlDir, `${name}.html`);
  fs.writeFileSync(mdPath, md, 'utf-8');
  const html = renderToHTML(md);
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log(`Created: ${name}`);
}
