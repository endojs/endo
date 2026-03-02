# Configurable Home Space (Space 0)

| | |
|---|---|
| **Created** | 2026-03-02 |
| **Updated** | 2026-03-02 |
| **Author** | Kris Kowal (prompted) |
| **Status** | **Complete** |

## Motivation

The spaces gutter has a hardcoded `HOME_SPACE` constant for the root agent's
space. Users cannot customize its icon or color scheme, and there is no context
menu for it. This design makes Space 0 configurable (icon, scheme) while
keeping it indelible (cannot be deleted, always bound to root agent, always
named "Home").

## Indelible Space 0

The home space has special invariants that distinguish it from user-created
spaces:

- **Always first** in the gutter (position 0, keyboard shortcut Cmd+1)
- **Always named "Home"** — the name is enforced regardless of stored config
- **Always bound to root agent** — `profilePath` is always `[]`
- **Cannot be deleted** — the Delete menu item is hidden for home

Users can customize:

- **Icon** — any emoji from the icon grid or a 2-letter icon
- **Color scheme** — auto, light, dark, high-contrast-light, high-contrast-dark

## Config Storage

Home space configuration is stored at pet-name path `['spaces', '0']` as a
passable object (same format as regular space configs). When no stored config
exists, `HOME_SPACE_DEFAULTS` provides fallback values:

```js
const HOME_SPACE_DEFAULTS = harden({
  id: 'home', name: 'Home', icon: '🐈‍⬛',
  profilePath: [], mode: 'inbox', scheme: 'auto',
});
```

On load (`refresh()`), only `icon` and `scheme` are merged from stored config.
`name`, `profilePath`, `id`, and `mode` are always taken from defaults.

On save (`updateSpace('home', updates)`), indelible fields are enforced before
storing at `['spaces', '0']`.

## Context Menu Scope System

Menu items have a `data-menu-scope` attribute:

| Scope | Shown for |
|-------|-----------|
| `"all"` | All spaces (indelible and delible) |
| `"delible"` | Only non-home spaces |

When `showContextMenu` is called, it toggles visibility:

```js
const isIndelible = spaceId === 'home';
for (const $item of $menu.querySelectorAll('[data-menu-scope]')) {
  const scope = $item.getAttribute('data-menu-scope');
  $item.style.display =
    (scope === 'all' || (!isIndelible && scope === 'delible'))
      ? '' : 'none';
}
```

Current menu items:

- **Edit Space** (`data-menu-scope="all"`) — shown for all spaces
- **Delete Space** (`data-menu-scope="delible"`) — hidden for home

## Modal Reuse

The `createEditSpaceModal` factory accepts an optional `showName` parameter:

- `showName: true` (default) — renders name field, validates name on submit
- `showName: false` — omits name field, uses `editingSpace.name` on submit

Two modal instances are created in `spaces-gutter.js`:

1. `editSpaceModal` — `showName: true`, for regular spaces
2. `homeEditModal` — `showName: false`, for the home space

## Shared Icon Selector

The icon selector UI (emoji grid + letter tab) was duplicated between
`add-space-modal.js` and `edit-space-modal.js`. It is now extracted to
`icon-selector.js` which exports:

- `ICON_CATEGORIES` — hardened category-to-emoji map
- `ALL_ICONS` — hardened flat array of all icons
- `letterIcon(letters)` — truncates to 2 uppercase chars
- `renderIconSelector({ selectedIcon, useLetterIcon })` — returns HTML string

## Watcher Integration

The spaces directory watcher handles space `'0'` specially:

- `handleSpaceAdded('0')`: reloads home config from store, re-renders
- `handleSpaceRemoved('0')`: resets to `HOME_SPACE_DEFAULTS`, re-renders
- Other space IDs: normal `spacesMap` add/remove behavior

## Files Modified

| File | Change |
|------|--------|
| `packages/chat/icon-selector.js` | New — shared icon selector module |
| `packages/chat/add-space-modal.js` | Import shared icon selector, remove duplicates |
| `packages/chat/edit-space-modal.js` | Import shared icon selector, add `showName` option |
| `packages/chat/spaces-gutter.js` | Home config storage/loading, context menu, wiring |
| `packages/chat/test/component/spaces-gutter-home.test.js` | New — component tests |

## Test Coverage

| Test | Description |
|------|-------------|
| Right-click home shows Edit not Delete | Context menu scope system |
| Right-click regular space shows both | Scope system for delible spaces |
| Edit home modal omits Name field | `showName: false` behavior |
| Change home icon/scheme stores correctly | Store at `['spaces', '0']` with enforced name/path |
| Home loads stored icon/scheme on refresh | Merge from stored config |
