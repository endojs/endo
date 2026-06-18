import { createElement, createRef, render, Component } from 'preact';
import { setupRerender } from 'preact/test-utils';
import { renderConfined, unmount, HostPassthrough } from '../src/renderer.js';
import { confineComponent, isConfinedComponent } from '../src/compartment.js';
import { setupScratch, teardown } from './_util/helpers.js';

/** @jsx createElement */

describe('../src/compartment.js', () => {
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

  it('confineComponent returns a Preact function component', () => {
    const Confined = confineComponent(({ h }, props) =>
      h('div', null, props.title),
    );
    expect(typeof Confined).to.equal('function');
    expect(isConfinedComponent(Confined)).to.equal(true);
    expect(isConfinedComponent(() => {})).to.equal(false);
  });

  it('mounts attacker output via endowments.h', () => {
    const Confined = confineComponent(({ h }, props) =>
      h('div', { class: 'k' }, 'hi ', props.who),
    );
    renderConfined(<Confined who="world" />, scratch);
    expect(scratch.firstChild.className).to.equal('k');
    expect(scratch.firstChild.textContent).to.equal('hi world');
  });

  it('the endowments bundle is frozen', () => {
    let seenEndowments;
    const Confined = confineComponent(endowments => {
      seenEndowments = endowments;
      return endowments.h('span', null, 'x');
    });
    renderConfined(<Confined />, scratch);
    expect(Object.isFrozen(seenEndowments)).to.equal(true);
    // Reassignment of a known field throws in strict mode (the
    // module is ESM, so the function body runs strict).
    expect(() => {
      seenEndowments.h = () => null;
    }).to.throw();
    // Adding a new field also fails on a frozen object.
    expect(() => {
      seenEndowments.evil = 'leak';
    }).to.throw();
  });

  it('attacker function is called with this === undefined', () => {
    let seenThis = 'untouched';
    const Confined = confineComponent(function (endowments, props) {
      // not an arrow — the function captures its own `this`.
      seenThis = this;
      return endowments.h('span', null, 'x');
    });
    renderConfined(<Confined />, scratch);
    // `Reflect.apply(fn, undefined, …)` plus strict-mode source
    // means `this` is genuinely undefined, not the global object.
    expect(seenThis).to.equal(undefined);
  });

  it('attacker can use hooks from endowments for local state', () => {
    const Confined = confineComponent(({ h, useState }) => {
      const [n, setN] = useState(0);
      return h(
        'button',
        {
          onClick: () => setN(prev => prev + 1),
        },
        String(n),
      );
    });
    renderConfined(<Confined />, scratch);
    const btn = scratch.querySelector('button');
    expect(btn.textContent).to.equal('0');
    btn.click();
    rerender();
    expect(btn.textContent).to.equal('1');
  });

  it('attacker props are frozen — assignment fails silently or throws', () => {
    let seenProps;
    const Confined = confineComponent(({ h }, props) => {
      seenProps = props;
      return h('span', null, props.label);
    });
    renderConfined(<Confined label="hi" />, scratch);
    expect(Object.isFrozen(seenProps)).to.equal(true);
    expect(() => {
      'use strict';

      seenProps.label = 'mutated';
    }).to.throw();
    expect(seenProps.label).to.equal('hi');
  });

  it('drops attacker return value of a wrong shape (plain object)', () => {
    const Confined = confineComponent(() => ({ not: 'a vnode' }));
    renderConfined(<Confined />, scratch);
    expect(scratch.innerHTML).to.equal('');
  });

  it('drops attacker return value that is a Promise', () => {
    const Confined = confineComponent(() => Promise.resolve('x'));
    renderConfined(<Confined />, scratch);
    expect(scratch.innerHTML).to.equal('');
  });

  it('drops attacker return value that is a Proxy pretending to be a vnode', () => {
    const Confined = confineComponent(() => {
      return new Proxy(
        { type: 'div', props: { children: 'x' } },
        {
          get(target, key) {
            return target[key];
          },
        },
      );
    });
    renderConfined(<Confined />, scratch);
    // Proxies have a real Object constructor so the coercer rejects them.
    expect(scratch.innerHTML).to.equal('');
  });

  it('a throwing getter on value.type aborts the value, not the host render', () => {
    const Confined = confineComponent(() => ({
      constructor: undefined,
      get type() {
        throw new Error('hostile type getter');
      },
      props: { children: 'x' },
    }));
    expect(() =>
      renderConfined(
        <div class="host">
          <Confined />
          <span class="next">still here</span>
        </div>,
        scratch,
      ),
    ).to.not.throw();
    // the host's sibling rendered normally
    expect(scratch.querySelector('.next').textContent).to.equal('still here');
  });

  it('a throwing getter on value.props aborts the value, not the host render', () => {
    const Confined = confineComponent(() => ({
      constructor: undefined,
      type: 'div',
      get props() {
        throw new Error('hostile props getter');
      },
    }));
    expect(() =>
      renderConfined(
        <div class="host">
          <Confined />
          <span class="next">still here</span>
        </div>,
        scratch,
      ),
    ).to.not.throw();
    expect(scratch.querySelector('.next').textContent).to.equal('still here');
  });

  it('a throwing getter on value.key aborts the value, not the host render', () => {
    const Confined = confineComponent(() => ({
      constructor: undefined,
      type: 'div',
      props: { children: 'x' },
      get key() {
        throw new Error('hostile key getter');
      },
    }));
    expect(() =>
      renderConfined(
        <div class="host">
          <Confined />
          <span class="next">still here</span>
        </div>,
        scratch,
      ),
    ).to.not.throw();
    expect(scratch.querySelector('.next').textContent).to.equal('still here');
  });

  it('replaces a vnode with a class-instance .type with a Fragment', () => {
    class Sneaky {}
    const Confined = confineComponent(({ h, Fragment }) =>
      // Build a real vnode but with a banned class as its type
      h(Sneaky, null, h('span', null, 'kept-child')),
    );
    renderConfined(<Confined />, scratch);
    expect(scratch.querySelector('span').textContent).to.equal('kept-child');
  });

  it('coerces a string return value to a text node', () => {
    const Confined = confineComponent(() => 'just text');
    renderConfined(
      <div>
        <Confined />
      </div>,
      scratch,
    );
    expect(scratch.firstChild.textContent).to.equal('just text');
  });

  it('coerces an array return value', () => {
    const Confined = confineComponent(({ h }) => [
      h('span', { class: 'a' }, '1'),
      h('span', { class: 'b' }, '2'),
    ]);
    renderConfined(
      <div>
        <Confined />
      </div>,
      scratch,
    );
    expect(scratch.querySelectorAll('span')).to.have.lengthOf(2);
    expect(scratch.querySelector('.a').textContent).to.equal('1');
    expect(scratch.querySelector('.b').textContent).to.equal('2');
  });

  it('attacker rendering a disallowed tag still hits the secure allowlist', () => {
    const Confined = confineComponent(({ h }) =>
      h('div', null, h('script', null, 'alert(1)'), 'after'),
    );
    renderConfined(<Confined />, scratch);
    expect(scratch.querySelector('script')).to.equal(null);
    expect(scratch.firstChild.textContent).to.equal('alert(1)after');
  });

  it('attacker on-handler still receives a SafeEvent (no DOM access)', () => {
    let captured;
    const Confined = confineComponent(({ h }) =>
      h(
        'button',
        {
          onClick: e => {
            captured = e;
          },
        },
        'go',
      ),
    );
    renderConfined(<Confined />, scratch);
    scratch.querySelector('button').click();
    expect(captured).to.exist;
    expect(captured instanceof Event).to.equal(false);
    expect(captured.target.parentNode).to.equal(undefined);
    expect(captured.target.tagName).to.equal('button');
  });

  it('host children appear as opaque sentinels the attacker cannot inspect', () => {
    let firstChildVNode;
    const Confined = confineComponent(({ h }, props) => {
      firstChildVNode = props.children[0];
      return h('div', null, props.children);
    });
    renderConfined(
      <Confined>
        <span class="hostlabel">host-content</span>
      </Confined>,
      scratch,
    );
    expect(firstChildVNode).to.exist;
    // The sentinel's type is the OpaqueChild marker, not the host's `span`.
    expect(firstChildVNode.type).to.not.equal('span');
    // And the sentinel's own props carry no reference to the host vnode.
    const ownProps = Object.keys(firstChildVNode.props).filter(
      k => k !== 'key',
    );
    ownProps.forEach(k => {
      const v = firstChildVNode.props[k];
      expect(v && v.type).to.not.equal('span');
    });
    // Host content nonetheless reaches the DOM.
    expect(scratch.querySelector('.hostlabel').textContent).to.equal(
      'host-content',
    );
  });

  it('opaque slot renders host content inside a HostPassthrough (host refs work)', () => {
    const hostRef = createRef();
    const Confined = confineComponent(({ h }, props) =>
      h('section', null, props.children),
    );
    renderConfined(
      <Confined>
        <div ref={hostRef}>trusted</div>
      </Confined>,
      scratch,
    );
    // The ref attached on host content gets the live DOM node — that is
    // the explicit purpose of HostPassthrough (host trusts its own subtree).
    expect(hostRef.current).to.be.instanceof(Element);
    expect(hostRef.current.textContent).to.equal('trusted');
  });

  it('two host children render at the positions the attacker placed them', () => {
    const Confined = confineComponent(({ h }, props) =>
      h(
        'div',
        null,
        h('header', null, props.children[0]),
        h('footer', null, props.children[1]),
      ),
    );
    renderConfined(
      <Confined>
        <span class="A">A</span>
        <span class="B">B</span>
      </Confined>,
      scratch,
    );
    expect(scratch.querySelector('header .A').textContent).to.equal('A');
    expect(scratch.querySelector('footer .B').textContent).to.equal('B');
  });

  it('confined components can nest', () => {
    const Inner = confineComponent(({ h }, props) =>
      h('span', { class: 'inner' }, props.label),
    );
    const Outer = confineComponent(({ h }, props) =>
      h('div', { class: 'outer' }, h(Inner, { label: props.text })),
    );
    // The outer attacker references Inner by closure — but that only
    // works because confineComponent allows confined functions as
    // vnode types. Verify rendering hooks up correctly.
    renderConfined(<Outer text="hello" />, scratch);
    expect(scratch.querySelector('.outer .inner').textContent).to.equal(
      'hello',
    );
  });

  it('rejects an unknown function as vnode.type, replacing with Fragment', () => {
    const evilType = () => 'whatever';
    const Confined = confineComponent(({ h }) =>
      h(evilType, null, h('span', null, 'kept')),
    );
    renderConfined(<Confined />, scratch);
    expect(scratch.querySelector('span').textContent).to.equal('kept');
  });

  it('attacker throwing during render renders nothing (handled, not propagated)', () => {
    const Confined = confineComponent(() => {
      throw new Error('boom');
    });
    // Wrap in a host element so we can observe the empty slot.
    renderConfined(
      <div class="slot">
        <Confined />
      </div>,
      scratch,
    );
    expect(scratch.querySelector('.slot').children.length).to.equal(0);
  });

  it('onError option fires with the thrown value', () => {
    const captured = [];
    const Confined = confineComponent(
      () => {
        throw new Error('boom');
      },
      {
        onError: err => {
          captured.push(err);
        },
      },
    );
    renderConfined(<Confined />, scratch);
    expect(captured).to.have.lengthOf(1);
    expect(captured[0].message).to.equal('boom');
  });

  it('an onError that itself throws does not break the host render', () => {
    const Confined = confineComponent(
      () => {
        throw new Error('boom');
      },
      {
        onError: () => {
          throw new Error('telemetry exploded');
        },
      },
    );
    expect(() => {
      renderConfined(
        <div class="host">
          <Confined />
          <span class="next">still here</span>
        </div>,
        scratch,
      );
    }).to.not.throw();
    expect(scratch.querySelector('.next').textContent).to.equal('still here');
  });

  it('preserves attacker keys across re-render: keyed list reorder reuses DOM nodes', () => {
    // Each <li> we render carries a known DOM node we can identify
    // by data-attribute. After a reorder, those same physical nodes
    // should appear in the new positions if keys reconciled.
    let setOrder;
    function Host() {
      const order = ['a', 'b', 'c'];
      // We expose setOrder by closing over it from a host hook.
      // Simpler: render twice with different orders.
      return null;
    }
    const Confined = confineComponent(({ h }, props) =>
      h(
        'ul',
        null,
        ...props.items.map(k => h('li', { key: k, 'data-k': k }, String(k))),
      ),
    );
    renderConfined(<Confined items={['a', 'b', 'c']} />, scratch);
    const before = Array.from(scratch.querySelectorAll('li'));
    const byKey = new Map(before.map(li => [li.getAttribute('data-k'), li]));

    renderConfined(<Confined items={['c', 'a', 'b']} />, scratch);
    const after = Array.from(scratch.querySelectorAll('li'));

    // Same DOM nodes, just rearranged — proves keys round-tripped.
    expect(after[0]).to.equal(byKey.get('c'));
    expect(after[1]).to.equal(byKey.get('a'));
    expect(after[2]).to.equal(byKey.get('b'));
  });

  it('Proxy props that throws on Object.keys is handled, not propagated', () => {
    const Confined = confineComponent(({ h }) => {
      const proxiedProps = new Proxy(
        { label: 'visible' },
        {
          ownKeys() {
            throw new Error('no listing');
          },
        },
      );
      // Attacker returns a vnode whose props is a hostile proxy. The
      // coercer must walk it defensively and not propagate the throw.
      return { type: 'div', props: proxiedProps, constructor: undefined };
    });
    expect(() => renderConfined(<Confined />, scratch)).to.not.throw();
    // Coercer dropped all props; the div is empty.
    expect(scratch.querySelector('div')).to.exist;
  });

  it('style getters do not fire during commit', () => {
    let getterCalls = 0;
    const Confined = confineComponent(({ h }) => {
      const style = {};
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
      return h('div', { style }, 'x');
    });
    renderConfined(<Confined />, scratch);
    // The accessor `color` is dropped by `shallowDataCopy`; only the
    // data property `backgroundColor` survives.
    expect(getterCalls).to.equal(0);
    const div = scratch.querySelector('div');
    expect(div.style.color).to.equal('');
    expect(div.style.backgroundColor).to.equal('blue');
  });

  it('Symbol-keyed prop getters do not fire', () => {
    let getterCalls = 0;
    const evilKey = Symbol('evil');
    const Confined = confineComponent(({ h }) => {
      const props = {};
      Object.defineProperty(props, evilKey, {
        get() {
          getterCalls++;
          return 'leak';
        },
        enumerable: true,
      });
      Object.defineProperty(props, 'children', {
        value: h('span', null, 'ok'),
        enumerable: true,
      });
      return { type: 'div', props, constructor: undefined };
    });
    renderConfined(<Confined />, scratch);
    expect(getterCalls).to.equal(0);
    expect(scratch.querySelector('span').textContent).to.equal('ok');
  });

  it('confined component nested inside a HostPassthrough re-engages sanitization', () => {
    const hostRefInExit = createRef();
    const refInsideConfined = createRef();
    const Confined = confineComponent(({ h }) =>
      // Attacker inside the confined component tries to attach a ref.
      h('div', { ref: refInsideConfined }, 'attacker'),
    );
    // Tree: renderConfined root -> div -> HostPassthrough -> Confined.
    // The HostPassthrough creates a trusted island where host refs work,
    // but a `Confined` inside it must STILL strip attacker refs.
    renderConfined(
      <div>
        <HostPassthrough>
          <div ref={hostRefInExit}>host inside exit</div>
          <Confined />
        </HostPassthrough>
      </div>,
      scratch,
    );
    expect(hostRefInExit.current).to.be.instanceof(Element);
    // Attacker ref must still be null — Confined re-enters secure context.
    expect(refInsideConfined.current).to.equal(null);
  });

  it('multi-mount with different children does not leak old slots', () => {
    // Mount, unmount, re-mount the same confined component with a
    // different host child. Ensure the new mount renders the new
    // host child (not the old one) — would fail if the WeakMap
    // lookup picked up a stale slot.
    const Confined = confineComponent(({ h }, props) =>
      h('section', null, props.children),
    );
    renderConfined(
      <Confined>
        <span class="first">FIRST</span>
      </Confined>,
      scratch,
    );
    expect(scratch.querySelector('.first')).to.exist;
    unmount(scratch);
    scratch = setupScratch();
    renderConfined(
      <Confined>
        <span class="second">SECOND</span>
      </Confined>,
      scratch,
    );
    expect(scratch.querySelector('.first')).to.equal(null);
    expect(scratch.querySelector('.second').textContent).to.equal('SECOND');
  });

  it('host children keep stable identity across re-renders (host refs persist)', () => {
    // If the opaque-slot wrapping lost keys, the host's <div> would be
    // torn down + remounted on each render, and the host's ref would
    // receive `null` then a new element.
    const refHistory = [];
    const hostRef = el => {
      refHistory.push(el);
    };
    const Confined = confineComponent(({ h }, props) =>
      h('section', null, props.children),
    );
    renderConfined(
      <Confined key="x">
        <div ref={hostRef}>persistent</div>
      </Confined>,
      scratch,
    );
    const firstEl = refHistory[refHistory.length - 1];
    // re-render with the same children
    renderConfined(
      <Confined key="x">
        <div ref={hostRef}>persistent</div>
      </Confined>,
      scratch,
    );
    const lastEl = refHistory[refHistory.length - 1];
    expect(firstEl).to.be.instanceof(Element);
    expect(lastEl).to.equal(firstEl);
  });

  it('attacker ref via endowments.h is dropped (coercer + secure layers cooperate)', () => {
    const seen = {};
    const Confined = confineComponent(({ h }, props) => {
      seen.frozen = Object.isFrozen(props);
      seen.ref = props.ref;
      // Attacker attempts to attach a ref to grab the DOM.
      const stealRef = el => {
        seen.stolen = el;
      };
      return h('div', { ref: stealRef, class: 'attacker' }, 'x');
    });
    renderConfined(<Confined hi="there" />, scratch);
    expect(seen.frozen).to.equal(true);
    // The host's props sent through the wrapper do NOT include a ref
    // even if the host hadn't passed one — the field is just absent.
    expect(seen.ref).to.equal(undefined);
    // The attacker's ref was dropped by the coercer; defense-in-depth
    // also strips refs via the secure layer's sanitize.
    expect(seen.stolen).to.equal(undefined);
    expect(scratch.querySelector('.attacker').textContent).to.equal('x');
  });

  // Regression: forged `_isSecureExit` flag must not bump the secure
  // renderer's trustedExitDepth. Identity check on `HostPassthrough` is the
  // only trust gate; flags can be set by attacker code.
  it('refuses to enter trusted-exit mode on attacker-flagged function', () => {
    let stolen;
    const Confined = confineComponent(({ h }) => {
      function FakeExit() {
        return h(
          'div',
          {
            ref: el => {
              if (el) stolen = el;
            },
          },
          'leak',
        );
      }
      FakeExit._isSecureExit = true;
      return h(FakeExit, null);
    });
    renderConfined(<Confined />, scratch);
    // FakeExit was rejected by coerceType (replaced with Fragment),
    // so its body never ran. Even if it had, the renderer's identity
    // gate on `trustedExitTypes` would refuse the bracket.
    expect(stolen).to.equal(undefined);
  });

  // Regression: forged `_isSecureBoundary` flag must not let attacker
  // pick the allowlist for its subtree.
  it('refuses to honor attacker-flagged _isSecureBoundary', () => {
    const Confined = confineComponent(({ h }) => {
      function FakeBoundary(props) {
        return props.children;
      }
      FakeBoundary._isSecureBoundary = true;
      return h(
        FakeBoundary,
        { _allowedTags: new Set(['script', 'div']) },
        h('script', null, 'window.__SCRIPT_RAN = true'),
      );
    });
    window.__SCRIPT_RAN = undefined;
    renderConfined(<Confined />, scratch);
    expect(window.__SCRIPT_RAN).to.equal(undefined);
    expect(scratch.querySelector('script')).to.equal(null);
  });

  // Regression: coercer must drop `ref` from a HAND-BUILT vnode where
  // the attacker put ref in `props` (not via `h()`).
  it('drops ref from attacker hand-built vnode props (defense-in-depth via coercer)', () => {
    // The compartment coercer drops `ref` from any attacker prop
    // bag at `compartment/src/index.js:DROPPED_PROPS_ALWAYS`. The
    // secure layer's `sanitizeVNode` also nulls `vnode.ref` —
    // either defense alone is sufficient. This test verifies the
    // coercer-side drop by feeding a hand-built vnode (which would
    // bypass `h()`'s normal key/ref extraction) into the system.
    let stolen;
    const Confined = confineComponent(() => ({
      constructor: undefined,
      type: 'div',
      props: {
        ref: el => {
          if (el) stolen = el;
        },
        children: 'x',
      },
    }));
    renderConfined(<Confined />, scratch);
    expect(stolen).to.equal(undefined);
    expect(scratch.querySelector('div').textContent).to.equal('x');
  });

  // Regression: cross-mount opaque-slot reuse. The previous design
  // used a module-global WeakMap, so an attacker could stash an
  // `OpaqueChild` reference and a slot from tenant A, then use them
  // in tenant B's render to resurrect tenant A's host vnode.
  it("cross-mount slot reuse cannot resurrect another tenant's host vnode", () => {
    let stashedOpaque;
    let stashedSlot;
    const grabber = confineComponent((endowments, props) => {
      stashedOpaque = props.children[0].type;
      stashedSlot = props.children[0].props._slot;
      return null;
    });
    renderConfined(
      <grabber>
        <div class="secret-from-A">SECRET-A</div>
      </grabber>,
      scratch,
    );

    teardown(scratch);
    scratch = setupScratch();

    const attacker = confineComponent((endowments, _props) =>
      endowments.h(stashedOpaque, { _slot: stashedSlot }),
    );
    renderConfined(<attacker />, scratch);
    // The OLD slot map was cleared on diffed(grabber); the new map
    // (for the attacker confined) has no entry for stashedSlot.
    expect(scratch.querySelector('.secret-from-A')).to.equal(null);
  });

  // Regression: HostPassthrough reference must not be extractable by the
  // attacker via OpaqueChild's render output. Previously OpaqueChild
  // returned `h(HostPassthrough, null, …)` — calling it manually exposed
  // the HostPassthrough function on the returned vnode's `.type`. The fix:
  // OpaqueChild returns the realChild directly; trusted-exit semantics
  // arrive via secure's identity check on OpaqueChild itself.
  it('OpaqueChild render does not expose HostPassthrough via its output', () => {
    let openOpaqueChild;
    const Confined = confineComponent(({ h }, props) => {
      openOpaqueChild = props.children[0].type;
      return h('span', null, 'visible');
    });
    renderConfined(
      <Confined>
        <span>host</span>
      </Confined>,
      scratch,
    );
    // Call OpaqueChild manually with a non-matching slot so we get
    // the slot-miss path. We must NOT see a HostPassthrough-typed vnode
    // in its output.
    const out = openOpaqueChild({ _slot: Object.freeze({}) });
    // In the new design, OpaqueChild returns the realChild or null,
    // not a wrapped vnode that exposes HostPassthrough.
    expect(out).to.equal(null);
  });

  // Regression: a Confined component nested inside a HostPassthrough must
  // re-engage sanitization. The previous code's `options.vnode` and
  // `options._render` hooks short-circuited whenever
  // `trustedExitDepth > 0`, so an attacker confined inside a host
  // `<HostPassthrough>` island rendered `<script>` and arbitrary JS with
  // raw DOM events. The fix: Confined wrappers register as
  // secure-reentry types; their _render resets trustedExitDepth and
  // re-enters secure mode for the subtree.
  it('Confined inside HostPassthrough re-engages sanitization (script blocked)', () => {
    window.__pwned_in_exit = undefined;
    const Attacker = confineComponent(({ h }) =>
      h(
        'div',
        null,
        h('script', null, 'window.__pwned_in_exit = true;'),
        h('a', { href: 'javascript:alert(1)' }, 'evil-link'),
      ),
    );
    renderConfined(
      <HostPassthrough>
        <Attacker />
      </HostPassthrough>,
      scratch,
    );
    // <script> replaced with Fragment; its source rendered as text only.
    expect(scratch.querySelector('script')).to.equal(null);
    expect(window.__pwned_in_exit).to.equal(undefined);
    // javascript: URL stripped.
    const a = scratch.querySelector('a');
    expect(a.hasAttribute('href')).to.equal(false);
  });

  it('Confined inside HostPassthrough still gets SafeEvent (not raw DOM Event)', () => {
    let captured;
    const Attacker = confineComponent(({ h }) =>
      h(
        'button',
        {
          onClick: e => {
            captured = e;
          },
        },
        'go',
      ),
    );
    renderConfined(
      <HostPassthrough>
        <Attacker />
      </HostPassthrough>,
      scratch,
    );
    scratch.querySelector('button').click();
    expect(captured).to.exist;
    expect(captured instanceof Event).to.equal(false);
    // safe target snapshot (not a live Element)
    expect(captured.target instanceof Element).to.equal(false);
  });

  // Regression: setState called synchronously inside the attacker's
  // render fires Preact's do-while loop. Previously, each iteration
  // would push the slot map / depth bracket without a matching pop,
  // leaving secureRenderDepth permanently elevated and polluting
  // later host renders.
  it('setState-in-render does not leak depth into subsequent renders', () => {
    const Attacker = confineComponent(({ h, useState }) => {
      const [n, setN] = useState(0);
      if (n < 3) setN(n + 1);
      return h('div', null, `n=${n}`);
    });
    renderConfined(<Attacker />, scratch);

    // Probe: after the attacker's setState-in-render storm, a plain
    // preact.render into a separate container with a ref must STILL
    // receive the live DOM node (i.e., sanitization is off — depth
    // counter recovered).
    teardown(scratch);
    scratch = setupScratch();
    const ref = createRef();
    render(<div ref={ref}>x</div>, scratch);
    expect(ref.current).to.be.instanceof(Element);
  });

  // Regression: case-variant event handlers (e.g. `OnError`) used to
  // bypass our `on*` detection (case-sensitive `o`+`n` check) and
  // Preact's `name in dom` lookup (also case-sensitive), then survive
  // to `setAttribute('OnError', value)` — at which point the browser
  // normalizes to the canonical `onerror` content attribute and parses
  // the value as inline JS (full RCE).
  it('case-variant event handlers (OnError, OnLoad) are dropped', () => {
    window.__pwned_case = undefined;
    const Attacker = confineComponent(({ h }) =>
      h('img', {
        src: 'http://127.0.0.1:1/__404__',
        OnError: 'window.__pwned_case = 1;',
        OnLoad: 'window.__pwned_case = 2;',
        oNERROR: 'window.__pwned_case = 3;',
      }),
    );
    renderConfined(<Attacker />, scratch);
    const img = scratch.querySelector('img');
    expect(img.hasAttribute('onerror')).to.equal(false);
    expect(img.hasAttribute('onload')).to.equal(false);
    expect(img.hasAttribute('OnError')).to.equal(false);
    // Give the img a chance to fail to load and fire the event.
    return new Promise(resolve => setTimeout(resolve, 100)).then(() => {
      expect(window.__pwned_case).to.equal(undefined);
    });
  });

  // Regression: case-variant URL attributes (e.g. `HREF`) used to
  // bypass URL_ATTRS scheme validation (case-sensitive), get
  // `setAttribute('HREF', 'javascript:...')`, and end up as the
  // canonical `href` content attribute the browser uses on click.
  it('case-variant URL attributes are scheme-checked', () => {
    const Attacker = confineComponent(({ h }) =>
      h(
        'div',
        null,
        h('a', { HREF: 'javascript:window.__pwned_url=1' }, 'evil1'),
        h('a', { Href: 'javascript:window.__pwned_url=2' }, 'evil2'),
      ),
    );
    renderConfined(<Attacker />, scratch);
    const anchors = scratch.querySelectorAll('a');
    for (const a of anchors) {
      // No case-variant href attribute survived.
      expect(a.hasAttribute('href')).to.equal(false);
      expect(a.hasAttribute('HREF')).to.equal(false);
      expect(a.hasAttribute('Href')).to.equal(false);
      expect(a.href).to.equal('');
    }
  });

  // Regression: OpaqueChild called directly as a function used to
  // return the host vnode, letting the attacker walk the host
  // vnode tree and invoke host component closures.
  it('OpaqueChild direct call does not leak the host vnode', () => {
    let leaked = 'untouched';
    const Attacker = confineComponent((_endowments, props) => {
      const sentinel = props.children[0];
      // Attacker has the OpaqueChild function and a valid slot.
      // Call it directly. The token guard means this returns null
      // instead of the host vnode.
      try {
        leaked = sentinel.type({ _slot: sentinel.props._slot });
      } catch (_) {
        leaked = '__threw__';
      }
      return null;
    });
    // Build a host child whose vnode object we can inspect for
    // leakage. The vnode has `type === 'span'` — if the attacker
    // got it, `leaked.type === 'span'`.
    renderConfined(
      <Attacker>
        <span class="hostsecret">SECRET</span>
      </Attacker>,
      scratch,
    );
    expect(leaked).to.equal(null);
  });

  // Regression: `_registerTrustedExitType` and
  // `_registerSecureReentryType` must refuse to put the same
  // function in both sets. Without mutual exclusion, a setState-in-
  // render loop could enter the reentry branch on iter 1 and the
  // trusted-exit branch on iter 2, flipping sanitization off.
  it('cannot register a function as both trusted-exit and secure-reentry', async () => {
    const { _registerTrustedExitType, _registerSecureReentryType } =
      await import('../src/renderer.js');
    function aFunction() {}
    _registerTrustedExitType(aFunction);
    expect(() => _registerSecureReentryType(aFunction)).to.throw(
      /both a trusted-exit type and a secure-reentry type/,
    );
  });

  // Regression: an error boundary INSIDE a Confined subtree catches
  // a deeper child's throw. The bracket-cleanup contract requires
  // every layer's `_render` push to be matched by a `diffed` or
  // `_catchError` pop. With an error-boundary swallowing the throw,
  // the boundary's parent diff continues normally and `diffed` fires
  // for all bracketed ancestors. After the recovery, a follow-up
  // host render must observe sanitization in its normal balanced
  // state (the ref below stays null because we're inside a secure
  // tree).
  it('error boundary inside Confined cleans up brackets correctly', () => {
    class HostBoundary extends Component {
      constructor(props) {
        super(props);
        this.state = { err: null };
      }

      componentDidCatch(err) {
        this.setState({ err: err.message });
      }

      render(props, state) {
        if (state.err)
          return createElement('span', { class: 'caught' }, state.err);
        return props.children;
      }
    }
    const Boomer = confineComponent(({ h }) => h(BoomChild));
    function BoomChild() {
      throw new Error('boom');
    }
    // HostBoundary is host code (outside the confined subtree).
    // It catches the throw from BoomChild that bubbles up out of
    // the Confined render.
    renderConfined(
      createElement(HostBoundary, null, createElement(Boomer, null)),
      scratch,
    );
    // Followup host render in the same scratch — must NOT have
    // inherited any stale depth/exit state from the throw above.
    renderConfined(<div class="after">ok</div>, scratch);
    expect(scratch.querySelector('.after').textContent).to.equal('ok');
  });

  // Compartment relies on `preact/secure`'s allow-by-default attr
  // filter to block `innerHTML`, `srcdoc`, case-variant `OnError`,
  // `javascript:` URLs, and prototype-pollution-driven sinks — the
  // compartment-side coercer no longer mirrors any of that. A host
  // rendering a Confined component WITHOUT `renderConfined` on top
  // would silently expose itself to all of those vectors. Refuse to
  // render and throw a clear error instead.
  it('Confined throws if rendered outside a renderConfined tree', () => {
    const Confined = confineComponent(({ h }) => h('div', null, 'x'));
    // Plain preact render (no renderConfined). The Confined's render
    // function should detect this and throw.
    expect(() => render(createElement(Confined, null), scratch)).to.throw(
      /renderConfined/,
    );
  });
});
