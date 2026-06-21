// @ts-check
import { h, Fragment } from 'preact';

/** @import { ComponentChildren, VNode } from 'preact' */

// SECURITY / FIDELITY NOTE
// ------------------------
// The scene `html` is produced by an untrusted model. The old component
// rendered it verbatim inside a sandboxed `<iframe srcdoc>`. Under the
// project's CONFINED renderer that approach no longer works AND is no longer
// the trust boundary: `<iframe>` is not in the renderer's allowed-tag set (it
// collapses to a Fragment), `ref` is stripped, and the raw-HTML / `srcdoc`
// attributes are hard-denied — so a raw-HTML injection would be silently
// dropped rather than rendered.
//
// Instead we parse the scene HTML into a vnode tree built only from a small
// allowlist of structural/text tags, and hand THAT to the confined renderer,
// which sanitizes attributes (dropping `style`-injection, `on*` handlers,
// `javascript:` URLs, disallowed tags, etc.) exactly as it does for every
// other tree in the app. No raw-HTML sink remains.
//
// TRADEOFF: scenes are no longer self-contained documents. Embedded
// `<script>` and `<style>` are dropped (scripts never ran under the old
// `sandbox="allow-scripts"` iframe either from the host's perspective, but
// author CSS did apply inside the frame). Model scenes therefore render as
// sanitized semantic HTML styled by the host's `whylip.css`, not by their own
// inline stylesheets. This is an intentional fidelity-for-safety trade.

// Structural/text tags we will emit. Anything else collapses to a Fragment so
// its (already-parsed, already-sanitized) children still render. This list is
// a SUBSET of the confined renderer's own allowlist; the renderer remains the
// authoritative gate.
const ALLOWED_SCENE_TAGS = harden(
  new Set([
    'div',
    'span',
    'p',
    'section',
    'article',
    'header',
    'footer',
    'main',
    'aside',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'dl',
    'dt',
    'dd',
    'table',
    'thead',
    'tbody',
    'tr',
    'td',
    'th',
    'caption',
    'figure',
    'figcaption',
    'blockquote',
    'pre',
    'code',
    'kbd',
    'samp',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'mark',
    'small',
    'sub',
    'sup',
    'br',
    'hr',
    'a',
    'img',
    'abbr',
    'cite',
    'q',
    'time',
    'label',
  ]),
);

// Attributes we forward from parsed HTML. The confined renderer enforces its
// own allowlist on top of this, so this is just to avoid carrying noise.
const ALLOWED_SCENE_ATTRS = harden(
  new Set(['class', 'id', 'title', 'href', 'src', 'alt', 'lang', 'dir']),
);

const VOID_TAGS = harden(new Set(['br', 'hr', 'img']));

/**
 * Minimal, dependency-free HTML tokenizer/parser that produces a Preact vnode
 * tree. It is intentionally lenient (model output is messy) and conservative
 * (only the allowlisted tags/attrs above survive; everything else degrades to
 * text or a Fragment). It is NOT a security boundary on its own — the confined
 * renderer is — but keeping the parse small means less surface to reason about.
 *
 * @param {string} html
 * @returns {Array<ComponentChildren>}
 */
const parseSceneHtml = html => {
  /**
   * @typedef {object} Frame
   * @property {string} tag
   * @property {Record<string, string>} props
   * @property {Array<ComponentChildren>} children
   */
  /** @type {Frame[]} */
  const stack = [{ tag: '#root', props: {}, children: [] }];
  const top = () => stack[stack.length - 1];

  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^<>"']|"[^"]*"|'[^']*')*)\/?>/g;
  let lastIndex = 0;
  let match = tagRe.exec(html);

  /**
   * @param {string} text
   */
  const pushText = text => {
    if (!text) return;
    // Decode the handful of entities a model is likely to emit; leave the
    // rest literal. Output is plain text in a vnode, so this cannot inject.
    const decoded = text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
    top().children.push(decoded);
  };

  /**
   * @param {string} rawAttrs
   * @returns {Record<string, string>}
   */
  const parseAttrs = rawAttrs => {
    /** @type {Record<string, string>} */
    const props = {};
    const attrRe =
      /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
    let a = attrRe.exec(rawAttrs);
    while (a !== null) {
      const name = a[1].toLowerCase();
      let value = a[2] ?? '';
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Forward only allowlisted attrs; the confined renderer re-checks
      // every attribute regardless.
      if (ALLOWED_SCENE_ATTRS.has(name)) {
        props[name] = value;
      }
      a = attrRe.exec(rawAttrs);
    }
    return props;
  };

  /**
   * Emit a completed frame as a vnode into its parent's children. Frames for
   * non-allowlisted tags collapse to a Fragment, preserving their (already
   * sanitized) children.
   *
   * @param {Frame} frame
   */
  const emitFrame = frame => {
    const vnode = ALLOWED_SCENE_TAGS.has(frame.tag)
      ? h(frame.tag, frame.props, ...frame.children)
      : h(Fragment, null, ...frame.children);
    top().children.push(vnode);
  };

  while (match !== null) {
    pushText(html.slice(lastIndex, match.index));
    lastIndex = tagRe.lastIndex;

    const full = match[0];
    const tag = match[1].toLowerCase();
    const isClose = full.startsWith('</');
    const isSelfClose = full.endsWith('/>') || VOID_TAGS.has(tag);

    if (isClose) {
      // Find the matching open frame; tolerate mis-nesting by closing every
      // frame above it (inner-first) so their content is not lost.
      let depth = -1;
      for (let i = stack.length - 1; i >= 1; i -= 1) {
        if (stack[i].tag === tag) {
          depth = i;
          break;
        }
      }
      if (depth !== -1) {
        while (stack.length > depth) {
          const frame = /** @type {Frame} */ (stack.pop());
          emitFrame(frame);
        }
      }
      // Unmatched close tag: ignore.
    } else if (isSelfClose) {
      const props = parseAttrs(match[2] || '');
      emitFrame({ tag, props, children: [] });
    } else {
      stack.push({ tag, props: parseAttrs(match[2] || ''), children: [] });
    }

    match = tagRe.exec(html);
  }
  pushText(html.slice(lastIndex));

  // Close any still-open frames from the inside out.
  while (stack.length > 1) {
    emitFrame(/** @type {Frame} */ (stack.pop()));
  }

  return stack[0].children;
};

/**
 * Renders a scene (untrusted model-generated HTML) as a SANITIZED vnode tree.
 *
 * @param {object} props
 * @param {{ title: string, html: string } | null} props.scene
 */
export function SceneCanvas({ scene }) {
  if (!scene) {
    return h(
      'div',
      { class: 'whylip-scene whylip-scene-empty' },
      h(
        'div',
        { class: 'scene-placeholder' },
        h('span', { class: 'scene-placeholder-icon' }, '📖'),
        h(
          'p',
          null,
          'Scenes will appear here as the primer illustrates concepts.',
        ),
      ),
    );
  }

  /** @type {Array<ComponentChildren>} */
  let body;
  try {
    body = parseSceneHtml(scene.html);
  } catch (err) {
    console.error('[whylip] scene parse error:', /** @type {Error} */ (err));
    body = [scene.html];
  }

  return h(
    'div',
    { class: 'whylip-scene' },
    h(
      'div',
      { class: 'scene-title-bar' },
      h('span', { class: 'scene-title' }, scene.title),
    ),
    h('div', { class: 'scene-content' }, ...body),
  );
}
harden(SceneCanvas);
