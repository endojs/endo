import { h } from 'preact';
import lavatube from '@lavamoat/lavatube';
import { renderConfined, unmount } from '../src/renderer.js';
import { confineComponent } from '../src/compartment.js';
import { setupScratch, teardown } from './_util/helpers.js';

/**
 * lavatube reachability tests for the compartment layer.
 *
 * lavatube cannot peek into closures or invoke functions, so a negative
 * result is "no path found via property traversal" rather than a proof
 * of unreachability — but it's a strong defense-in-depth signal that:
 *  - the endowments bundle the attacker receives has no path to live
 *    DOM, document, or window;
 *  - the opaque sentinel object the attacker sees in its
 *    `props.children` has no path back to the original host vnode it
 *    represents (so the attacker cannot read the host's content
 *    structurally).
 */

describe('preact/compartment: reachability (lavatube)', () => {
  /** @type {HTMLDivElement} */
  let scratch;

  beforeEach(() => {
    scratch = setupScratch();
  });

  afterEach(() => {
    unmount(scratch);
    teardown(scratch);
  });

  it('endowments handed in to the attacker have no path to live DOM', () => {
    let seenEndowments;
    const Confined = confineComponent((endowments, _props) => {
      seenEndowments = endowments;
      return endowments.h('div', null, 'x');
    });
    renderConfined(h(Confined, null), scratch);
    const div = scratch.querySelector('div');
    expect(div).to.exist;

    // Positive sanity: lavatube CAN find the div when the start ref
    // actually owns it.
    expect(lavatube.find({ div }, div)).to.not.equal(undefined);

    expect(lavatube.find(seenEndowments, div)).to.equal(undefined);
    expect(lavatube.find(seenEndowments, document)).to.equal(undefined);
    expect(lavatube.find(seenEndowments, window)).to.equal(undefined);
    expect(lavatube.find(seenEndowments, scratch)).to.equal(undefined);
  });

  it('attacker props bag has no path to live DOM', () => {
    let seenProps;
    const Confined = confineComponent(({ h }, props) => {
      seenProps = props;
      return h('span', null, 'x');
    });
    renderConfined(
      h(Confined, {
        label: 'visible',
      }),
      scratch,
    );
    const span = scratch.querySelector('span');
    expect(lavatube.find(seenProps, span)).to.equal(undefined);
    expect(lavatube.find(seenProps, document)).to.equal(undefined);
    expect(lavatube.find(seenProps, window)).to.equal(undefined);
  });

  it('opaque sentinel object has no path to the host vnode it stands in for', () => {
    let seenSentinel;
    const Confined = confineComponent(({ h }, props) => {
      seenSentinel = props.children[0];
      return h('div', null, props.children);
    });
    // Build a host child that is identifiable as a JS object so we can
    // search for it. The host vnode IS what the sentinel must hide.
    const hostChild = h('span', { 'data-marker': 'X' }, 'hi');
    renderConfined(h(Confined, null, hostChild), scratch);

    expect(seenSentinel).to.exist;
    // Positive sanity: starting from an object that contains the host
    // vnode directly, lavatube finds it.
    expect(lavatube.find({ hostChild }, hostChild)).to.not.equal(undefined);

    // The sentinel must NOT lead to the host vnode.
    expect(lavatube.find(seenSentinel, hostChild)).to.equal(undefined);
    // And not to the rendered DOM node either.
    const spanDom = scratch.querySelector('[data-marker="X"]');
    expect(spanDom).to.exist;
    expect(lavatube.find(seenSentinel, spanDom)).to.equal(undefined);
  });
});
