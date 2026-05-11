// @ts-check
import '@endo/init/debug.js';

import test from 'ava';
import { parseSelector } from '../../src/dom-parser/selector.js';

test('tag selector', t => {
  const groups = parseSelector('div');
  t.is(groups.length, 1);
  t.is(groups[0].length, 1);
  t.is(groups[0][0].simple.tag, 'div');
});

test('class selector', t => {
  const groups = parseSelector('.foo');
  t.is(groups[0][0].simple.classes.length, 1);
  t.is(groups[0][0].simple.classes[0], 'foo');
});

test('id selector', t => {
  const groups = parseSelector('#bar');
  t.is(groups[0][0].simple.id, 'bar');
});

test('compound tag.class', t => {
  const groups = parseSelector('div.active');
  t.is(groups[0][0].simple.tag, 'div');
  t.is(groups[0][0].simple.classes[0], 'active');
});

test('multiple classes', t => {
  const groups = parseSelector('.a.b.c');
  t.deepEqual(groups[0][0].simple.classes, ['a', 'b', 'c']);
});

test('descendant combinator', t => {
  const groups = parseSelector('.parent .child');
  t.is(groups[0].length, 2);
  t.is(groups[0][0].simple.classes[0], 'parent');
  t.is(groups[0][1].simple.classes[0], 'child');
  t.is(groups[0][1].combinator, ' ');
});

test('child combinator', t => {
  const groups = parseSelector('.parent > .child');
  t.is(groups[0].length, 2);
  t.is(groups[0][1].combinator, '>');
});

test('comma separated', t => {
  const groups = parseSelector('.a, .b');
  t.is(groups.length, 2);
  t.is(groups[0][0].simple.classes[0], 'a');
  t.is(groups[1][0].simple.classes[0], 'b');
});

test('attribute presence', t => {
  const groups = parseSelector('[disabled]');
  t.is(groups[0][0].simple.attrs.length, 1);
  t.is(groups[0][0].simple.attrs[0].name, 'disabled');
});

test('attribute value', t => {
  const groups = parseSelector('[type="text"]');
  t.is(groups[0][0].simple.attrs[0].name, 'type');
  t.is(groups[0][0].simple.attrs[0].op, '=');
  t.is(groups[0][0].simple.attrs[0].value, 'text');
});

test('deep descendant chain', t => {
  const groups = parseSelector('.some .typical .selectors');
  t.is(groups[0].length, 3);
  t.is(groups[0][0].simple.classes[0], 'some');
  t.is(groups[0][1].simple.classes[0], 'typical');
  t.is(groups[0][2].simple.classes[0], 'selectors');
});
