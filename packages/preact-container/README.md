# @endo/preact-container

Mount **untrusted** Preact component code inside an ordinary Preact tree,
without handing it the live DOM.

This is a best-effort containment layer — not an absolute security
boundary. It raises the cost of escape and closes the obvious DOM-access
and HTML-injection channels, but it depends on SES `lockdown()` for its
core guarantees and does not stop every ambient-authority side channel
(see "Known gaps" below). Treat it as one layer of defense-in-depth, not
a substitute for a process/origin/iframe boundary or a Content Security
Policy.

The package ships two entry points:

- **`@endo/preact-container/renderer`** — a sanitizing renderer.
  Component code rendered through `renderConfined` does not see DOM
  nodes, raw DOM `Event` objects, or ambient authority the host did not
  explicitly hand it. It strips refs, blocks dangerous tag names,
  validates URL schemes, filters attributes with an allow-by-default
  allowlist, and wraps event listeners into a frozen `SafeEvent` facade.
- **`@endo/preact-container/compartment`** — mounts a function the host
  evaluated in a SES `Compartment` (or any untrusted function) as a
  Preact component. It coerces whatever the function returns by walking
  it once and rebuilding it with primitives this package controls, then
  renders the result through the renderer above.

```js
import {
  renderConfined,
  unmount,
  HostPassthrough,
} from '@endo/preact-container/renderer';
import {
  confineComponent,
  isConfinedComponent,
} from '@endo/preact-container/compartment';
```

## Provenance

This is a port of the `preact/secure` and `preact/compartment` add-ons
from <https://github.com/kumavis/preact/pull/1> (MIT). The renderer's
public API was renamed on the way in (`secureRender` → `renderConfined`,
`SecureExit` → `HostPassthrough`, `preact/secure` →
`@endo/preact-container/renderer`) to avoid overstating the guarantee.

The original lives inside the Preact monorepo, where Preact's internal
option-hook and vnode field names are renamed at build time via
`mangle.json`. Because this package depends on the **published** `preact`
package instead, the three internal names it touches are referenced by
their stable mangled forms (`options.__r` for `_render`, `options.__e`
for `_catchError`, `vnode.__` for `_parent`). See the comment block at
the top of `src/renderer.js`.

## SES / lockdown is a hard precondition

> ⚠️ Call `lockdown({ overrideTaming: 'severe' })` **before** evaluating
> any untrusted component source.

Two independent reasons:

1. **Containment integrity.** Without `lockdown()`, every endowment
   handed to confined code exposes the host realm's `Function` via its
   `.constructor` chain — an attacker can do
   `endowments.h.constructor('return globalThis')()` and reach
   `globalThis`, `document`, `window`, and every module the host
   imported. `lockdown()` tames the `Function` constructor and that
   escape ceases to exist. `@endo/preact-container/compartment` emits a
   one-time `console.warn` when it cannot detect a successful lockdown
   (`typeof globalThis.harden === 'function'`).

2. **`overrideTaming: 'severe'` is required for Preact to run at all.**
   Preact instantiates function components by assigning
   `component.constructor = type` (see Preact's `diff/index.js`). Under
   the default lockdown that assignment hits the SES "override mistake":
   `Object.prototype.constructor` is a frozen, non-writable data
   property, so assigning a `constructor` that resolves up the prototype
   chain throws. The `'severe'` enablement sets `'%ObjectPrototype%':
   '*'`, which makes every `Object.prototype` property — including
   `constructor` — overridable, so the assignment succeeds. `'min'` and
   `'moderate'` do **not** enable `constructor`. The lockdown is still
   real: primordials are frozen and compartment isolation is in force.

```js
import 'ses';

lockdown({ overrideTaming: 'severe' });

// The host evaluates untrusted source in its own compartment.
const compartment = new Compartment(/* host's chosen globals */);
const guestFn = compartment.evaluate(`
  ({ h, useState }, props) => {
    const [n, setN] = useState(0);
    return h('button', { onClick: () => setN(p => p + 1) },
      'clicked ' + n + ' times');
  }
`);

const Widget = confineComponent(guestFn, { name: 'Widget' });
renderConfined(h(Widget, null), document.getElementById('root'));
```

The confined function's signature is **`(endowments, props)`**, not
React's `(props)`. `endowments` is a frozen bundle of `h`, `Fragment`,
and the Preact hooks — the only way to acquire those inside the
container.

## `@endo/preact-container/renderer`

### `renderConfined(vnode, parentDom, opts?)`

Render `vnode` into `parentDom` through the sanitizer. Re-call with the
same `parentDom` to update.

- `opts.allowedTags` — an iterable of tag names that **replaces** the
  default tag allowlist for this tree.
- `opts.allowedAttrs` — an iterable of attribute names that **extends**
  the default attribute allowlist for this tree (additive). `aria-*`,
  `data-*`, and `on*` handlers are always allowed. A `HARD_DENY_ATTRS`
  set refuses opt-in for the historical attack surface (`innerHTML`,
  `srcdoc`, the `HTMLHyperlinkElementUtils` URL setters, any `on*` name,
  `nonce`, `is`, …) — attempting to add one throws synchronously.

The renderer defends against live DOM access (refs), raw DOM events
(every handler receives a frozen `SafeEvent`), HTML injection / live
DOM-setter abuse (the allow-by-default attribute filter rebuilds the
prop bag with a null prototype), dangerous element types (replaced with
`Fragment`), URL-scheme injection (`javascript:` etc. dropped), and
inline event-handler strings.

### `unmount(parentDom)`

Tear down the tree rooted at `parentDom`.

### `HostPassthrough`

Renders its children with sanitization turned off. Use only with vnodes
the host fully controls (e.g. transcluding host-supplied content through
an untrusted component — which `@endo/preact-container/compartment` does
for its opaque-children mechanism).

### Known gaps — ambient authority (NOT covered)

The sanitizer blocks _direct_ DOM access and HTML injection, but the
browser still fires side effects merely because a sanitized element is
in the tree: `<img src>` / media auto-fetch, inline `style` `url(...)`
fetches, `<a ping>`, and cross-origin form `action`. Layer a strict
Content Security Policy (or an iframe/origin boundary) on top if your
threat model requires blocking those channels.

## `@endo/preact-container/compartment`

### `confineComponent(fn, opts?)`

Wrap an untrusted function as a Preact function component. `fn` is called
with `(endowments, props)`. `props.children`, if any, is an array of
opaque sentinel vnodes the guest can position but not inspect.

`opts.name` sets the devtools display name; `opts.onError` is invoked
when the guest function throws (the host render is not interrupted;
exceptions from `onError` itself are swallowed).

A confined component mounted via plain `preact.render` (i.e. **without**
`renderConfined` on top) **throws synchronously** — the allow-by-default
attribute filter lives in the renderer, so rendering without it would
silently expose the host to HTML injection. Merely _defining_ a confined
component arms this fail-fast.

### `isConfinedComponent(value)`

Returns `true` for wrappers returned by `confineComponent`.

## Tests

The test suite is the upstream browser suite, ported to run with
[Vitest](https://vitest.dev) in headless Chromium via the Playwright
provider.

```sh
yarn test
```

This is intentionally **not** the AVA-based harness the rest of the Endo
monorepo uses: the renderer is a DOM library and its behavior (ref
stripping, event-facade isolation, DOM unreachability via
`@lavamoat/lavatube`) can only be exercised in a real browser.
