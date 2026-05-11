// @ts-check

import harden from '@endo/harden';
import { marked, Renderer } from 'marked';
import { colorize } from './monaco-wrapper.js';

/**
 * Map common code-fence language tags to Monaco language identifiers.
 * Monaco accepts full names; short aliases need translation.
 *
 * @type {Record<string, string>}
 */
const FENCE_LANG_MAP = harden({
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  md: 'markdown',
  dockerfile: 'dockerfile',
});

/**
 * Resolve a code-fence language tag to a Monaco language identifier.
 *
 * @param {string} lang
 * @returns {string}
 */
const resolveLanguage = lang => {
  const lower = lang.toLowerCase();
  return FENCE_LANG_MAP[lower] || lower || 'plaintext';
};

/** Placeholder prefix used to mark code blocks for async replacement. */
const PLACEHOLDER = '\x00CODE_BLOCK_';

/**
 * Render a markdown source string to HTML with syntax-highlighted
 * code fences.
 *
 * Uses a two-pass approach: the synchronous marked pass inserts
 * placeholders for code blocks, then we colorize them all in
 * parallel and substitute the results.
 *
 * @param {string} source
 * @returns {Promise<string>}
 */
export const renderMarkdownToHtml = async source => {
  /** @type {Array<{lang: string, code: string}>} */
  const codeBlocks = [];

  const renderer = new Renderer();
  renderer.code = ({ text, lang }) => {
    const index = codeBlocks.length;
    codeBlocks.push({ lang: lang || '', code: text });
    return `${PLACEHOLDER}${index}\x00`;
  };

  const html = /** @type {string} */ (marked.parse(source, { renderer }));

  if (codeBlocks.length === 0) {
    return html;
  }

  // Colorize all code blocks in parallel.
  const highlighted = await Promise.all(
    codeBlocks.map(async ({ lang, code }) => {
      const monacoLang = resolveLanguage(lang);
      const colorized = await colorize(code, monacoLang);
      const langAttr = lang ? ` data-language="${lang}"` : '';
      return `<pre class="md-code-fence"><code${langAttr}>${colorized}</code></pre>`;
    }),
  );

  // Substitute placeholders with highlighted HTML.
  let result = html;
  for (let i = 0; i < highlighted.length; i += 1) {
    result = result.replace(`${PLACEHOLDER}${i}\x00`, highlighted[i]);
  }

  return result;
};
harden(renderMarkdownToHtml);

/**
 * Return whether a Monaco language identifier is markdown.
 *
 * @param {string} lang
 * @returns {boolean}
 */
export const isMarkdown = lang => lang === 'markdown';
harden(isMarkdown);
