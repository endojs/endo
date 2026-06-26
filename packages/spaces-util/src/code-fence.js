// @ts-check

/** @import { VNode } from 'preact' */

import harden from '@endo/harden';

import { Fragment, h } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/**
 * Decode the small set of HTML entities Monaco's `colorize` emits in token
 * text. The output is machine-generated (Monaco escapes the source it
 * tokenizes), so this handles exactly that set plus numeric escapes — it is a
 * decoder for trusted, structured output, not a general-purpose HTML parser.
 *
 * @param {string} text
 * @returns {string}
 */
const decodeEntities = text =>
  text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    switch (body) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      case 'nbsp':
        return ' ';
      default: {
        if (body[0] === '#') {
          const isHex = body[1] === 'x' || body[1] === 'X';
          const code = Number.parseInt(
            body.slice(isHex ? 2 : 1),
            isHex ? 16 : 10,
          );
          if (Number.isFinite(code)) {
            return String.fromCodePoint(code);
          }
        }
        return whole;
      }
    }
  });

/**
 * Parse the HTML string Monaco's `editor.colorize` returns into Preact vnodes,
 * so syntax-highlighted code survives the confining renderer (which strips raw
 * HTML strings). Monaco nests each line's tokens inside a CLASSLESS per-line
 * wrapper span — `<span><span class="mtkN">escaped-text</span>…</span>` — with
 * `<br/>` line breaks between lines; the `mtkN` classes are coloured by the
 * theme stylesheet Monaco injects globally. We therefore track an open-span
 * stack and colour token text with the nearest enclosing class. Token text
 * becomes plain vnode text (no `dangerouslySetInnerHTML`), so nothing but
 * Monaco's own class names crosses into the tree.
 *
 * Returns `null` when the input has no recognisable token spans, so callers can
 * fall back to the plain source.
 *
 * @param {string} html
 * @returns {Array<VNode | string> | null}
 */
export const colorizedHtmlToVnodes = html => {
  if (typeof html !== 'string' || html.length === 0) {
    return null;
  }
  /** @type {Array<VNode | string>} */
  const out = [];
  let sawSpan = false;
  // Stack of the classes of the currently-open spans (a classless wrapper span
  // pushes `null`). Text is coloured with the nearest enclosing non-null class.
  /** @type {Array<string | null>} */
  const classStack = [];
  const nearestClass = () => {
    for (let i = classStack.length - 1; i >= 0; i -= 1) {
      if (classStack[i]) return classStack[i];
    }
    return null;
  };
  // The opening-span class is optional so Monaco's classless line-wrapper spans
  // are recognised as tags instead of leaking their `span>` text through the
  // `[^<]+` fallback.
  const pattern = /<span(?: class="([^"]*)")?>|<\/span>|<br\s*\/?>|([^<]+)/g;
  for (let m = pattern.exec(html); m !== null; m = pattern.exec(html)) {
    if (m[2] !== undefined) {
      const text = decodeEntities(m[2]);
      const cls = nearestClass();
      if (cls) {
        out.push(h('span', { class: cls }, text));
      } else {
        out.push(text);
      }
    } else if (m[0].startsWith('</span')) {
      classStack.pop();
    } else if (m[0].startsWith('<span')) {
      classStack.push(m[1] !== undefined ? m[1] : null);
      sawSpan = true;
    } else {
      // A <br> line break; <pre> preserves the literal newline.
      out.push('\n');
    }
  }
  return sawSpan ? out : null;
};
harden(colorizedHtmlToVnodes);

/**
 * The confined content of a markdown code fence. Renders the plain `fallback`
 * source immediately, then asynchronously colourises it via the host-supplied
 * `colorize` (Monaco loads language grammars on demand, so colouring is
 * inherently async) and swaps in the highlighted token vnodes. Any failure —
 * no colorizer, an unknown language, a Monaco load error, or unparseable
 * output — leaves the plain source in place.
 *
 * The effect is mount-only by design: under the confining renderer a prop's
 * identity is reissued every render, so a `[colorize, content]` dependency list
 * would re-run the effect on every render. A code fence's source is stable for
 * the life of the node (a changed message remounts via its key), so colourising
 * once at mount is correct.
 *
 * @param {object} props
 * @param {string} props.content - The raw fence source.
 * @param {string} props.language - The fence language tag.
 * @param {(code: string, language: string) => Promise<string>} props.colorize -
 *   Host-supplied async colorizer returning Monaco-style token HTML.
 * @param {Array<VNode | string | null>} props.fallback - Plain-source vnodes
 *   rendered until (and unless) colourising succeeds.
 * @returns {VNode}
 */
export const CodeFenceColorizer = ({
  content,
  language,
  colorize,
  fallback,
}) => {
  const [colored, setColored] = useState(
    /** @type {Array<VNode | string> | null} */ (null),
  );
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => colorize(content, language))
      .then(html => {
        if (!live) return;
        const vnodes = colorizedHtmlToVnodes(html);
        if (vnodes) setColored(vnodes);
      })
      .catch(() => {
        // Colourising is best-effort; the plain fallback stays on any error.
      });
    return () => {
      live = false;
    };
    // Mount-only: a code fence's source is stable for the node's life (a changed
    // message remounts via its key), and under the confining renderer a
    // dependency on the reissued `colorize`/`content` props would re-run every
    // render.
  }, []);
  return colored
    ? h(Fragment, null, ...colored)
    : h(Fragment, null, ...fallback);
};
harden(CodeFenceColorizer);
