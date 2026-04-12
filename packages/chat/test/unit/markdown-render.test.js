// @ts-check

import '@endo/init/debug.js';

import test from 'ava';
import { createDOM } from '../helpers/dom-setup.js';
import {
  renderMarkdown,
  renderPlainText,
  prepareTextWithPlaceholders,
} from '../../markdown-render.js';

const { cleanup: cleanupDOM } = createDOM();

// ============ prepareTextWithPlaceholders tests ============

test('prepareTextWithPlaceholders with empty array', t => {
  const result = prepareTextWithPlaceholders([]);
  t.is(result, '');
});

test('prepareTextWithPlaceholders with single string', t => {
  const result = prepareTextWithPlaceholders(['Hello world']);
  t.is(result, 'Hello world');
});

test('prepareTextWithPlaceholders with multiple strings', t => {
  const result = prepareTextWithPlaceholders(['Hello ', ' world']);
  // Should insert placeholder character between
  t.is(result.length, 'Hello '.length + 1 + ' world'.length);
  t.true(result.includes('\uE000'));
});

test('prepareTextWithPlaceholders with three strings', t => {
  const result = prepareTextWithPlaceholders(['a', 'b', 'c']);
  // Two placeholder characters
  const placeholderCount = (result.match(/\uE000/g) || []).length;
  t.is(placeholderCount, 2);
});

// ============ renderPlainText tests ============

test('renderPlainText returns fragment and insertion points', t => {
  const result = renderPlainText('Hello world');
  t.truthy(result.fragment);
  t.true(Array.isArray(result.insertionPoints));
});

test('renderPlainText handles simple text', t => {
  const result = renderPlainText('Hello world');
  t.is(result.insertionPoints.length, 0);
  t.is(result.fragment.textContent, 'Hello world');
});

test('renderPlainText handles text with placeholder', t => {
  const text = prepareTextWithPlaceholders(['Hello ', '!']);
  const result = renderPlainText(text);
  t.is(result.insertionPoints.length, 1);
  t.is(result.insertionPoints[0].className, 'md-chip-slot');
});

test('renderPlainText handles multiple placeholders', t => {
  const text = prepareTextWithPlaceholders(['a', 'b', 'c']);
  const result = renderPlainText(text);
  t.is(result.insertionPoints.length, 2);
});

test('renderPlainText preserves inline code', t => {
  const result = renderPlainText('Use `code` here');
  const codeEl = result.fragment.querySelector('code');
  t.truthy(codeEl);
  t.is(codeEl?.textContent, 'code');
  t.is(codeEl?.className, 'inline-code');
});

test('renderPlainText handles emphasis (CommonMark)', t => {
  const result = renderPlainText('This is *italic* text');
  const em = result.fragment.querySelector('em');
  t.truthy(em);
  t.is(em?.textContent, 'italic');
});

test('renderPlainText handles strong (CommonMark)', t => {
  const result = renderPlainText('This is **bold** text');
  const strong = result.fragment.querySelector('strong');
  t.truthy(strong);
  t.is(strong?.textContent, 'bold');
});

test('renderPlainText handles strikethrough', t => {
  const result = renderPlainText('This is ~struck~ text');
  const s = result.fragment.querySelector('s');
  t.truthy(s);
  t.is(s?.textContent, 'struck');
});

test('renderPlainText handles newlines', t => {
  const result = renderPlainText('Line 1\nLine 2');
  const brs = result.fragment.querySelectorAll('br');
  t.is(brs.length, 1);
});

// ============ renderMarkdown tests ============

test('renderMarkdown returns fragment and insertion points', t => {
  const result = renderMarkdown('# Hello');
  t.truthy(result.fragment);
  t.true(Array.isArray(result.insertionPoints));
});

test('renderMarkdown handles heading level 1', t => {
  const result = renderMarkdown('# Heading');
  const h1 = result.fragment.querySelector('h1');
  t.truthy(h1);
  t.is(h1?.textContent, 'Heading');
  t.true(h1?.className.includes('md-heading'));
});

test('renderMarkdown handles heading levels 2-6', t => {
  for (let level = 2; level <= 6; level += 1) {
    const markdown = `${'#'.repeat(level)} Heading ${level}`;
    const result = renderMarkdown(markdown);
    const heading = result.fragment.querySelector(`h${level}`);
    t.truthy(heading, `h${level} should exist`);
    t.is(heading?.textContent, `Heading ${level}`);
  }
});

