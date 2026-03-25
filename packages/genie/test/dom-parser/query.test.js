// @ts-check
import '../setup.js';

import test from 'ava';
import { buildDocument } from '../../src/dom-parser/document.js';

test('querySelectorAll: class selector', t => {
  const doc = buildDocument(`
    <div>
      <p class="result__a">First</p>
      <p class="result__a">Second</p>
      <p class="other">Third</p>
    </div>
  `);
  const results = doc.querySelectorAll('.result__a');
  t.is(results.length, 2);
  t.is(results[0].textContent, 'First');
  t.is(results[1].textContent, 'Second');
});

test('querySelectorAll: tag selector', t => {
  const doc = buildDocument(
    '<div><span>A</span><span>B</span><p>C</p></div>',
  );
  const spans = doc.querySelectorAll('span');
  t.is(spans.length, 2);
});

test('querySelectorAll: id selector', t => {
  const doc = buildDocument(
    '<div><p id="unique">Found</p><p>Not</p></div>',
  );
  const results = doc.querySelectorAll('#unique');
  t.is(results.length, 1);
  t.is(results[0].textContent, 'Found');
});

test('querySelectorAll: descendant selector', t => {
  const doc = buildDocument(`
    <div class="container">
      <div class="inner">
        <span class="target">Hit</span>
      </div>
    </div>
    <span class="target">Miss (not in container)</span>
  `);
  const results = doc.querySelectorAll('.container .target');
  t.is(results.length, 1);
  t.is(results[0].textContent, 'Hit');
});

test('querySelectorAll: child combinator', t => {
  const doc = buildDocument(`
    <div class="parent">
      <span class="child">Direct</span>
      <div><span class="child">Nested</span></div>
    </div>
  `);
  const results = doc.querySelectorAll('.parent > .child');
  t.is(results.length, 1);
  t.is(results[0].textContent, 'Direct');
});

test('querySelectorAll: compound tag.class', t => {
  const doc = buildDocument(`
    <div class="item">DIV</div>
    <span class="item">SPAN</span>
  `);
  const results = doc.querySelectorAll('div.item');
  t.is(results.length, 1);
  t.is(results[0].textContent, 'DIV');
});

test('querySelectorAll: multiple classes', t => {
  const doc = buildDocument(`
    <div class="a b">Both</div>
    <div class="a">Only A</div>
    <div class="b">Only B</div>
  `);
  const results = doc.querySelectorAll('.a.b');
  t.is(results.length, 1);
  t.is(results[0].textContent, 'Both');
});

test('querySelectorAll: comma-separated selectors', t => {
  const doc = buildDocument(`
    <div class="alpha">A</div>
    <div class="beta">B</div>
    <div class="gamma">C</div>
  `);
  const results = doc.querySelectorAll('.alpha, .beta');
  t.is(results.length, 2);
});

test('querySelectorAll: attribute selector [attr=value]', t => {
  const doc = buildDocument(`
    <input type="text" />
    <input type="checkbox" />
  `);
  const results = doc.querySelectorAll('[type="text"]');
  t.is(results.length, 1);
});

test('querySelector: returns first match', t => {
  const doc = buildDocument('<div><p>A</p><p>B</p></div>');
  const p = doc.querySelector('p');
  t.truthy(p);
  t.is(p?.textContent, 'A');
});

test('querySelector: returns null when no match', t => {
  const doc = buildDocument('<div></div>');
  const result = doc.querySelector('.nonexistent');
  t.is(result, null);
});

test('querySelectorAll: deep descendant chain', t => {
  const doc = buildDocument(`
    <div class="some">
      <div class="typical">
        <span class="selectors">Found</span>
      </div>
    </div>
    <div class="typical">
      <span class="selectors">Not in .some</span>
    </div>
  `);
  const results = doc.querySelectorAll('.some .typical .selectors');
  t.is(results.length, 1);
  t.is(results[0].textContent, 'Found');
});

test('querySelectorAll: document order preserved', t => {
  const doc = buildDocument(`
    <div><span class="x">1</span></div>
    <div><span class="x">2</span></div>
    <div><span class="x">3</span></div>
  `);
  const results = doc.querySelectorAll('.x');
  t.is(results.length, 3);
  t.is(results[0].textContent, '1');
  t.is(results[1].textContent, '2');
  t.is(results[2].textContent, '3');
});

test('querySelectorAll: scoped from element', t => {
  const doc = buildDocument(`
    <div class="a"><span class="item">1</span></div>
    <div class="b"><span class="item">2</span></div>
  `);
  const divA = doc.querySelector('.a');
  t.truthy(divA);
  const items = divA?.querySelectorAll('.item') || [];
  t.is(items.length, 1);
  t.is(items[0].textContent, '1');
});
