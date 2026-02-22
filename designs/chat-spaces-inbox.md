# Chat Spaces Inbox Mode

## Overview

This document describes the "inbox" mode for spaces - the primary interaction mode where users view and interact with an agent's message inbox.

## Context

When a space is configured with `mode: 'inbox'`, selecting that space:
1. Navigates to the space's `profilePath`
2. Displays the inbox for that profile in the main content area
3. Enables messaging to/from that agent

## Current Behavior (Preserved)

The existing `inboxComponent` in `chat.js` already handles inbox display:

```js
const inboxComponent = async ($parent, $end, powers) => {
  for await (const message of makeRefIterator(E(powers).followMessages())) {
    // Render message
  }
};
```

This component:
- Follows the `followMessages()` async iterator from powers
- Renders each message as it arrives
- Supports sent/received message styling
- Handles message interactions (dismiss, token popups, etc.)

## Per-Space Inbox

When a space is selected:

1. **Profile resolution** - `bodyComponent` receives the space's `profilePath` and calls `onProfileChange()`
2. **Powers resolution** - `resolvePowers()` walks the path to get the target agent's powers
3. **Inbox rendering** - `inboxComponent` receives resolved powers and follows that agent's messages

```js
// In bodyComponent
const resolvePowers = async () => {
  let powers = rootPowers;
  for (const name of profilePath) {
    powers = E(powers).lookup(name);
  }
  return powers;
};

// When profile changes, rebuild triggers new inboxComponent
resolvePowers().then(resolvedPowers => {
  inboxComponent($messages, $anchor, resolvedPowers);
});
```

## Badge Indicators (Future)

The gutter can display unread message counts for each space:

### Design

```js
// In spaces-gutter.js
const updateBadges = async () => {
  for (const space of spaces) {
    try {
      // Resolve powers for this space
      let spacePowers = powers;
      for (const name of space.profilePath) {
        spacePowers = await E(spacePowers).lookup(name);
      }

      // Get unread count (would need daemon support)
      const unreadCount = await E(spacePowers).getUnreadCount();

      // Update badge
      const $badge = $container.querySelector(
        `.space-item[data-space-id="${space.id}"] .space-badge`
      );
      if ($badge) {
        $badge.textContent = String(unreadCount);
        $badge.style.display = unreadCount > 0 ? 'flex' : 'none';
      }
    } catch {
      // Space may not be accessible
    }
  }
};

// Poll periodically
setInterval(updateBadges, 30000);
```

### Daemon Requirements

Badge support would need:
- `E(powers).getUnreadCount()` or similar API
- Or: tracking "last seen" timestamp per-space client-side

## Message Context

When in a space, the chat bar context shifts:
- **Profile path** shown in breadcrumbs (already implemented)
- **Send target** defaults to the space's agent
- **Available commands** scoped to the space's capabilities

## Integration Points

### Space Selection Flow

```
User clicks space icon
  → spacesGutter.selectSpace(id)
    → onNavigate(space.profilePath)
      → bodyComponent.onProfileChange(newPath)
        → rebuild()
          → resolvePowers() with new path
            → inboxComponent with agent's powers
```

### Messaging Flow

```
User types message in chat bar
  → sendFormComponent with resolved powers
    → E(powers).send(message)
      → Agent receives message
        → Agent responds
          → inboxComponent receives via followMessages()
```

## Files

This mode uses existing components:
- `packages/chat/src/chat.js` - `inboxComponent`, `bodyComponent`
- `packages/chat/src/send-form.js` - Message sending
- `packages/chat/src/ref-iterator.js` - Message iteration

No additional files needed for basic inbox mode.

## Testing

1. **Add a space** pointing to a guest (e.g., `['fae']`)
2. **Click the space** - Should navigate to that guest's inbox
3. **Verify messages** - Should show that guest's message history
4. **Send a message** - Should be sent to that guest
5. **Cmd+N shortcut** - Should switch to the Nth space's inbox

## Future Enhancements

1. **Unread badges** - Show count of new messages
2. **Last message preview** - Show snippet on hover
3. **Notification sounds** - When new message arrives in inactive space
4. **Quick reply** - Type message without full navigation
