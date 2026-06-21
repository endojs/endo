# Reusable Preact components

Generic, app-wide Preact components shared across the chat UI.
Feature-specific components live next to their feature instead — e.g. the
inventory's components are in [`../inventory/`](../inventory/).

This directory is populated as the imperative UI migrates onto Preact (see
[`../designs/preact-confinement-migration.md`](../designs/preact-confinement-migration.md));
a piece moves here once a second caller wants it.

## Common component format

Every component file — here and in feature directories — follows the same
shape:

- Plain `.js`, **no JSX**. Start with `// @ts-check`.
- Import `h` / `Fragment` / hooks from the app barrel
  [`../setup-preact-container.js`](../setup-preact-container.js) (which
  re-exports `@endo/preact-container` under the app's severe lockdown). Never
  import `preact` directly.
- One component, or a small cohesive set, per file. Name the file in
  kebab-case after the component (`popup-menu.js` → `PopupMenu`).
- Describe props with a JSDoc `@param {object} props` block (or a `@typedef`).
- `harden(Component)` immediately after the declaration — named exports must
  be hardened.
- Components are **pure views**: no daemon access (`E`, powers) and no ambient
  DOM mutation. Effects arrive through callback props; the host owns the mount
  lifecycle (`renderConfined` / `unmount`).

Example:

```js
// @ts-check

import harden from '@endo/harden';

import { h } from '../setup-preact-container.js';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {boolean} [props.disabled]
 * @param {() => void} props.onClick
 */
export const Button = ({ label, disabled, onClick }) =>
  h('button', { class: 'btn', disabled, onClick }, label);
harden(Button);
```
