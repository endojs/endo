import { h } from 'preact';
import lavatube from '@lavamoat/lavatube';
import { renderConfined, unmount } from '../src/renderer.js';
import { setupScratch, teardown } from './_util/helpers.js';

/**
 * These tests use @lavamoat/lavatube to walk the object graph reachable
 * from objects that component code receives, looking for paths back to
 * live DOM elements. lavatube cannot peek into closures or invoke
 * functions, so a negative result is "no path found via property
 * traversal" rather than a proof of unreachability — but it is a strong
 * defense-in-depth signal that the SafeEvent facade does not
 * accidentally hold a reference to a real DOM Element.
 */

function captureFirstHandlerArg(scratch) {
  let captured;
  renderConfined(
    h(
      'button',
      {
        onClick: e => {
          captured = e;
        },
      },
      'ok',
    ),
    scratch,
  );
  scratch.querySelector('button').click();
  return captured;
}

describe('preact/secure: dom unreachability (lavatube)', () => {
  /** @type {HTMLDivElement} */
  let scratch;

  beforeEach(() => {
    scratch = setupScratch();
  });

  afterEach(() => {
    unmount(scratch);
    teardown(scratch);
  });

  it('SafeEvent has no path to the live button it fired on', () => {
    const safe = captureFirstHandlerArg(scratch);
    const button = scratch.querySelector('button');
    expect(button).to.exist;
    // sanity: confirm lavatube *can* find the button when the start
    // reference actually contains it. Catches misconfiguration where
    // the negative tests below trivially pass for the wrong reason.
    expect(lavatube.find({ button }, button)).to.not.equal(undefined);

    const path = lavatube.find(safe, button);
    expect(path).to.equal(undefined);
  });

  it('SafeEvent has no path to document', () => {
    const safe = captureFirstHandlerArg(scratch);
    const path = lavatube.find(safe, document);
    expect(path).to.equal(undefined);
  });

  it('SafeEvent has no path to window', () => {
    const safe = captureFirstHandlerArg(scratch);
    const path = lavatube.find(safe, window);
    expect(path).to.equal(undefined);
  });

  it('SafeEvent has no path to the scratch container', () => {
    const safe = captureFirstHandlerArg(scratch);
    const path = lavatube.find(safe, scratch);
    expect(path).to.equal(undefined);
  });

  it('SafeEvent.target snapshot has no path back to the live element', () => {
    const safe = captureFirstHandlerArg(scratch);
    const button = scratch.querySelector('button');
    // the snapshot must not BE the live element
    expect(safe.target).to.not.equal(button);
    // and must not lead to it
    expect(lavatube.find(safe.target, button)).to.equal(undefined);
    expect(lavatube.find(safe.target, document)).to.equal(undefined);
  });

  it('SafeEvent.currentTarget snapshot has no path back to the live element', () => {
    const safe = captureFirstHandlerArg(scratch);
    const button = scratch.querySelector('button');
    expect(safe.currentTarget).to.not.equal(button);
    expect(lavatube.find(safe.currentTarget, button)).to.equal(undefined);
  });

  it('SafeEvent does not expose the underlying DOM Event via any field', () => {
    // Capture both the safe facade and the raw browser Event so we
    // can search for a path from one to the other.
    let safe;
    let raw;
    renderConfined(
      h(
        'button',
        {
          onClick: e => {
            safe = e;
          },
        },
        'ok',
      ),
      scratch,
    );
    const button = scratch.querySelector('button');
    button.addEventListener('click', e => {
      raw = e;
    });
    button.click();
    expect(safe).to.exist;
    expect(raw).to.exist;
    expect(safe).to.not.equal(raw);
    const path = lavatube.find(safe, raw);
    expect(path).to.equal(undefined);
  });

  it('SafeEvent passed to a deeply nested component still has no DOM path', () => {
    let captured;
    function Inner({ onPing }) {
      return h(
        'button',
        {
          onClick: e => {
            onPing(e);
          },
        },
        'inner',
      );
    }
    function Outer() {
      return h(
        'div',
        null,
        h(Inner, {
          onPing: e => {
            captured = e;
          },
        }),
      );
    }
    renderConfined(h(Outer, null), scratch);
    scratch.querySelector('button').click();

    const button = scratch.querySelector('button');
    expect(captured).to.exist;
    expect(lavatube.find(captured, button)).to.equal(undefined);
    expect(lavatube.find(captured, document)).to.equal(undefined);
  });
});