test('renderMarkdown handles paragraphs', t => {
  const result = renderMarkdown('This is a paragraph.');
  const p = result.fragment.querySelector('p');
  t.truthy(p);
  t.is(p?.textContent, 'This is a paragraph.');
  t.true(p?.className.includes('md-paragraph'));
});

test('renderMarkdown handles code fence', t => {
  const result = renderMarkdown('```\ncode here\n```');
  const pre = result.fragment.querySelector('pre');
  t.truthy(pre);
  t.true(pre?.className.includes('md-code-fence'));
  const code = pre?.querySelector('code');
  t.truthy(code);
  t.is(code?.textContent, 'code here');
});

test('renderMarkdown handles code fence with language', t => {
  const result = renderMarkdown('```js\nconst x = 1;\n```');
  const pre = result.fragment.querySelector('pre');
  const langLabel = pre?.querySelector('.md-code-fence-language');
  t.truthy(langLabel);
  t.is(langLabel?.textContent, 'js');
  const code = pre?.querySelector('code');
  t.is(code?.className, 'language-js');
});

test('renderMarkdown handles unordered list', t => {
  const result = renderMarkdown('- Item 1\n- Item 2\n- Item 3');
  const ul = result.fragment.querySelector('ul');
  t.truthy(ul);
  t.true(ul?.className.includes('md-list'));
  const items = ul?.querySelectorAll('li');
  t.is(items?.length, 3);
});

test('renderMarkdown handles ordered list', t => {
  const result = renderMarkdown('1. First\n2. Second\n3. Third');
  const ol = result.fragment.querySelector('ol');
  t.truthy(ol);
  const items = ol?.querySelectorAll('li');
  t.is(items?.length, 3);
});

test('renderMarkdown handles tables', t => {
  const result = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |');
  const table = result.fragment.querySelector('table');
  t.truthy(table);
  t.true(table?.className.includes('md-table'));
  const th = table?.querySelectorAll('th');
  t.is(th?.length, 2);
  const td = table?.querySelectorAll('td');
  t.is(td?.length, 2);
});

test('renderMarkdown handles blockquotes', t => {
  const result = renderMarkdown('> Quoted text');
  const bq = result.fragment.querySelector('blockquote');
  t.truthy(bq);
  t.true(bq?.className.includes('md-blockquote'));
});

test('renderMarkdown handles horizontal rules', t => {
  const result = renderMarkdown('Above\n\n---\n\nBelow');
  const hr = result.fragment.querySelector('hr');
  t.truthy(hr);
  t.true(hr?.className.includes('md-rule'));
});

test('renderMarkdown handles links', t => {
  const result = renderMarkdown('[click](https://example.com)');
  const link = result.fragment.querySelector('a');
  t.truthy(link);
  t.is(link?.getAttribute('href'), 'https://example.com');
  t.is(link?.getAttribute('target'), '_blank');
  t.is(link?.getAttribute('rel'), 'noopener noreferrer');
  t.is(link?.textContent, 'click');
});

test('renderMarkdown handles mixed content', t => {
  const markdown = `# Title

This is a paragraph with **bold** and *italic*.

- List item 1
- List item 2

\`\`\`js
const x = 1;
\`\`\`
`;
  const result = renderMarkdown(markdown);
  t.truthy(result.fragment.querySelector('h1'));
  t.truthy(result.fragment.querySelector('p'));
  t.truthy(result.fragment.querySelector('ul'));
  t.truthy(result.fragment.querySelector('pre'));
});

test('renderMarkdown handles placeholders in text', t => {
  const text = prepareTextWithPlaceholders(['Hello ', '!']);
  const result = renderMarkdown(text);
  t.is(result.insertionPoints.length, 1);
});

test('renderMarkdown handles inline formatting in headings', t => {
  const result = renderMarkdown('# **Bold** heading');
  const h1 = result.fragment.querySelector('h1');
  const strong = h1?.querySelector('strong');
  t.truthy(strong);
  t.is(strong?.textContent, 'Bold');
});

test('renderMarkdown handles inline formatting in list items', t => {
  const result = renderMarkdown('- **Bold** item\n- *Italic* item');
  const items = result.fragment.querySelectorAll('li');
  const strong = items[0]?.querySelector('strong');
  const em = items[1]?.querySelector('em');
  t.truthy(strong);
  t.truthy(em);
});

test.after(() => {
  cleanupDOM();
});
