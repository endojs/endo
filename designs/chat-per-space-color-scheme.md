# Chat Per-Space Color Scheme

| | |
|---|---|
| **Date** | 2026-02-26 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Complete |
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
 * @typedef {'auto' | 'light' | 'dark' | 'high-contrast-light' | 'high-contrast-dark'} ColorScheme
 */
```

- `'auto'` — defer to the system's `prefers-color-scheme` media query
  (default)
- `'light'` — force the light scheme from
  [chat-color-schemes](chat-color-schemes.md)
- `'dark'` — force the dark scheme from
  [chat-color-schemes](chat-color-schemes.md)
- `'high-contrast-light'` — high contrast light variant from
  [chat-high-contrast-mode](chat-high-contrast-mode.md)
- `'high-contrast-dark'` — high contrast dark variant from
  [chat-high-contrast-mode](chat-high-contrast-mode.md)

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

### Scheme Picker Component

The scheme picker is a standalone component in `scheme-picker.js`,
created with `createSchemePicker({ $container, initialValue })`.

It presents an "Auto (follow system)" button above a 2×2 grid of
captioned preview cells.
Each cell shows miniature chat bubbles (received 👋, sent 🚀) with the
scheme's colors, giving a visual preview of each option:

```
  Color scheme
  [ Auto (follow system) ]
  ┌──────────────┐ ┌──────────────┐
  │  👋          │ │  👋          │
  │          🚀  │ │          🚀  │
  │    Light     │ │     Dark     │
  └──────────────┘ └──────────────┘
  ┌──────────────┐ ┌──────────────┐
  │  👋          │ │  👋          │
  │          🚀  │ │          🚀  │
  │ HC Light     │ │  HC Dark     │
  └──────────────┘ └──────────────┘
```

- `Auto` is selected by default.
- The selected cell is highlighted with a `--accent-primary` border.
- Selecting a scheme applies a **live preview** to the entire application
  by setting `data-scheme` on the document element.
- Cancelling the modal restores the original scheme via `restoreScheme()`.

The component API (hardened):
- `getValue()` → current `ColorScheme` value
- `setValue(scheme)` → update selection programmatically
- `onChange(callback)` → register change listener
- `restoreScheme()` → restore the scheme from before picker creation

The picker is mounted into both the add-space modal and edit-space modal
via a `#scheme-picker-slot` div.

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
const validSchemes = ['auto', 'light', 'dark', 'high-contrast-light', 'high-contrast-dark'];
const scheme =
  typeof obj.scheme === 'string' && validSchemes.includes(obj.scheme)
    ? obj.scheme
    : 'auto';
```

## Implementation

### Step 1: Restructure CSS for Attribute-Based Override ✅

Refactored the `@media (prefers-color-scheme: dark)` block from
[chat-color-schemes](chat-color-schemes.md) into the dual-selector pattern
described above.

### Step 2: Add Scheme to SpaceConfig ✅

- Extended the `SpaceConfig` typedef with `scheme` (all 5 values)
- Updated `validateSpaceConfig` to accept and default the field
- `applyScheme(space.scheme)` called in the space selection handler

### Step 3: Factor Out Scheme Picker Component ✅

- Created standalone `scheme-picker.js` with `createSchemePicker()`
- 2×2 grid with captioned bubble previews + Auto button
- Live preview applies scheme to document on selection
- `restoreScheme()` for cancellation

### Step 4: Add Scheme Picker to Add-Space Modal ✅

- Removed inline scheme picker code from `add-space-modal.js`
- Mounts `createSchemePicker` into `#scheme-picker-slot`
- Reads scheme from `picker.getValue()` in submit handlers

### Step 5: Add Edit Space Modal ✅

- Created `edit-space-modal.js` with `createEditSpaceModal()`
- Editable fields: name, icon, color scheme
- Mounted from context menu "Edit Space" item in spaces gutter

### Step 6: Add updateSpace to Spaces Gutter ✅

- Added `updateSpace(id, updates)` to persist edited space config
- Added "Edit Space" context menu item
- Updated `SpacesGutterAPI` typedef

### Step 7: Monaco Editor Theme Updates ✅

`monaco-iframe-main.js` detects `data-scheme` on the parent document
and listens for `set-theme` messages posted by `applyScheme()` in the
spaces gutter.

## Files

### Created

- `packages/chat/scheme-picker.js`:
  - Standalone scheme picker component with 2×2 grid + Auto
  - Inline preview colors via `SCHEME_COLORS` constant
  - Live preview via `data-scheme` attribute
- `packages/chat/edit-space-modal.js`:
  - Edit space modal (name, icon, scheme)
  - Reuses scheme picker and icon selector patterns

### Modified

- `packages/chat/index.css`:
  - Restructure dark mode selectors for attribute override
  - Replace old segmented scheme styles with `.scheme-picker`,
    `.scheme-grid`, `.scheme-cell`, `.scheme-auto` styles
- `packages/chat/spaces-gutter.js`:
  - Extend `SpaceConfig` typedef with all 5 scheme values
  - Extend `SpacesGutterAPI` typedef with `updateSpace`
  - Update `validateSpaceConfig`
  - Call `applyScheme` on space selection
  - Add `updateSpace` function
  - Add "Edit Space" context menu item
  - Initialize `editSpaceModal`
- `packages/chat/add-space-modal.js`:
  - Import and mount `createSchemePicker` component
  - Remove inline scheme picker state/functions
  - Include `scheme` in `SpaceFormData`
- `packages/chat/monaco-iframe-main.js`:
  - Detects `data-scheme` and listens for `set-theme` messages

## Testing

1. ~~Create a space with scheme set to `'dark'`~~ ✅
2. ~~Create a space with scheme set to `'light'`~~ ✅
3. ~~Verify `'auto'` spaces follow system preference~~ ✅
4. ~~Switch between spaces with different schemes~~ ✅
5. ~~Verify existing spaces without `scheme` field default to auto~~ ✅
6. ~~Verify Monaco editor theme updates when switching spaces~~ ✅

## Follow-up Work

- **Live preview for Monaco:** The scheme picker applies a live preview
  to the document via `data-scheme`, but does not post `set-theme` to
  Monaco iframes. If the eval form is open while changing schemes in the
  picker, Monaco won't update until the space is actually selected.
  Minor edge case since the eval form is typically closed during space
  creation/editing.
