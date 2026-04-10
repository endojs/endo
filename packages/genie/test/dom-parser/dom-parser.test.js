// @ts-check
import '@endo/init/debug.js';

import test from 'ava';
import { DOMParser } from '../../src/dom-parser/index.js';

test('parseFromString returns a DomDocument', t => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    '<html><body><p>hi</p></body></html>',
    'text/html',
  );
  t.truthy(doc);
  const p = doc.querySelector('p');
  t.is(p?.textContent, 'hi');
});

test('works with DuckDuckGo-like HTML', t => {
  const html = `
    <html>
    <body>
      <div class="results">
        <div class="result">
          <a class="result__a" href="https://example.com/1">Result One</a>
          <span class="result__snippet">Snippet for result one.</span>
        </div>
        <div class="result">
          <a class="result__a" href="https://example.com/2">Result Two</a>
          <span class="result__snippet">Snippet for result two.</span>
        </div>
        <div class="result">
          <a class="result__a" href="https://example.com/3">Result Three</a>
          <span class="result__snippet">Snippet for result three.</span>
        </div>
      </div>
    </body>
    </html>
  `;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const links = doc.querySelectorAll('.result__a');
  const snippets = doc.querySelectorAll('.result__snippet');

  t.is(links.length, 3);
  t.is(snippets.length, 3);

  t.is(links[0].textContent.trim(), 'Result One');
  t.is(links[0].href, 'https://example.com/1');
  t.is(snippets[0].textContent.trim(), 'Snippet for result one.');

  t.is(links[2].textContent.trim(), 'Result Three');
  t.is(links[2].href, 'https://example.com/3');
});

test('handles malformed HTML gracefully', t => {
  const parser = new DOMParser();
  // Missing closing tags.
  const doc = parser.parseFromString(
    '<div><p>unclosed<p>another',
    'text/html',
  );
  const ps = doc.querySelectorAll('p');
  t.is(ps.length, 2);
});

test('handles empty string', t => {
  const parser = new DOMParser();
  const doc = parser.parseFromString('', 'text/html');
  t.truthy(doc);
  t.is(doc.querySelectorAll('*').length, 0);
});

test('complex attribute selectors', t => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    '<div data-role="nav"><a data-role="link">L</a></div>',
    'text/html',
  );
  const results = doc.querySelectorAll('[data-role="link"]');
  t.is(results.length, 1);
  t.is(results[0].textContent, 'L');
});

test('children property returns only elements', t => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    '<div>text<span>child</span>more text<p>another</p></div>',
    'text/html',
  );
  const div = doc.querySelector('div');
  t.truthy(div);
  // children should only contain span and p, not text nodes.
  t.is(div?.children.length, 2);
  t.is(div?.children[0].tagName, 'span');
  t.is(div?.children[1].tagName, 'p');
});

test('classList.contains works', t => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    '<div class="foo bar baz"></div>',
    'text/html',
  );
  const div = doc.querySelector('div');
  t.truthy(div);
  t.true(div?.classList.contains('foo'));
  t.true(div?.classList.contains('bar'));
  t.true(div?.classList.contains('baz'));
  t.false(div?.classList.contains('qux'));
});
