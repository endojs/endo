// @ts-nocheck - vnode-tree unit test
import '@endo/init/debug.js';

import test from 'ava';
import {
  colorizedHtmlToVnodes,
  CodeFenceColorizer,
} from '@endo/spaces-util/code-fence.js';
import { markdownToVnodes } from '@endo/spaces-util/markdown-vnodes.js';

// A fake colorizer standing in for Monaco's async `colorize`. Tests never load
// Monaco; they only assert the wiring and the HTML→vnode parser.
const fakeColorize = async () => '';

/**
 * Find the `<code>` vnode inside a `<pre class="md-code-fence">` fence vnode.
 *
 * @param {any} fence
 */
const codeOf = fence => {
  const kids = [].concat(fence.props.children);
  return kids.find(child => child && child.type === 'code');
};

test('colorizedHtmlToVnodes: parses Monaco token spans into vnodes', t => {
  const html =
    '<span class="mtk1">const</span><span class="mtk1"> </span>' +
    '<span class="mtk5">x</span><br/><span class="mtk6">42</span>';
  const out = colorizedHtmlToVnodes(html);
  t.true(Array.isArray(out));
  // Four token spans + one newline string.
  const spans = out.filter(n => n && n.type === 'span');
  t.is(spans.length, 4);
  t.is(spans[0].props.class, 'mtk1');
  t.is(spans[0].props.children, 'const');
  t.is(spans[2].props.class, 'mtk5');
  t.is(spans[2].props.children, 'x');
  // The <br/> became a literal newline (preserved by <pre>).
  t.true(out.includes('\n'));
});

test('colorizedHtmlToVnodes: handles Monaco classless per-line wrapper spans', t => {
  // Real `monaco.editor.colorize` output nests each line's tokens inside a
  // classless wrapper span. The classless `<span>` open must be recognised as a
  // tag, not leak its `span>` text through the plain-text fallback.
  const html =
    '<span><span class="mtk12">const</span><span class="mtk1"> x </span>' +
    '<span class="mtk10">=</span></span><br/><span><span></span></span><br/>';
  const out = colorizedHtmlToVnodes(html);
  t.true(Array.isArray(out));
  // No stray "span>" (or any other markup) leaks as plain text.
  t.false(
    out.some(n => typeof n === 'string' && n.includes('span')),
    'classless wrapper span must not leak as text',
  );
  const spans = out.filter(n => n && n.type === 'span');
  t.is(spans.length, 3);
  t.is(spans[0].props.class, 'mtk12');
  t.is(spans[0].props.children, 'const');
  t.is(spans[1].props.class, 'mtk1');
  t.is(spans[1].props.children, ' x ');
  t.is(spans[2].props.class, 'mtk10');
  t.is(spans[2].props.children, '=');
});

test('colorizedHtmlToVnodes: decodes HTML entities in token text', t => {
  const html = '<span class="mtk1">a &lt; b &amp;&amp; c &#39;d&#39;</span>';
  const [span] = colorizedHtmlToVnodes(html);
  t.is(span.props.children, "a < b && c 'd'");
});

test('colorizedHtmlToVnodes: returns null for input with no token spans', t => {
  t.is(colorizedHtmlToVnodes('just plain text'), null);
  t.is(colorizedHtmlToVnodes(''), null);
  t.is(colorizedHtmlToVnodes(undefined), null);
});

test('markdownToVnodes: fence with colorize + language wraps a CodeFenceColorizer', t => {
  const { nodes } = markdownToVnodes('```js\nconst x = 1;\n```', {
    colorize: fakeColorize,
  });
  const fence = nodes.find(n => n && n.type === 'pre');
  t.is(fence.props.class, 'md-code-fence');
  const code = codeOf(fence);
  // The code element's child is the async colorizer component, not raw text.
  t.is(code.props.children.type, CodeFenceColorizer);
  t.is(code.props.children.props.language, 'js');
});

test('markdownToVnodes: no colorize → fence stays plain text', t => {
  const { nodes } = markdownToVnodes('```js\nconst x = 1;\n```');
  const code = codeOf(nodes.find(n => n && n.type === 'pre'));
  // Plain branch: children are the raw source string(s), no component vnode.
  const kids = [].concat(code.props.children);
  t.false(kids.some(k => k && k.type === CodeFenceColorizer));
  t.true(kids.some(k => typeof k === 'string' && k.includes('const x = 1;')));
});

test('markdownToVnodes: fence with no language stays plain even with colorize', t => {
  const { nodes } = markdownToVnodes('```\nplain\n```', {
    colorize: fakeColorize,
  });
  const code = codeOf(nodes.find(n => n && n.type === 'pre'));
  const kids = [].concat(code.props.children);
  t.false(kids.some(k => k && k.type === CodeFenceColorizer));
});
