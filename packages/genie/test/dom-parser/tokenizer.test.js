// @ts-check
import '../setup.js';

import test from 'ava';
import { tokenize } from '../../src/dom-parser/tokenizer.js';

/** @typedef {import('../../src/dom-parser/tokenizer.js').OpenToken} OpenToken */
/** @typedef {import('../../src/dom-parser/tokenizer.js').TextToken} TextToken */
/** @typedef {import('../../src/dom-parser/tokenizer.js').CloseToken} CloseToken */

test('simple open and close tags', t => {
  const tokens = tokenize('<div></div>');
  t.is(tokens.length, 2);
  t.deepEqual(tokens[0], {
    type: 'open',
    tag: 'div',
    attrs: {},
    selfClosing: false,
  });
  t.deepEqual(tokens[1], { type: 'close', tag: 'div' });
});

test('text nodes', t => {
  const tokens = tokenize('<p>hello world</p>');
  t.is(tokens.length, 3);
  t.is(tokens[1].type, 'text');
  t.is(/** @type {TextToken} */ (tokens[1]).data, 'hello world');
});

test('attributes with quotes', t => {
  const tokens = tokenize(
    '<a href="https://example.com" class="link">click</a>',
  );
  t.is(tokens[0].type, 'open');
  const open = /** @type {OpenToken} */ (tokens[0]);
  t.is(open.attrs.href, 'https://example.com');
  t.is(open.attrs.class, 'link');
});

test('void elements auto-close', t => {
  const tokens = tokenize('<br><img src="x.png">');
  // br: open + close, img: open + close
  t.is(tokens.length, 4);
  t.is(tokens[0].type, 'open');
  t.is(tokens[1].type, 'close');
  t.is(/** @type {CloseToken} */ (tokens[1]).tag, 'br');
  t.is(tokens[2].type, 'open');
  t.is(tokens[3].type, 'close');
  t.is(/** @type {CloseToken} */ (tokens[3]).tag, 'img');
});

test('self-closing tags', t => {
  const tokens = tokenize('<input type="text" />');
  t.is(tokens.length, 2);
  const open = /** @type {OpenToken} */ (tokens[0]);
  t.is(open.selfClosing, true);
  t.is(open.attrs.type, 'text');
});

test('HTML entities are decoded', t => {
  const tokens = tokenize('<p>&amp; &lt; &gt; &quot;</p>');
  const text = /** @type {TextToken} */ (tokens[1]);
  t.is(text.data, '& < > "');
});

test('numeric entities', t => {
  const tokens = tokenize('<p>&#65; &#x42;</p>');
  const text = /** @type {TextToken} */ (tokens[1]);
  t.is(text.data, 'A B');
});

test('comments are skipped', t => {
  const tokens = tokenize('<div><!-- comment --><p>text</p></div>');
  // div open, p open, text, p close, div close
  t.is(tokens.length, 5);
  t.is(tokens[0].type, 'open');
  t.is(tokens[1].type, 'open');
});

test('script raw text', t => {
  const tokens = tokenize('<script>var x = "<div>";</script>');
  const textTokens = tokens.filter(tk => tk.type === 'text');
  t.is(textTokens.length, 1);
  t.is(/** @type {TextToken} */ (textTokens[0]).data, 'var x = "<div>";');
});

test('doctype is skipped', t => {
  const tokens = tokenize('<!DOCTYPE html><html></html>');
  t.is(tokens[0].type, 'open');
  t.is(/** @type {OpenToken} */ (tokens[0]).tag, 'html');
});

test('nested tags', t => {
  const tokens = tokenize('<div><span>a</span><span>b</span></div>');
  // div-open, span-open, text-a, span-close, span-open, text-b, span-close, div-close = 8
  t.is(tokens.length, 8);
});
