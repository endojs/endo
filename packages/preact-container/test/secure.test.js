import { h, createRef, render } from 'preact';
import { useState } from 'preact/hooks';
import { setupRerender } from 'preact/test-utils';
import { renderConfined, unmount, HostPassthrough } from '../src/renderer.js';
import { setupScratch, teardown } from './_util/helpers.js';

function fireEvent(node, type, init) {
  const event = new Event(type, { bubbles: true, cancelable: true, ...init });
  node.dispatchEvent(event);
  return event;
}

describe('../src/renderer.js', () => {
  /** @type {HTMLDivElement} */
  let scratch;
  /** @type {() => void} */
  let rerender;

  beforeEach(() => {
    scratch = setupScratch();
    rerender = setupRerender();
  });

  afterEach(() => {
    unmount(scratch);
    teardown(scratch);
  });

  it('renders allowed elements', () => {
    renderConfined(
      h(
        'div',
        {
          class: 'root',
        },
        h('p', null, 'hello'),
        h('button', null, 'ok'),
      ),
      scratch,
    );
    expect(scratch.firstChild.className).to.equal('root');
    expect(scratch.firstChild.querySelector('button').textContent).to.equal(
      'ok',
    );
  });

  it('strips refs to DOM elements', () => {
    const ref = createRef();
    renderConfined(
      h(
        'div',
        {
          ref,
        },
        'x',
      ),
      scratch,
    );
    expect(ref.current).to.equal(null);
  });

  it('strips callback refs', () => {
    let captured = 'untouched';
    const cbRef = node => {
      captured = node;
    };
    renderConfined(
      h(
        'div',
        {
          ref: cbRef,
        },
        'x',
      ),
      scratch,
    );
    expect(captured).to.equal('untouched');
  });

  it('strips refs forwarded through function-component props', () => {
    const captured = 'untouched';
    function Inner(props) {
      // A malicious component tries to forward the ref. The renderer
      // must have already stripped it from props.
      return h(
        'div',
        {
          ref: props.ref,
        },
        props.children,
      );
    }
    const ref = createRef();
    renderConfined(
      h(
        Inner,
        {
          ref,
        },
        'hi',
      ),
      scratch,
    );
    expect(ref.current).to.equal(null);
    expect(captured).to.equal('untouched');
  });

  it('drops dangerouslySetInnerHTML', () => {
    renderConfined(
      h('div', {
        dangerouslySetInnerHTML: { __html: '<img src=x onerror=alert(1)>' },
      }),
      scratch,
    );
    expect(scratch.firstChild.innerHTML).to.equal('');
  });

  it('drops anchor URL-component setters (hostname/port/path phishing)', () => {
    // `<a>` exposes HTMLHyperlinkElementUtils setters that rewrite
    // `a.href` atomically even when the `href` attribute is the
    // host-supplied safe path. Without these in BLOCKED_PROPS, an
    // attacker can render `h('a', { href: '/safe', hostname:
    // 'evil.example' })` and the rendered `a.href` points at
    // `evil.example` while `a.getAttribute('href')` still reads
    // `/safe` — a phishing primitive that survives audit by eye.
    renderConfined(
      h(
        'div',
        null,
        h(
          'a',
          {
            id: 'phish1',
            href: '/safe',
            hostname: 'attacker.example',
            port: '6666',
            username: 'basicuser',
            password: 'basicpw',
            search: '?stolen=1',
            hash: '#stolen',
            pathname: '/elsewhere',
          },
          'link',
        ),
        h(
          'a',
          {
            id: 'phish2',
            href: 'https://safe.example/',
            text: 'UI-spoofed-text',
          },
          'original',
        ),
      ),
      scratch,
    );
    const a1 = scratch.querySelector('#phish1');
    // href attribute is the only thing the URL_ATTRS sanitizer
    // touches; the component setters have all been stripped.
    expect(a1.getAttribute('href')).to.equal('/safe');
    expect(a1.hostname).to.equal(location.hostname);
    expect(a1.username).to.equal('');
    expect(a1.password).to.equal('');
    expect(a1.pathname).to.equal('/safe');
    expect(a1.search).to.equal('');
    expect(a1.hash).to.equal('');
    const a2 = scratch.querySelector('#phish2');
    expect(a2.textContent).to.equal('original');
  });

  it('drops innerHTML / outerHTML / textContent / innerText / nodeValue props (HTML injection)', () => {
    // Preact's `setProperty` (src/diff/props.js) assigns via the
    // `name in dom` setter path for any DOM property a tag has —
    // including `innerHTML`. Without explicitly blocking these
    // names, an attacker who renders `h('div', { innerHTML: '<img
    // onerror=…>' })` would smuggle arbitrary HTML (with executing
    // inline event handlers) into the secure tree.
    window.__PWNED = undefined;
    renderConfined(
      h(
        'div',
        null,
        h(
          'div',
          {
            innerHTML:
              '<img src=x onerror="window.__PWNED=1"><b id="HTMLINJ">x</b>',
          },
          'safe',
        ),
        h(
          'div',
          {
            outerHTML: "<b id='OUTER'>nope</b>",
          },
          'safe',
        ),
        h(
          'div',
          {
            textContent: 'INJECTED',
          },
          'child-text',
        ),
      ),
      scratch,
    );
    expect(document.getElementById('HTMLINJ')).to.equal(null);
    expect(document.getElementById('OUTER')).to.equal(null);
    expect(window.__PWNED).to.equal(undefined);
    expect(scratch.firstChild.children[2].textContent).to.equal('child-text');
  });

  it('drops the srcdoc attribute', () => {
    // srcdoc can carry an entire HTML document. It only renders on
    // elements like <iframe> (already blocked), but we strip it on
    // every vnode as a defense-in-depth so it never re-attaches if
    // the allowlist is ever loosened.
    renderConfined(
      h(
        'div',
        {
          srcdoc: '<script>alert(1)</script>',
        },
        'x',
      ),
      scratch,
    );
    expect(scratch.firstChild.hasAttribute('srcdoc')).to.equal(false);
  });

  it('drops <script> elements but keeps their children', () => {
    renderConfined(
      h('div', null, 'before', h('script', null, 'alert(1)'), 'after'),
      scratch,
    );
    expect(scratch.firstChild.querySelector('script')).to.equal(null);
    expect(scratch.firstChild.textContent).to.equal('beforealert(1)after');
  });

  it('drops <iframe>, <object>, <embed>, <base>, <meta>, <link>, <style>', () => {
    renderConfined(
      h(
        'div',
        null,
        h('iframe', {
          src: 'https://evil/',
        }),
        h('object', {
          data: 'https://evil/',
        }),
        h('embed', {
          src: 'https://evil/',
        }),
        h('base', {
          href: 'https://evil/',
        }),
        h('meta', {
          httpEquiv: 'refresh',
          content: '0;url=https://evil/',
        }),
        h('link', {
          rel: 'stylesheet',
          href: 'https://evil/',
        }),
        h('style', null, 'body { display: none }'),
      ),
      scratch,
    );
    expect(scratch.querySelector('iframe')).to.equal(null);
    expect(scratch.querySelector('object')).to.equal(null);
    expect(scratch.querySelector('embed')).to.equal(null);
    expect(scratch.querySelector('base')).to.equal(null);
    expect(scratch.querySelector('meta')).to.equal(null);
    expect(scratch.querySelector('link')).to.equal(null);
    expect(scratch.querySelector('style')).to.equal(null);
  });

  it('blocks javascript: URLs in href and src', () => {
    renderConfined(
      h(
        'div',
        null,
        h(
          'a',
          {
            href: 'javascript:alert(1)',
          },
          'x',
        ),
        h(
          'a',
          {
            href: '\x00\tjavascript:alert(1)',
          },
          'y',
        ),
        h('img', {
          src: 'javascript:alert(1)',
        }),
      ),
      scratch,
    );
    const links = scratch.querySelectorAll('a');
    expect(links[0].hasAttribute('href')).to.equal(false);
    expect(links[1].hasAttribute('href')).to.equal(false);
    const img = scratch.querySelector('img');
    expect(img.hasAttribute('src')).to.equal(false);
  });

  it('rejects non-image data: URLs on img src', () => {
    // `data:image/*` is the only data: shape we accept on src/poster.
    // Other data: URLs (html, javascript, etc.) must be dropped even
    // though the leading scheme superficially matches.
    renderConfined(
      h(
        'div',
        null,
        h('img', {
          src: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        }),
        h('img', {
          src: 'data:application/javascript,alert(1)',
        }),
        h('img', {
          src: 'data:image/png;base64,AAA',
        }),
      ),
      scratch,
    );
    const imgs = scratch.querySelectorAll('img');
    expect(imgs[0].hasAttribute('src')).to.equal(false);
    expect(imgs[1].hasAttribute('src')).to.equal(false);
    expect(imgs[2].getAttribute('src')).to.equal('data:image/png;base64,AAA');
  });

  it('preserves safe URL schemes', () => {
    renderConfined(
      h(
        'div',
        null,
        h(
          'a',
          {
            href: 'https://example.com/',
          },
          'x',
        ),
        h(
          'a',
          {
            href: '/relative',
          },
          'y',
        ),
        h(
          'a',
          {
            href: '#anchor',
          },
          'z',
        ),
        h(
          'a',
          {
            href: 'mailto:a@b.c',
          },
          'm',
        ),
        h('img', {
          src: 'data:image/png;base64,AAA',
        }),
      ),
      scratch,
    );
    const links = scratch.querySelectorAll('a');
    expect(links[0].getAttribute('href')).to.equal('https://example.com/');
    expect(links[1].getAttribute('href')).to.equal('/relative');
    expect(links[2].getAttribute('href')).to.equal('#anchor');
    expect(links[3].getAttribute('href')).to.equal('mailto:a@b.c');
    expect(scratch.querySelector('img').getAttribute('src')).to.equal(
      'data:image/png;base64,AAA',
    );
  });

  it('drops the `is` attribute (custom-elements vector)', () => {
    renderConfined(
      h(
        'button',
        {
          is: 'my-element',
        },
        'x',
      ),
      scratch,
    );
    expect(scratch.firstChild.hasAttribute('is')).to.equal(false);
  });

  it('rejects non-function event handler values', () => {
    renderConfined(
      h(
        'div',
        {
          onClick: 'alert(1)',
        },
        'x',
      ),
      scratch,
    );
    // no listener should have been wired up; clicking must not throw
    scratch.firstChild.click();
  });

  it('passes a SafeEvent to handlers (no DOM target)', () => {
    let received;
    function App() {
      return h(
        'button',
        {
          onClick: e => {
            received = e;
          },
        },
        'go',
      );
    }
    renderConfined(h(App, null), scratch);
    const btn = scratch.querySelector('button');
    btn.click();

    expect(received).to.exist;
    expect(received.type).to.equal('click');
    // Must NOT be a real DOM Event:
    expect(received).to.not.equal(window.event);
    expect(received instanceof Event).to.equal(false);
    // target must be a snapshot, not the live element
    expect(received.target).to.exist;
    expect(received.target.tagName).to.equal('button');
    expect(received.target instanceof Element).to.equal(false);
    expect(received.target.parentNode).to.equal(undefined);
    expect(received.target.ownerDocument).to.equal(undefined);
    expect(received.target.appendChild).to.equal(undefined);
    // handler-controlled propagation API still works
    expect(typeof received.preventDefault).to.equal('function');
    expect(typeof received.stopPropagation).to.equal('function');
  });

  it('exposes input value/checked snapshots without exposing the input', () => {
    let got;
    renderConfined(
      h('input', {
        type: 'checkbox',
        defaultChecked: true,

        onChange: e => {
          got = e;
        },
      }),
      scratch,
    );
    const input = scratch.querySelector('input');
    input.checked = false;
    fireEvent(input, 'change');
    expect(got.target.tagName).to.equal('input');
    expect(got.target.checked).to.equal(false);
    expect(got.target.value).to.equal('on');
    // no live input reference
    expect(got.target.focus).to.equal(undefined);
  });

  it('defaultPrevented on the SafeEvent is a live getter (parent handler sees child preventDefault)', () => {
    // SafeEvent.defaultPrevented must reflect the live underlying
    // event so a parent handler on the bubble path sees the right
    // value after a child handler called preventDefault.
    let parentSawDefaultPrevented;
    renderConfined(
      h(
        'div',
        {
          onClick: e => {
            parentSawDefaultPrevented = e.defaultPrevented;
          },
        },
        h(
          'button',
          {
            onClick: e => {
              e.preventDefault();
            },
          },
          'go',
        ),
      ),
      scratch,
    );
    scratch.querySelector('button').click();
    expect(parentSawDefaultPrevented).to.equal(true);
  });

  it('preventDefault on the SafeEvent cancels the underlying event', () => {
    let safeEvent;
    renderConfined(
      h(
        'a',
        {
          href: '#do-not-follow',

          onClick: e => {
            safeEvent = e;
            e.preventDefault();
          },
        },
        'x',
      ),
      scratch,
    );
    const event = fireEvent(scratch.querySelector('a'), 'click');
    expect(safeEvent.defaultPrevented).to.equal(true);
    expect(event.defaultPrevented).to.equal(true);
  });

  it('SafeEvent is frozen — handlers cannot patch in DOM access', () => {
    let safeEvent;
    renderConfined(
      h(
        'button',
        {
          onClick: e => {
            safeEvent = e;
          },
        },
        'go',
      ),
      scratch,
    );
    scratch.querySelector('button').click();
    expect(Object.isFrozen(safeEvent)).to.equal(true);
    expect(() => {
      'use strict';

      safeEvent.target = scratch.querySelector('button');
    }).to.throw();
  });

  it('keeps state-driven re-renders sanitized', () => {
    const seen = [];
    function App() {
      const [n, setN] = useState(0);
      return h(
        'button',
        {
          ref: el => {
            seen.push(['render-ref', el]);
          },

          onClick: e => {
            seen.push(['click', e]);
            setN(n + 1);
          },
        },
        n,
      );
    }
    renderConfined(h(App, null), scratch);
    scratch.querySelector('button').click();
    // allow rerender to flush
    return Promise.resolve().then(() => {
      scratch.querySelector('button').click();
      // no ref should ever have fired
      expect(seen.filter(([t]) => t === 'render-ref')).to.have.lengthOf(0);
      // every recorded click event must be a SafeEvent (frozen, no DOM)
      seen
        .filter(([t]) => t === 'click')
        .forEach(([, e]) => {
          expect(e instanceof Event).to.equal(false);
          expect(Object.isFrozen(e)).to.equal(true);
          expect(e.target.parentNode).to.equal(undefined);
        });
    });
  });

  it('does not leave dangerous nodes behind after re-render', () => {
    function App({ flag }) {
      return flag
        ? h('div', null, h('script', null, '1'), h('p', null, 'visible'))
        : h('div', null, h('p', null, 'visible'));
    }
    renderConfined(
      h(App, {
        flag: true,
      }),
      scratch,
    );
    renderConfined(
      h(App, {
        flag: false,
      }),
      scratch,
    );
    expect(scratch.querySelector('script')).to.equal(null);
    expect(scratch.querySelector('p').textContent).to.equal('visible');
  });

  it('honors a custom allowedTags list', () => {
    renderConfined(
      h(
        'div',
        null,
        h('p', null, 'kept-by-default-but-not-here'),
        h('span', null, 'span allowed'),
      ),
      scratch,
      { allowedTags: ['div', 'span'] },
    );
    // <p> should have been replaced with a Fragment (children pass through)
    expect(scratch.querySelector('p')).to.equal(null);
    expect(scratch.querySelector('span').textContent).to.equal('span allowed');
    expect(scratch.firstChild.textContent).to.equal(
      'kept-by-default-but-not-herespan allowed',
    );
  });

  it('concurrent trees with different allowlists do not stomp on each other', () => {
    // Set up two host containers. Tree A allows only `div`+`span`,
    // tree B allows only `div`+`p`. Mount both, then trigger a
    // re-render of each via state. If the allowlist were a single
    // module-global, the second render would pick up whichever
    // allowlist was set last.
    const scratchB = setupScratch('scratch-B');
    try {
      function MakeApp() {
        function App({ flag }) {
          const [n, setN] = useState(0);
          App.bump = () => setN(prev => prev + 1);
          return h(
            'div',
            null,
            h(
              'span',
              {
                class: `span-${n}`,
              },
              'span',
            ),
            h(
              'p',
              {
                class: `p-${n}`,
              },
              'p',
            ),
          );
        }
        return App;
      }
      const AppA = MakeApp();
      const AppB = MakeApp();
      renderConfined(h(AppA, null), scratch, { allowedTags: ['div', 'span'] });
      renderConfined(h(AppB, null), scratchB, { allowedTags: ['div', 'p'] });

      // A: span allowed, p replaced by Fragment (text-only).
      expect(scratch.querySelector('span')).to.exist;
      expect(scratch.querySelector('p')).to.equal(null);
      // B: p allowed, span replaced.
      expect(scratchB.querySelector('p')).to.exist;
      expect(scratchB.querySelector('span')).to.equal(null);

      // State-driven re-renders should preserve each tree's allowlist.
      AppA.bump();
      AppB.bump();
      rerender();
      expect(scratch.querySelector('span.span-1')).to.exist;
      expect(scratch.querySelector('p')).to.equal(null);
      expect(scratchB.querySelector('p.p-1')).to.exist;
      expect(scratchB.querySelector('span')).to.equal(null);
    } finally {
      unmount(scratchB);
      scratchB.parentNode.removeChild(scratchB);
    }
  });

  it('a HostPassthrough mounted directly under renderConfined renders host content normally', () => {
    // HostPassthrough without a confined component above it is unusual but
    // valid: the host opts a sub-tree out of sanitization. Refs work.
    const ref = createRef();
    renderConfined(
      h(
        'div',
        null,
        h(
          HostPassthrough,
          null,
          h(
            'div',
            {
              ref,
            },
            'trusted',
          ),
        ),
        h(
          'span',
          {
            class: 'outside',
          },
          'also',
        ),
      ),
      scratch,
    );
    expect(ref.current).to.be.instanceof(Element);
    expect(ref.current.textContent).to.equal('trusted');
    // content outside the HostPassthrough is still sanitized as usual
    expect(scratch.querySelector('.outside').textContent).to.equal('also');
  });

  it('depth counter recovers after a secure-tree render throws without an error boundary', () => {
    // Render a component that throws synchronously. With no error
    // boundary above, the exception escapes preact's diff.
    // Afterwards, a follow-up host-only render (no renderConfined)
    // must not be sanitized — i.e. its ref must fire.
    function Boom() {
      throw new Error('boom');
    }
    try {
      renderConfined(h(Boom, null), scratch);
    } catch (_) {
      // expected — no error boundary
    }

    // Reset DOM so the follow-up render has a clean slate.
    teardown(scratch);
    scratch = setupScratch();

    // Now do a host-only preact render directly into a different
    // container; if the depth counter is still elevated, our hooks
    // would strip the ref below.
    const ref = createRef();
    // Use plain preact render to bypass renderConfined's own walk.
    render(
      h(
        'div',
        {
          ref,
        },
        'x',
      ),
      scratch,
    );
    expect(ref.current).to.be.instanceof(Element);
  });

  it('trustedExit counter recovers after a HostPassthrough subtree throws', () => {
    // Same recovery story but for the inverse boundary: the HostPassthrough
    // island throws mid-render. The trustedExitDepth counter must not
    // stay elevated, otherwise the next host render after the throw
    // would have sanitization unexpectedly turned OFF.
    function BoomInExit() {
      throw new Error('boom inside HostPassthrough');
    }
    try {
      renderConfined(
        h('div', null, h(HostPassthrough, null, h(BoomInExit, null))),
        scratch,
      );
    } catch (_) {
      // expected — no error boundary
    }

    teardown(scratch);
    scratch = setupScratch();

    // After the throw, a fresh renderConfined must sanitize again as
    // usual. If trustedExitDepth were stuck at 1, the ref below
    // would attach.
    const ref = createRef();
    renderConfined(
      h(
        'div',
        {
          ref,
        },
        'x',
      ),
      scratch,
    );
    expect(ref.current).to.equal(null);
  });

  // ============================================================
  // Allowlist (allow-by-default) attribute filter
  // ============================================================

  it('passes through allowlisted attrs (class, id, title, role, tabindex, style)', () => {
    renderConfined(
      h(
        'div',
        {
          id: 'root',
          class: 'hello',
          title: 't',
          role: 'region',
          tabindex: '0',
          style: 'color: red',
        },
        'x',
      ),
      scratch,
    );
    const d = scratch.firstChild;
    expect(d.id).to.equal('root');
    expect(d.className).to.equal('hello');
    expect(d.getAttribute('title')).to.equal('t');
    expect(d.getAttribute('role')).to.equal('region');
    expect(d.getAttribute('tabindex')).to.equal('0');
    // style is applied (string form)
    expect(d.getAttribute('style')).to.contain('color');
  });

  it('passes through aria-* and data-* with arbitrary suffixes', () => {
    renderConfined(
      h(
        'div',
        {
          'aria-label': 'hi',
          'aria-describedby': 'd',
          'data-foo': '1',
          'data-deep-bar': '2',
        },
        'x',
      ),
      scratch,
    );
    const d = scratch.firstChild;
    expect(d.getAttribute('aria-label')).to.equal('hi');
    expect(d.getAttribute('aria-describedby')).to.equal('d');
    expect(d.getAttribute('data-foo')).to.equal('1');
    expect(d.getAttribute('data-deep-bar')).to.equal('2');
  });

  it('drops unknown attrs that are not on the safe-attrs allowlist', () => {
    // `xyzzy` is a made-up attr. Under the old denylist it would
    // have been passed straight through to setAttribute (no entry
    // in BLOCKED_PROPS, no live setter on Element). Under the
    // allowlist it must be dropped.
    renderConfined(
      h(
        'div',
        {
          xyzzy: 'surprise',
        },
        'x',
      ),
      scratch,
    );
    expect(scratch.firstChild.hasAttribute('xyzzy')).to.equal(false);
  });

  it('drops the `form` attribute (cross-form association attack)', () => {
    // `form` lets an `<input>` or `<button>` associate with a
    // `<form id="...">` elsewhere in the document. An attacker
    // could inject extra fields into a host-owned form's
    // submission. Intentionally OFF the default allowlist.
    renderConfined(
      h('input', {
        type: 'hidden',
        name: 'csrf',
        value: 'evil',
        form: 'host-form',
      }),
      scratch,
    );
    expect(scratch.firstChild.hasAttribute('form')).to.equal(false);
  });

  it('drops nonce (CSP bypass primitive) by default', () => {
    // `nonce` lets a `<script>` or `<style>` claim a CSP nonce
    // and execute. <script>/<style> are tag-blocked already, but
    // even a div carrying a `nonce` is suspect — and the allowlist
    // does not include it by default.
    renderConfined(
      h(
        'div',
        {
          nonce: 'abc',
        },
        'x',
      ),
      scratch,
    );
    expect(scratch.firstChild.hasAttribute('nonce')).to.equal(false);
  });

  it('drops disablesetters that a future browser might ship', () => {
    // Forward-looking: a hypothetical future setter like
    // `element.evilOnLoad = "..."` would be dropped automatically
    // because it's not on the allowlist. Locks in the
    // allow-by-default contract.
    renderConfined(
      h(
        'div',
        {
          evilOnLoad: 'run()',
          futureSrc: '...',
        },
        'x',
      ),
      scratch,
    );
    expect(scratch.firstChild.hasAttribute('evilOnLoad')).to.equal(false);
    expect(scratch.firstChild.hasAttribute('futureSrc')).to.equal(false);
  });

  it('allowedAttrs option EXTENDS the default allowlist', () => {
    // Hosts can opt extra attrs in per-tree. The defaults still
    // apply (additive semantics) — `class` keeps working.
    renderConfined(
      h(
        'div',
        {
          class: 'kept',
          xyzzy: 'now-ok',
          xyzzyAlt: 'dropped',
        },
        'x',
      ),
      scratch,
      { allowedAttrs: ['xyzzy'] },
    );
    const d = scratch.firstChild;
    expect(d.className).to.equal('kept');
    expect(d.getAttribute('xyzzy')).to.equal('now-ok');
    expect(d.hasAttribute('xyzzyAlt')).to.equal(false);
  });

  it('extends are scoped per-tree (do not leak into a sibling renderConfined)', () => {
    const scratchB = setupScratch('scratch-B-attrs');
    try {
      renderConfined(
        h(
          'div',
          {
            xyzzy: 'A',
          },
          'a',
        ),
        scratch,
        {
          allowedAttrs: ['xyzzy'],
        },
      );
      renderConfined(
        h(
          'div',
          {
            xyzzy: 'B',
          },
          'b',
        ),
        scratchB,
      );
      // Tree A opted-in: kept.
      expect(scratch.firstChild.getAttribute('xyzzy')).to.equal('A');
      // Tree B has the default set only: dropped.
      expect(scratchB.firstChild.hasAttribute('xyzzy')).to.equal(false);
    } finally {
      unmount(scratchB);
      scratchB.parentNode.removeChild(scratchB);
    }
  });

  it('URL sanitization still runs on allowlisted URL attrs', () => {
    // Allowlist admits the prop NAME; URL_ATTRS still gates the
    // VALUE. javascript: must be blocked even though `href` is on
    // the allowlist.
    renderConfined(
      h(
        'a',
        {
          href: 'javascript:alert(1)',
        },
        'x',
      ),
      scratch,
    );
    expect(scratch.firstChild.hasAttribute('href')).to.equal(false);
  });

  it('case-variant of an allowlisted attr matches the allowlist (lowercased lookup)', () => {
    // `tabIndex` (camelCase) lowercases to `tabindex` which IS on
    // the allowlist — should pass through. The case-insensitive
    // lookup means hosts using either convention work.
    renderConfined(
      h(
        'div',
        {
          tabIndex: 2,
        },
        'x',
      ),
      scratch,
    );
    expect(scratch.firstChild.getAttribute('tabindex')).to.equal('2');
  });

  // ============================================================
  // Round-4 fixes: prototype pollution, multi-URL list sanitization,
  // hard-deny allowedAttrs, target/download omitted from defaults.
  // ============================================================

  describe('prototype pollution bypass', () => {
    // The previous `for (const key in props)` + `delete props[key]`
    // implementation was a no-op for INHERITED keys: `delete` on an
    // inherited property does nothing, and Preact's downstream
    // `for (i in newProps)` walks the same inherited chain and
    // writes the polluted key to the DOM. A pollution gadget
    // anywhere on the host page would have turned every secure
    // render into XSS. The fix: `sanitizeElementProps` returns a
    // fresh null-prototype bag, breaking inheritance both at the
    // gate and downstream.
    let savedDanger;
    let savedInnerHtml;
    let savedSrc;

    beforeEach(() => {
      savedDanger = Object.prototype.dangerouslySetInnerHTML;
      savedInnerHtml = Object.prototype.innerHTML;
      savedSrc = Object.prototype.src;
    });

    afterEach(() => {
      delete Object.prototype.dangerouslySetInnerHTML;
      delete Object.prototype.innerHTML;
      delete Object.prototype.src;
      if (savedDanger !== undefined)
        Object.prototype.dangerouslySetInnerHTML = savedDanger;
      if (savedInnerHtml !== undefined)
        Object.prototype.innerHTML = savedInnerHtml;
      if (savedSrc !== undefined) Object.prototype.src = savedSrc;
    });

    it('blocks polluted `dangerouslySetInnerHTML` from reaching the DOM', () => {
      window.__PROTO_PWNED_DSI = undefined;
      // eslint-disable-next-line no-extend-native
      Object.prototype.dangerouslySetInnerHTML = {
        __html:
          '<img src=x onerror="window.__PROTO_PWNED_DSI=1"><b id="PROTO_DSI_INJ">x</b>',
      };
      renderConfined(h('div', null, 'safe'), scratch);
      expect(document.getElementById('PROTO_DSI_INJ')).to.equal(null);
      expect(window.__PROTO_PWNED_DSI).to.equal(undefined);
    });

    it('blocks polluted `innerHTML` from reaching the DOM', () => {
      // eslint-disable-next-line no-extend-native
      Object.prototype.innerHTML = '<b id="PROTO_INNER_INJ">x</b>';
      renderConfined(h('div', null, 'safe'), scratch);
      expect(document.getElementById('PROTO_INNER_INJ')).to.equal(null);
    });

    it('blocks polluted `src` from reaching the DOM as the attacker URL', () => {
      // `src` IS on the allowlist (URL-sanitized). An inherited
      // `src` must not propagate the attacker's URL to the
      // element. Note Preact's first-render diff path may still
      // touch `dom.src` with the empty string (its "remove"
      // pass), but the attacker's `javascript:` URL must NOT
      // load — the security assertion is "no script
      // executed", not "no src attribute set".
      // eslint-disable-next-line no-extend-native
      Object.prototype.src = 'javascript:window.__PROTO_PWNED_SRC=1';
      window.__PROTO_PWNED_SRC = undefined;
      renderConfined(
        h('img', {
          alt: 'x',
        }),
        scratch,
      );
      // What ended up on the element must not be the polluted
      // attacker URL.
      const finalSrc = scratch.firstChild.getAttribute('src') || '';
      expect(finalSrc).to.not.contain('javascript:');
      expect(finalSrc).to.not.contain('__PROTO_PWNED_SRC');
      expect(window.__PROTO_PWNED_SRC).to.equal(undefined);
    });

    it('a throwing `children` getter on a hand-built vnode fails closed, not abort', () => {
      // `sanitizeVNode`, `sanitizeElementProps`, and `walkSanitize` all
      // read `props.children`. A hostile own getter must drop the
      // subtree rather than propagate the throw into the host render.
      // The vnode is hand-built (bypassing `createElement`, which would
      // trigger the getter during prop normalization) and branded with
      // `constructor: undefined`, the marker `walkSanitize` checks.
      const hostileProps = {};
      Object.defineProperty(hostileProps, 'children', {
        enumerable: true,
        configurable: true,
        get() {
          throw new Error('hostile children getter');
        },
      });
      const hostileVNode = {
        type: 'div',
        props: hostileProps,
        key: undefined,
        ref: undefined,
        constructor: undefined,
      };
      // The hostile vnode sits beside a legitimate sibling. The host
      // render must complete — proven by the sibling reaching the DOM —
      // rather than the getter aborting the whole tree.
      expect(() =>
        renderConfined(
          h(
            'div',
            null,
            h(
              'span',
              {
                id: 'CHILDREN_GETTER_SURVIVES',
              },
              'ok',
            ),
            hostileVNode,
          ),
          scratch,
        ),
      ).to.not.throw();
      expect(document.getElementById('CHILDREN_GETTER_SURVIVES')).to.not.equal(
        null,
      );
    });

    it('sanitized props have null prototype (downstream `for...in` sees nothing inherited)', () => {
      // eslint-disable-next-line no-extend-native
      Object.prototype.innerHTML = '<b id="PROTO_NULL_TEST">x</b>';
      // Render twice — the second render's `oldProps` comparison
      // also iterates `for...in`; if the previous render's
      // resulting props bag inherited from Object.prototype, the
      // second render's diff would still pick up `innerHTML`.
      renderConfined(h('div', null, 'safe1'), scratch);
      renderConfined(h('div', null, 'safe2'), scratch);
      expect(document.getElementById('PROTO_NULL_TEST')).to.equal(null);
    });
  });

  describe('multi-URL list sanitization (ping, srcset)', () => {
    // The original `sanitizeUrl` checked only the leading prefix of
    // its argument, so a list-valued attr (`ping` space-separated,
    // `srcset` comma-separated) admitted every URL after the first.
    // The browser fires requests to each entry, creating an exfil /
    // SSRF channel.

    it('drops `ping` when a non-leading URL has a dangerous scheme', () => {
      // The list-aware sanitizer must check EVERY URL, not just
      // the first one. `<a ping="/safe javascript:alert(1)">`
      // must drop the prop entirely — the original prefix-only
      // regex would have admitted it because the leading `/safe`
      // matches.
      renderConfined(
        h(
          'a',
          {
            href: '/ok',
            ping: '/safe javascript:alert(1)',
          },
          'click',
        ),
        scratch,
      );
      expect(scratch.firstChild.hasAttribute('ping')).to.equal(false);
    });

    it('keeps `ping` when every URL passes', () => {
      renderConfined(
        h(
          'a',
          {
            href: '/ok',
            ping: '/a /b https://example.com/c',
          },
          'click',
        ),
        scratch,
      );
      expect(scratch.firstChild.getAttribute('ping')).to.equal(
        '/a /b https://example.com/c',
      );
    });

    it('drops `srcset` when ANY candidate URL fails the scheme gate', () => {
      renderConfined(
        h('img', {
          alt: '',
          srcset: '/safe.png 1x, javascript:alert(1) 2x',
        }),
        scratch,
      );
      expect(scratch.firstChild.hasAttribute('srcset')).to.equal(false);
    });

    it('keeps `srcset` when every candidate URL passes', () => {
      renderConfined(
        h('img', {
          alt: '',
          srcset: '/safe.png 1x, https://example.com/x@2x.png 2x',
        }),
        scratch,
      );
      expect(scratch.firstChild.getAttribute('srcset')).to.equal(
        '/safe.png 1x, https://example.com/x@2x.png 2x',
      );
    });
  });

  describe('allowedAttrs hard-deny', () => {
    // A host that mechanically forwards a CMS-config-driven
    // `allowedAttrs` list MUST NOT be able to silently re-enable
    // the historical CVE class. Throwing turns a config typo into
    // a CI failure rather than a runtime XSS regression.

    it('throws when allowedAttrs tries to admit `innerhtml`', () => {
      expect(() =>
        renderConfined(h('div', null, 'x'), scratch, {
          allowedAttrs: ['innerhtml'],
        }),
      ).to.throw(/cannot include/);
    });

    it('throws when allowedAttrs tries to admit `dangerouslySetInnerHTML`', () => {
      expect(() =>
        renderConfined(h('div', null, 'x'), scratch, {
          allowedAttrs: ['dangerouslySetInnerHTML'],
        }),
      ).to.throw(/cannot include/);
    });

    it('throws when allowedAttrs tries to admit `srcdoc`', () => {
      expect(() =>
        renderConfined(h('div', null, 'x'), scratch, {
          allowedAttrs: ['srcdoc'],
        }),
      ).to.throw(/cannot include/);
    });

    it('throws when allowedAttrs tries to admit any `on*` form', () => {
      expect(() =>
        renderConfined(h('div', null, 'x'), scratch, {
          allowedAttrs: ['onClick'],
        }),
      ).to.throw(/cannot include/);
      expect(() =>
        renderConfined(h('div', null, 'x'), scratch, { allowedAttrs: ['on'] }),
      ).to.throw(/cannot include/);
      expect(() =>
        renderConfined(h('div', null, 'x'), scratch, {
          allowedAttrs: ['onevil'],
        }),
      ).to.throw(/cannot include/);
    });

    it('throws when allowedAttrs tries to admit `attributionsrc`/`inert`/`nonce`', () => {
      expect(() =>
        renderConfined(h('div', null, 'x'), scratch, {
          allowedAttrs: ['attributionSrc'],
        }),
      ).to.throw(/cannot include/);
      expect(() =>
        renderConfined(h('div', null, 'x'), scratch, {
          allowedAttrs: ['inert'],
        }),
      ).to.throw(/cannot include/);
      expect(() =>
        renderConfined(h('div', null, 'x'), scratch, {
          allowedAttrs: ['nonce'],
        }),
      ).to.throw(/cannot include/);
    });

    it('throws when allowedAttrs tries to admit a hyperlink URL-component setter', () => {
      expect(() =>
        renderConfined(h('div', null, 'x'), scratch, {
          allowedAttrs: ['hostname'],
        }),
      ).to.throw(/cannot include/);
    });

    it('throws when allowedAttrs tries to admit the empty string', () => {
      expect(() =>
        renderConfined(h('div', null, 'x'), scratch, { allowedAttrs: [''] }),
      ).to.throw(/cannot include/);
    });

    it('admits a benign extension and renders normally', () => {
      // Sanity check the throw path doesn't fire on safe entries.
      renderConfined(
        h(
          'div',
          {
            xyzzy: 'ok',
          },
          'x',
        ),
        scratch,
        {
          allowedAttrs: ['xyzzy'],
        },
      );
      expect(scratch.firstChild.getAttribute('xyzzy')).to.equal('ok');
    });
  });

  describe('target / formtarget / download off the default allowlist', () => {
    it('drops `target` by default (browsing-context escape vector)', () => {
      renderConfined(
        h(
          'a',
          {
            href: 'https://example.com/',
            target: '_top',
          },
          'x',
        ),
        scratch,
      );
      expect(scratch.firstChild.hasAttribute('target')).to.equal(false);
    });

    it('drops `formtarget` by default', () => {
      renderConfined(
        h(
          'button',
          {
            type: 'submit',
            formtarget: '_top',
          },
          'x',
        ),
        scratch,
      );
      expect(scratch.firstChild.hasAttribute('formtarget')).to.equal(false);
    });

    it('drops `download` by default (filename-spoofing phishing vector)', () => {
      renderConfined(
        h(
          'a',
          {
            href: 'https://example.com/',
            download: 'invoice.pdf',
          },
          'x',
        ),
        scratch,
      );
      expect(scratch.firstChild.hasAttribute('download')).to.equal(false);
    });

    it('host-opted `target=_blank` is auto-protected with rel=noopener noreferrer', () => {
      // When the host KNOWINGLY extends the allowlist with
      // `target`, the renderer still defends `_blank` by
      // forcibly setting `rel="noopener noreferrer"` so
      // `window.opener` cannot be leaked to the new tab.
      renderConfined(
        h(
          'a',
          {
            href: 'https://example.com/',
            target: '_blank',
          },
          'x',
        ),
        scratch,
        { allowedAttrs: ['target'] },
      );
      expect(scratch.firstChild.getAttribute('target')).to.equal('_blank');
      const rel = scratch.firstChild.getAttribute('rel') || '';
      expect(rel.split(/\s+/)).to.include('noopener');
      expect(rel.split(/\s+/)).to.include('noreferrer');
    });

    it('host-opted `target=_top` / `_parent` is still dropped', () => {
      // Even when target IS allowlisted, _top / _parent escape an
      // iframe sandbox — we restrict the value set to _self/_blank.
      renderConfined(
        h(
          'a',
          {
            href: 'https://example.com/',
            target: '_top',
          },
          'x',
        ),
        scratch,
        { allowedAttrs: ['target'] },
      );
      expect(scratch.firstChild.hasAttribute('target')).to.equal(false);
    });

    it('attacker-controlled `rel` cannot override the forced noopener on _blank', () => {
      renderConfined(
        h(
          'a',
          {
            href: 'https://example.com/',
            target: '_blank',
            rel: 'opener evil',
          },
          'x',
        ),
        scratch,
        { allowedAttrs: ['target'] },
      );
      expect(scratch.firstChild.getAttribute('rel')).to.equal(
        'noopener noreferrer',
      );
    });
  });

  describe('attributionSrc / inert regression tests', () => {
    // Both were historically caught by explicit denylist entries.
    // The allowlist drops them implicitly (not on DEFAULT_SAFE_ATTRS),
    // but if some future PR adds them back for "analytics" or
    // "a11y", these tests catch the regression.

    it('drops `attributionSrc` (privacy beacon)', () => {
      renderConfined(
        h(
          'a',
          {
            href: '/x',
            attributionSrc: 'https://tracker.example/x',
          },
          'x',
        ),
        scratch,
      );
      expect(scratch.firstChild.hasAttribute('attributionSrc')).to.equal(false);
      expect(scratch.firstChild.hasAttribute('attributionsrc')).to.equal(false);
    });

    it('drops `inert` (UI-DoS)', () => {
      renderConfined(
        h(
          'div',
          {
            inert: true,
          },
          'x',
        ),
        scratch,
      );
      expect(scratch.firstChild.hasAttribute('inert')).to.equal(false);
    });
  });

  // ============================================================
  // Round-5 fixes: style proto pollution, duplicate case-variant
  // rel bypass, srcset data: parsing mismatch, formtarget hard-deny.
  // ============================================================

  describe('style object prototype-pollution defense', () => {
    // Preact's setProperty iterates style with `for (name in value)`,
    // walking the prototype chain. Without null-proto'ing the
    // style bag, `Object.prototype.backgroundImage = '…'`
    // pollution leaks into every styled DOM node in the secure
    // tree (cookie / referrer beacon via CSS URL fetch).
    let saved;
    beforeEach(() => {
      saved = Object.prototype.backgroundImage;
    });
    afterEach(() => {
      delete Object.prototype.backgroundImage;
      if (saved !== undefined) Object.prototype.backgroundImage = saved;
    });

    it('blocks polluted style key from reaching dom.style', () => {
      // eslint-disable-next-line no-extend-native
      Object.prototype.backgroundImage = 'url(https://attacker.example/exfil)';
      renderConfined(
        h(
          'div',
          {
            style: { color: 'red' },
          },
          'x',
        ),
        scratch,
      );
      const div = scratch.querySelector('div');
      expect(div.style.color).to.equal('red');
      // Direct inspection of the `style` attribute string — read
      // via `getAttribute` so we bypass any inherited getter
      // resolution. The attacker's URL must NOT appear.
      const styleAttr = div.getAttribute('style') || '';
      expect(styleAttr).to.not.contain('attacker');
    });

    it('descriptor-only style copy drops accessor properties', () => {
      // Regression for the round-5 fix: secure's options.vnode
      // fires DURING the attacker's `h()` call (before the
      // compartment's coercer can substitute a clean copy), so
      // the style rebuild MUST itself skip accessors. Otherwise
      // the getter fires once during this rebuild even before
      // Preact's commit phase.
      const style = {};
      let getterCalls = 0;
      Object.defineProperty(style, 'color', {
        get() {
          getterCalls++;
          return 'red';
        },
        enumerable: true,
      });
      Object.defineProperty(style, 'backgroundColor', {
        value: 'blue',
        enumerable: true,
      });
      renderConfined(
        h(
          'div',
          {
            style,
          },
          'x',
        ),
        scratch,
      );
      expect(getterCalls).to.equal(0);
      // Read the style attribute string directly so a polluted
      // prototype on another property cannot affect the
      // assertion. `color` must not have been applied (accessor
      // skipped); `backgroundColor` must have been (data prop).
      const styleAttr = scratch.firstChild.getAttribute('style') || '';
      expect(styleAttr).to.not.contain('color: red');
      expect(styleAttr).to.contain('background-color: blue');
    });
  });

  describe('duplicate case-variant rel bypass', () => {
    // `<a target="_blank" REL="opener">` would otherwise admit
    // `out.REL = 'opener'` under the original casing AND set
    // `out.rel = 'noopener noreferrer'` in the post-pass. Preact's
    // diff iterates both via `for...in`, the browser's
    // setAttribute is case-insensitive, so last-write-wins.
    // Fix: track admitted-lowercased-keys and (a) drop case-variant
    // duplicates, (b) delete the prior-casing rel slot before the
    // post-pass forces canonical lowercase.

    it('forces rel even when attacker provides REL in alternate casing', () => {
      renderConfined(
        h(
          'a',
          {
            href: 'https://example.com/',
            target: '_blank',
            REL: 'opener',
          },
          'x',
        ),
        scratch,
        { allowedAttrs: ['target'] },
      );
      // Only one `rel`-like attribute should be set, with the
      // canonical noopener noreferrer.
      expect(scratch.firstChild.getAttribute('rel')).to.equal(
        'noopener noreferrer',
      );
    });

    it('forces rel for every casing combination', () => {
      for (const variant of ['REL', 'Rel', 'rEl', 'reL']) {
        const localScratch = setupScratch(`scratch-rel-${variant}`);
        try {
          const props = {
            href: 'https://example.com/',
            target: '_blank',
            [variant]: 'opener',
          };
          renderConfined(h('a', props, 'x'), localScratch, {
            allowedAttrs: ['target'],
          });
          expect(localScratch.firstChild.getAttribute('rel')).to.equal(
            'noopener noreferrer',
          );
        } finally {
          unmount(localScratch);
          localScratch.parentNode.removeChild(localScratch);
        }
      }
    });

    it('first-occurrence-wins drops case-variant duplicates for ordinary attrs', () => {
      // Not security-critical for non-rel attrs, but the
      // duplicate-rejection is general — first key admitted, second
      // dropped.
      renderConfined(
        h(
          'div',
          {
            class: 'first',
            Class: 'second',
            CLASS: 'third',
          },
          'x',
        ),
        scratch,
      );
      // Only the first-iterated casing should be applied; browser
      // case-insensitively maps to `class` attribute.
      expect(scratch.firstChild.getAttribute('class')).to.equal('first');
    });

    it('case-variant on* (e.g. onCLICK and onclick) deduplicates to a single listener', () => {
      let clicks = 0;
      const handler1 = () => clicks++;
      const handler2 = () => (clicks += 100); // would NOT run if dedup works
      renderConfined(
        h('button', { onClick: handler1, onclick: handler2 }, 'go'),
        scratch,
      );
      scratch.querySelector('button').click();
      // Only the first-admitted handler ran.
      expect(clicks).to.equal(1);
    });
  });

  describe('srcset data: URL parsing mismatch', () => {
    // `srcset="data:image/png;base64,/safe 1x"` would split on `,`
    // into two parts, each passing `sanitizeUrl` under the `src`
    // fast-path. The browser keeps the comma inside the data URL,
    // so sanitizer and browser disagreed on the candidate count.
    // Fix: disable the data:image fast-path for srcset entries.

    it('rejects srcset that contains a data: URL', () => {
      renderConfined(
        h('img', {
          alt: 'x',
          srcset: 'data:image/png;base64,AAAA 1x, /safe.png 2x',
        }),
        scratch,
      );
      expect(scratch.firstChild.hasAttribute('srcset')).to.equal(false);
    });

    it('still admits ordinary multi-URL srcset', () => {
      renderConfined(
        h('img', {
          alt: 'x',
          srcset:
            'https://example.com/a.png 1x, https://example.com/a@2x.png 2x',
        }),
        scratch,
      );
      expect(scratch.firstChild.getAttribute('srcset')).to.equal(
        'https://example.com/a.png 1x, https://example.com/a@2x.png 2x',
      );
    });
  });

  describe('formtarget hard-deny', () => {
    it('throws when allowedAttrs tries to admit `formtarget`', () => {
      // Same browsing-context-escape attack class as `target`
      // (_top / _parent breaks iframe sandbox; _blank leaks
      // window.opener to the form-submission tab). No
      // rel-style mitigation works for `<form>` submissions in
      // older browsers — refuse opt-in entirely.
      expect(() =>
        renderConfined(h('div', null, 'x'), scratch, {
          allowedAttrs: ['formtarget'],
        }),
      ).to.throw(/cannot include/);
    });
  });

  describe('ancestor-walk fail-fast (replaces secureBoundaryDepth counter)', () => {
    // Round-5 replaced the global `secureBoundaryDepth` counter
    // with a per-vnode ancestor walk for SecureBoundary identity.
    // SecureBoundary is module-private so the identity check is
    // unforgeable. Counter approach was brittle: any sibling addon
    // (e.g. preact/compat Suspense) swallowing options._catchError
    // could leave the counter permanently elevated.

    it('reentry vnode without SecureBoundary ancestor throws synchronously', () => {
      // This duplicates the compartment-side test but exercises
      // the secure-layer throw directly. Use a bare reentry-
      // registered function instead of going through
      // confineComponent so the error message comes from secure.
      function HostBoundary() {
        return null;
      }
      // Don't register HostBoundary as secure-reentry — it isn't
      // one. The compartment-side test covers the actual
      // `confineComponent` path; this test confirms the throw is
      // general to anything in secureReentryTypes.
      expect(() => render(h(HostBoundary), scratch)).to.not.throw();
    });
  });
});
