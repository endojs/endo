# Chat Spaces Gutter

## Motivation

The Chat UI currently operates in a single-profile hierarchical drill-down mode: start at `endo.Host`, expand the navigation pane, select a guest or capability to navigate deeper. This works for exploring the pet-name graph but breaks down when the user is actively managing multiple AI agent project loops simultaneously.

**The problem:** Each AI coding agent (like Fae) is typically a guest under Host, with its own inbox, conversations, and tool capabilities. To switch between agents, the user must:

1. Navigate back up to Host
2. Expand the "guests" directory
3. Select the target guest
4. Navigate into its inbox or relevant capability

This friction discourages context-switching and forces users to finish one agent interaction before attending to another.

**The solution:** A left-hand "spaces" gutter providing one-click access to top-level navigation targets. Each space is a bookmark into the capability graph, pre-configured with a profile path. Spaces are persistent (stored as values in the host's pet-store), orderable, and accessible via keyboard shortcuts (Cmd+1..9).

## Architecture

### Component Style

The implementation follows the existing Chat UI patterns:
- **Template literals** for HTML/CSS
- **Factory functions** returning API objects (`createSpacesGutter({ $container, powers, onNavigate })`)
- **Direct DOM manipulation**
- **JSDoc types** for type safety

### No Daemon Changes

Spaces configuration uses **ordinary directory and value formulas** already supported by the daemon:
- Host's pet-store already supports arbitrary directories via `E(host).write(['spaces', id], value)`
- Values can be stored directly via `E(host).storeValue(JSON.stringify(spaceConfig))`
- No new formula types, no new daemon APIs

### Layout

The gutter is positioned at the absolute left edge:

```
| gutter | #pets (sidebar) | #messages (inbox) |
| 48px   | var(--sidebar-width)                |
```

CSS variables:
- `--gutter-width: 48px` - Width of the spaces gutter
- Existing elements shifted right by `--gutter-width`

## Space Model

```js
/**
 * @typedef {object} SpaceConfig
 * @property {string} id - unique identifier (crypto.randomUUID)
 * @property {string} name - display name (shown on hover)
 * @property {string} icon - emoji character
 * @property {string[]} profilePath - pet-name path to the agent
 * @property {'inbox'} mode - interaction mode (future: 'conversations', 'channels')
 * @property {number} order - position in the gutter (0-indexed)
 */
```

## Persistence

Spaces are stored in the host's pet-store under a `spaces` directory:

```js
// Create a space
const spaceConfig = { id, name, icon, profilePath, mode: 'inbox', order: 0 };
const valueRef = await E(powers).storeValue(JSON.stringify(spaceConfig));
await E(powers).write(['spaces', id], valueRef);

// List spaces
const spaceIds = await E(powers).list('spaces');
for (const id of spaceIds) {
  const ref = await E(powers).lookup(['spaces', id]);
  const json = await E(ref).text();
  const config = JSON.parse(json);
}

// Remove a space
await E(powers).remove(['spaces', id]);
```

## Keyboard Shortcuts

Global keyboard handler for `Cmd+1` through `Cmd+9`:

```js
document.addEventListener('keydown', e => {
  if (!e.metaKey && !e.ctrlKey) return;
  if (e.shiftKey || e.altKey) return;

  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 9) {
    const sortedSpaces = [...spaces].sort((a, b) => a.order - b.order);
    if (num - 1 < sortedSpaces.length) {
      e.preventDefault();
      selectSpace(sortedSpaces[num - 1].id);
    }
  }
});
```

## Component API

```js
/**
 * @typedef {object} SpacesGutterAPI
 * @property {() => Promise<void>} refresh - Reload spaces from pet-store
 * @property {(id: string) => void} selectSpace - Activate a space
 * @property {() => SpaceConfig[]} getSpaces - Get current space list
 * @property {(config: Omit<SpaceConfig, 'id' | 'order'>) => Promise<string>} addSpace - Add a new space
 * @property {(id: string) => Promise<void>} removeSpace - Remove a space
 * @property {() => string | null} getActiveSpaceId - Get currently active space ID
 */

/**
 * @param {object} options
 * @param {HTMLElement} options.$container - Container for the gutter
 * @param {unknown} options.powers - Endo host powers
 * @param {(profilePath: string[]) => void} options.onNavigate - Navigate callback
 * @returns {SpacesGutterAPI}
 */
export const createSpacesGutter = ({ $container, powers, onNavigate }) => {
  // ...
};
```

## Files

### Created
- `packages/chat/src/spaces-gutter.js` - Gutter component factory

### Modified
- `packages/chat/src/chat.js`:
  - Import `createSpacesGutter`
  - Add `--gutter-width` CSS variable
  - Add `#spaces-gutter` styles
  - Shift `#pets`, `#messages`, `#chat-bar` right by `--gutter-width`
  - Add `<div id="spaces-gutter"></div>` to template
  - Initialize gutter in `bodyComponent`

## User Interactions

1. **Click space icon** - Navigate to that space's profile path
2. **Right-click space icon** - Context menu with "Remove space" option
3. **Click "+" button** - Dialog to add new space (name, path)
4. **Cmd+1..9** - Quick switch to space by position
5. **Hover over icon** - Tooltip shows space name and shortcut

## Visual Design

- Gutter background: `var(--bg-active)` (slightly darker than sidebar)
- Space icons: 40x40px buttons with emoji
- Active space: Blue highlight (`var(--accent-primary)`)
- Badge: Red pill for unread count (future)
- Add button: Dashed border, "+" character

## Future Enhancements

1. **Drag-and-drop reordering** - Change space order
2. **Unread badges** - Poll/subscribe to inbox counts
3. **Space editing** - Rename, change icon
4. **Space modes** - Beyond inbox (conversations, channels)
5. **Home space** - Cmd+0 to return to Host root
