// @ts-check
import '../setup.js';

import test from 'ava';
import { buildDocument } from '../../src/dom-parser/document.js';

test('basic structure', t => {
  const doc = buildDocument('<html><head></head><body></body></html>');
  t.truthy(doc.documentElement);
  t.is(doc.documentElement?.tagName, 'html');
  t.truthy(doc.head);
  t.truthy(doc.body);
});

test('textContent aggregation', t => {
  const doc = buildDocument(
    '<div><span>hello</span> <span>world</span></div>',
  );
  const div = doc.querySelector('div');
  t.truthy(div);
  t.is(div?.textContent, 'hello world');
});

test('nested textContent', t => {
  const doc = buildDocument(
    '<div><p>one</p><p>two<span> three</span></p></div>',
  );
  const div = doc.querySelector('div');
  t.is(div?.textContent, 'onetwo three');
});

test('getAttribute', t => {
  const doc = buildDocument(
    '<a href="https://example.com" title="Example">link</a>',
  );
  const a = doc.querySelector('a');
  t.truthy(a);
  t.is(a?.getAttribute('href'), 'https://example.com');
  t.is(a?.getAttribute('title'), 'Example');
  t.is(a?.getAttribute('nonexistent'), null);
});

test('href property shortcut', t => {
  const doc = buildDocument('<a href="https://example.com">link</a>');
  const a = doc.querySelector('a');
  t.is(a?.href, 'https://example.com');
});

test('id and className properties', t => {
  const doc = buildDocument(
    '<div id="main" class="container wide"></div>',
  );
  const div = doc.querySelector('div');
  t.is(div?.id, 'main');
  t.is(div?.className, 'container wide');
});

test('getElementsByTagName', t => {
  const doc = buildDocument(
    '<div><p>A</p><p>B</p><span>C</span></div>',
  );
  const ps = doc.getElementsByTagName('p');
  t.is(ps.length, 2);
});

test('getElementsByClassName', t => {
  const doc = buildDocument(
    '<div><p class="item">A</p><p class="item">B</p><p>C</p></div>',
  );
  const items = doc.getElementsByClassName('item');
  t.is(items.length, 2);
});

test('getElementById', t => {
  const doc = buildDocument('<div><p id="target">Found</p></div>');
  const el = doc.getElementById('target');
  t.truthy(el);
  t.is(el?.textContent, 'Found');
});
