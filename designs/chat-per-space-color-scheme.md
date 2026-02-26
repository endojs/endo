# Chat Per-Space Color Scheme

| | |
|---|---|
| **Date** | 2026-02-26 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Depends on** | [chat-color-schemes](chat-color-schemes.md) |

## Motivation

After [chat-color-schemes](chat-color-schemes.md) introduces system-preference
dark mode, there is no way for a user to override the system setting or to
choose a different scheme per space.
A user may prefer dark mode system-wide but want a specific space to use light
mode (or vice versa), or they may want to override the system default for the
entire Chat application.

The create/edit space flow already collects per-space configuration
(name, icon, profile path).
Adding a scheme selector here provides a natural surface for this preference
without introducing a separate settings panel.

## Design

### Scheme Values

```js
/**
 * @typedef {'auto' | 'light' | 'dark'} ColorScheme
 */
```

- `'auto'` — defer to the system's `prefers-color-scheme` media query
  (default)
- `'light'` — force the light scheme from
  [chat-color-schemes](chat-color-schemes.md)
- `'dark'` — force the dark scheme from
  [chat-color-schemes](chat-color-schemes.md)

### SpaceConfig Extension

```js
/**
 * @typedef {object} SpaceConfig
 * @property {string} id
 * @property {string} name
 * @property {string} icon
 * @property {string[]} profilePath
 * @property {'inbox'} mode
 * @property {ColorScheme} [scheme] - Color scheme preference (default: 'auto')
 */
```

The `scheme` property is optional.
Absent or `'auto'` both mean "follow system preference."
Existing persisted space configs that lack this field are treated as `'auto'`.

### Home Space

The home space (`id: 'home'`) is not persisted in the pet-store.
Its scheme is always `'auto'`.

### Application of the Scheme

When a space is selected, the scheme is applied by setting a `data-scheme`
attribute on the document element:

```js
const applyScheme = (scheme) => {
  if (scheme === 'auto' || scheme === undefined) {
    document.documentElement.removeAttribute('data-scheme');
  } else {
    document.documentElement.setAttribute('data-scheme', scheme);
  }
};
```

The CSS from [chat-color-schemes](chat-color-schemes.md) is restructured so
that the dark values are defined in both a media query (for `auto`) and an
attribute selector (for explicit override):

```css
/* System preference (auto) */
@media (prefers-color-scheme: dark) {
  :root:not([data-scheme="light"]) {
    /* dark values */
  }
}

/* Explicit dark override */
:root[data-scheme="dark"] {
  /* dark values */
}
```

When `data-scheme` is absent (auto), the media query governs.
When `data-scheme="light"`, the `:not([data-scheme="light"])` clause
suppresses the media query's dark values, and the light `:root` defaults
apply.
When `data-scheme="dark"`, the attribute selector forces dark values
regardless of the media query.

### Add/Edit Space Modal

The add-space modal gains a "Color scheme" field below the existing fields.
It presents three options as a segmented control (button group):

```
  Color scheme
  [ Auto ] [ Light ] [ Dark ]
```

- `Auto` is selected by default.
- The currently selected option uses `--accent-primary` styling, matching
  the icon picker's selected state.

### Gutter Indicator

When a space has an explicit scheme (not `'auto'`), a small indicator
appears on the space icon in the gutter: a half-moon icon for dark, a
sun icon for light.
This helps the user remember which spaces override the system default.

## Persistence

The scheme is stored as part of the `SpaceConfig` JSON value in the
pet-store, alongside the existing fields:

```js
const spaceConfig = {
  id,
  name,
  icon,
  profilePath,
  mode: 'inbox',
  scheme: 'dark', // or 'light' or 'auto'
};
```

### Migration

Existing space configs without a `scheme` field are valid.
`validateSpaceConfig` treats a missing or unrecognized `scheme` as `'auto'`:

```js
const scheme =
  obj.scheme === 'light' || obj.scheme === 'dark' ? obj.scheme : 'auto';
```

## Implementation

### Step 1: Restructure CSS for Attribute-Based Override

Refactor the `@media (prefers-color-scheme: dark)` block from
[chat-color-schemes](chat-color-schemes.md) into the dual-selector pattern
described above.

### Step 2: Add Scheme to SpaceConfig

- Extend the `SpaceConfig` typedef with `scheme`
- Update `validateSpaceConfig` to accept and default the field
- Call `applyScheme(space.scheme)` in the space selection handler

### Step 3: Add Scheme Picker to Add-Space Modal

- Add a segmented control to the modal form
- Include the `scheme` value in the submitted `SpaceFormData`

### Step 4: Add Gutter Indicator

- Render a scheme indicator icon on non-auto spaces

## Files

### Modified

- `packages/chat/index.css`:
  - Restructure dark mode selectors for attribute override
  - Add styles for scheme segmented control
  - Add styles for gutter scheme indicator
- `packages/chat/spaces-gutter.js`:
  - Extend `SpaceConfig` typedef
  - Update `validateSpaceConfig`
  - Call `applyScheme` on space selection
  - Render scheme indicator on space icons
- `packages/chat/add-space-modal.js`:
  - Add scheme picker to the form
  - Include `scheme` in `SpaceFormData`
- `packages/chat/monaco-iframe-main.js`:
  - Observe `data-scheme` attribute changes (via `MutationObserver` or
    message from parent) in addition to the media query

## Testing

1. Create a space with scheme set to `'dark'` — verify dark mode activates
   when switching to that space, regardless of system setting
2. Create a space with scheme set to `'light'` — verify light mode activates
   when switching to that space with system dark mode on
3. Verify `'auto'` spaces follow system preference
4. Switch between spaces with different schemes — verify instant transition
5. Verify existing spaces without `scheme` field default to auto
6. Verify Monaco editor theme updates when switching spaces
7. Verify gutter indicators appear only for non-auto spaces
