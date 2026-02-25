# Chat Reply Chain Visualization

| | |
|---|---|
| **Date** | 2026-02-23 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## Motivation

Messages in the chat inbox can be replies to other messages, forming tree-like conversation structures. Currently, all messages are displayed in a flat chronological list, making it difficult to follow branching conversations or understand the context of a reply without manually scrolling to find the parent message.

**Goals:**
1. Visually indicate reply relationships between messages
2. Use indentation to show conversation structure
3. Draw connecting lines from each message to its parent
4. Keep vertically aligned chains when practical to minimize visual noise
5. Allow users to interactively adjust the visualization

## Data Model

Messages already have a `replyTo` field (or similar) indicating the parent message:

```js
/**
 * @typedef {object} Message
 * @property {string} id - Unique message identifier
 * @property {string} [replyTo] - ID of the parent message (if a reply)
 * @property {string} content - Message content
 * @property {number} timestamp - When the message was sent
 * ...
 */
```

The reply relationships form a forest (multiple trees), where:
- Root messages have no `replyTo`
- Each message has at most one parent
- A parent can have multiple children (branching)

## Message-of-Interest Algorithm

Rather than visualizing all reply relationships, we use a **spotlight model** focused on a single "message-of-interest" (MOI). This keeps the UI clean and emphasizes the current conversation context.

### Core Rules

1. **One MOI at a time** - Always exactly one message is designated the message-of-interest
2. **MOI is never indented** - The MOI appears at the base indent level (left edge)
3. **Automatic selection** - When scroll is pinned to bottom and a new message arrives, the new message becomes the MOI
4. **Click to change** - User can click any message to make it the MOI
5. **Ephemeral state** - MOI resets to the last message in the buffer on page reload

### Line Drawing Rules

From the MOI, we draw lines in two directions:

**Upward (to parent):**
- Draw a line from the MOI to the message it replies to
- The parent message is not indented

**Downward (to replies):**

- **Single reply:** Draw a line to the reply. The reply is not indented. Indent all intermediate messages (messages between MOI and its reply in chronological order).

- **Multiple replies:** Draw a line to the chronologically *last* reply (not indented). Draw branch lines to each other reply. Indent all intermediate messages.

**No other lines:** Reply relationships not involving the MOI are not visualized.

### Visual Example

Lines run along the **left gutter** of the message buffer. The main vertical line connects flush-left messages (parent, MOI, last reply) with a straight unbroken line. Branch nodules extend right from the line to reach indented replies.

```
├─ Parent message
│
├─ MESSAGE-OF-INTEREST
│
│        Intermediate message (indented, no connection)
│
├────○   Earlier reply (branch extends right to reach it)
│
│        Another intermediate (indented, no connection)
│
└─ Latest reply to MOI
```

**Key visual elements:**
- **Vertical line**: Straight line down the left edge, connecting flush-left messages
- **Flush-left messages**: Parent, MOI, and last reply are all at indent level 0, directly on the line
- **Branch nodules**: Horizontal stubs (├────○) extending right from the main line to indented replies
- **Indented messages**: Intermediate messages and earlier replies are indented, set right of the gutter
- **Terminus**: Line ends (└─) at the final reply

The vertical line is **unbroken** from parent through MOI to last reply - it's a single straight line with branches forking off to the side.

### Algorithm Pseudocode

```js
const computeLayout = (messages, moiId) => {
  const moi = messages.find(m => m.id === moiId);
  const layout = new Map(); // messageId -> { indent: number, lines: [] }

  // MOI is never indented
  layout.set(moiId, { indent: 0, lines: [] });

  // Find MOI's parent
  if (moi.replyTo) {
    const parent = messages.find(m => m.id === moi.replyTo);
    if (parent) {
      layout.set(parent.id, { indent: 0, lines: [] });
      layout.get(moiId).lines.push({ to: parent.id, direction: 'up' });
    }
  }

  // Find replies to MOI
  const replies = messages
    .filter(m => m.replyTo === moiId)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (replies.length > 0) {
    const lastReply = replies[replies.length - 1];

    // Last reply is not indented
    layout.set(lastReply.id, { indent: 0, lines: [] });
    layout.get(moiId).lines.push({ to: lastReply.id, direction: 'down', primary: true });

    // Other replies are branches
    for (const reply of replies.slice(0, -1)) {
      layout.set(reply.id, { indent: 1, lines: [] });
      layout.get(moiId).lines.push({ to: reply.id, direction: 'down', primary: false });
    }

    // Intermediate messages (between MOI and last reply, not replies themselves)
    const moiIndex = messages.findIndex(m => m.id === moiId);
    const lastReplyIndex = messages.findIndex(m => m.id === lastReply.id);
    const replyIds = new Set(replies.map(r => r.id));

    for (let i = moiIndex + 1; i < lastReplyIndex; i++) {
      const msg = messages[i];
      if (!replyIds.has(msg.id) && !layout.has(msg.id)) {
        layout.set(msg.id, { indent: 1, lines: [] });
      }
    }
  }

  // All other messages: no indent, no lines
  for (const msg of messages) {
    if (!layout.has(msg.id)) {
      layout.set(msg.id, { indent: 0, lines: [] });
    }
  }

  return layout;
};
```

### State Management

```js
/**
 * @typedef {object} ReplyVisualizationState
 * @property {string} messageOfInterestId - Current MOI
 * @property {boolean} scrollPinned - Whether scroll is pinned to bottom
 */

// Initial state: last message is MOI
let moiId = messages[messages.length - 1]?.id;

// On new message arrival
const onMessageReceived = (newMessage) => {
  if (scrollPinned) {
    moiId = newMessage.id;
    recomputeLayout();
  }
};

// On click
const onMessageClick = (messageId) => {
  moiId = messageId;
  recomputeLayout();
};

// On page load
const onLoad = () => {
  moiId = messages[messages.length - 1]?.id;
};
```

### Indentation

**Indent unit:** ~2ex (approximately 2 character widths, scales with font size)

All indented messages (intermediates and earlier replies) use a single indent level. There is no deep nesting since the MOI algorithm only visualizes one level of reply relationships at a time.

## Line Drawing

Since lines run strictly along the left gutter, the implementation is straightforward.

### Gutter Layout

```
┌─────┬────────────────────────────────┐
│gutter│  message content area          │
│ 16px │                                │
├──┬──┼────────────────────────────────┤
│  │  │ Parent message (flush left)    │
│  │  ├────────────────────────────────┤
│  │  │ MOI (flush left)               │
│  │  ├────────────────────────────────┤
│  │  │       Intermediate (indented)  │
│  ├──┼──○ Earlier reply (indented)    │
│  │  ├────────────────────────────────┤
│  │  │       Another intermediate     │
│  │  ├────────────────────────────────┤
│  └──│ Last reply (flush left)        │
└─────┴────────────────────────────────┘
```

The vertical line in the gutter connects the three flush-left messages (Parent, MOI, Last reply) with a single straight stroke. The branch `├──○` forks right to reach the indented earlier reply.

### Line Segments

Each message in the layout contributes line segments based on its role:

| Role | Line segment |
|------|--------------|
| Parent | `├` or `│` (continue down) |
| MOI | `├` (continue down to replies) |
| Intermediate | `│` (pass-through, no connection) |
| Branch reply | `├──○` (nodule extending right) |
| Last reply | `└` (terminus) |

### CSS Implementation (Recommended)

Since lines are gutter-local, CSS pseudo-elements work well:

```css
:root {
  --reply-line-color: #9ca3af;
  --reply-line-width: 2px;
  --indent-width: 2ex;
}

[data-theme="dark"] {
  --reply-line-color: #6b7280;
}

.message-gutter {
  width: var(--indent-width);
  position: relative;
  flex-shrink: 0;
}

/* Vertical line segment - continues through message */
.message[data-line="continue"] .message-gutter::before {
  content: '';
  position: absolute;
  left: calc(var(--indent-width) / 2 - var(--reply-line-width) / 2);
  top: 0;
  bottom: 0;
  width: var(--reply-line-width);
  background: var(--reply-line-color);
}

/* Vertical line segment - terminates at message center */
.message[data-line="end"] .message-gutter::before {
  content: '';
  position: absolute;
  left: calc(var(--indent-width) / 2 - var(--reply-line-width) / 2);
  top: 0;
  bottom: 50%;
  width: var(--reply-line-width);
  background: var(--reply-line-color);
}

/* Horizontal branch to indented reply */
.message[data-line="branch"] .message-gutter::after {
  content: '';
  position: absolute;
  left: calc(var(--indent-width) / 2);
  top: 50%;
  right: 0;
  height: var(--reply-line-width);
  background: var(--reply-line-color);
}
```

### Alternative: SVG Overlay

An SVG could draw all line segments at once, but since segments are simple verticals and horizontals in a fixed gutter column, CSS is simpler and requires no position recalculation.

SVG may be useful if:
- Lines need animation (drawing effect)
- Complex styling (gradients, glow effects)
- Line needs to span across virtualized/recycled message elements

### Line Styling

**Thickness:** 2px

**Color:** A muted grey that provides sufficient contrast in both light and dark modes without being visually loud. Example:
```css
:root {
  --reply-line-color: #9ca3af; /* gray-400, works in light mode */
}
[data-theme="dark"] {
  --reply-line-color: #6b7280; /* gray-500, works in dark mode */
}
```

**Nodules:** Simple right-angle junction where the branch meets the main line. No circles, squares, or other ornamentation.

```
│
├──  (branch forks right, simple corner)
│
```

**Off-screen messages:** Lines render regardless of whether the parent or other connected messages are currently visible in the viewport. The line simply extends to the edge of the rendered message area.

## Vertical Alignment

The MOI algorithm naturally produces vertical alignment:

- The **MOI**, its **parent**, and the **chronologically last reply** all share indent level 0
- This creates a clean vertical spine through the primary conversation path
- Branch replies and intermediate messages are indented, visually "set aside"

```
Parent          ─┐
                 │  (vertical spine at indent 0)
MOI             ─┤
   │             │
   ├─ Branch 1   │  (indented, branch line)
   │             │
   ├─ Intermed.  │  (indented, no line)
   │             │
Last Reply      ─┘
```

This approach eliminates the need for complex alignment heuristics - the MOI selection *is* the alignment decision.

## Interactive Selection

The only user interaction is **clicking a message to make it the MOI**.

### Behavior

- Click any message → that message becomes the MOI
- The entire layout recomputes based on the new MOI
- Lines are redrawn to show the new MOI's parent and replies
- Previously-indented messages may become unindented (and vice versa)

### Visual Feedback

The current MOI does not need special visual indication beyond its position in the line structure. All messages are clickable; no special affordance is needed.

### Scroll Pinning

Use the existing scroll pinning logic in the chat UI.

When scroll is pinned to the bottom:
- New messages automatically become the MOI
- This is the default "follow along" mode for active conversations

When scroll is unpinned (user scrolled up):
- New messages do NOT change the MOI
- User maintains focus on the message they're reading
- MOI changes only on explicit click

## Performance Considerations

### Virtualization

For long conversations (hundreds of messages):
- Only render messages in viewport + buffer
- Update lines only for visible messages
- Placeholder heights for off-screen messages

### Debouncing

Line recalculation on scroll/resize should be debounced or use `requestAnimationFrame`.

### Caching

Cache computed indent levels; only recompute when messages change.

## Accessibility

### Screen Reader Support

Provide navigation cues through named anchors and visually-hidden links:

```html
<article class="message" id="msg-123">
  <a href="#msg-456" class="visually-hidden">In reply to previous message</a>
  <!-- message content -->
</article>
```

The "in reply to" link is:
- Visually hidden (using `.visually-hidden` / `.sr-only` CSS)
- Audible to screen readers
- Provides keyboard-accessible navigation to the parent message

### Keyboard Navigation (Future)

A keyboard shortcut to exit the command line and navigate messages is desirable, with shortcuts for common reactions (reply, dismiss, etc.). This is out of scope for this design but noted as a related feature.

## Visual Design

The MOI algorithm keeps visual design minimal:

- **No special MOI styling** - the line structure itself indicates focus
- **Uniform line styling** - 2px muted grey, same for main line and branches
- **Simple gutter** - ~2ex width, just enough for the line

## Implementation Phases

### Phase 1: MOI State Management
- Track current message-of-interest ID
- Detect scroll pinning
- Update MOI on new message arrival (when pinned)
- Reset MOI on page load

### Phase 2: Layout Computation
- Implement `computeLayout()` algorithm
- Identify parent, replies, intermediate messages
- Assign indent levels

### Phase 3: Indentation Rendering
- Apply CSS margin/padding based on computed indent
- Style the MOI distinctly

### Phase 4: Line Drawing
- SVG overlay (or CSS) for parent line and reply lines
- Primary line to last reply
- Branch lines to earlier replies

### Phase 5: Click Interaction
- Click handler to change MOI
- Recompute layout and redraw

### Phase 6: Polish
- Smooth animations on MOI change
- Line updates on scroll/resize
- Accessibility (ARIA, keyboard nav)

## Alternatives Considered

### Flat List with Thread Indicators
Instead of indentation, show a small "in reply to: [preview]" chip on each reply. Click to scroll to parent.
- Simpler layout
- Loses visual structure

### Separate Thread View
Clicking a thread opens a dedicated panel/modal showing just that thread.
- Cleaner main view
- Context switch required

### GitHub-style Collapsed Threads
Show only root messages by default; expand to see replies inline.
- Compact
- Requires more clicks to read

### Slack-style Thread Panel
Replies open in a side panel.
- Main channel stays uncluttered
- Replies are second-class citizens

## Files

### To Create
- `packages/chat/moi-layout.js` - MOI state management, `computeLayout()` algorithm
- `packages/chat/reply-lines.js` - SVG (or CSS) line rendering

### To Modify
- `packages/chat/inbox-component.js` - Integrate MOI tracking and layout into message rendering
- `packages/chat/index.css` - MOI highlight, indent styles, line styling

## Decisions Made

| Aspect | Decision |
|--------|----------|
| Indent unit | ~2ex |
| MOI indication | None needed |
| Clickable indication | None needed |
| Scroll pinning | Use existing logic |
| Line thickness | 2px |
| Line color | Muted grey, light/dark mode aware |
| Nodule styling | Simple junction, no ornament |
| Off-screen parents | Render lines regardless |

## Tentative Decisions (may adjust during implementation)

| Aspect | Tentative Decision |
|--------|-------------------|
| Grey color (light mode) | `#9ca3af` (Tailwind gray-400) |
| Grey color (dark mode) | `#6b7280` (Tailwind gray-500) |
| Gutter width | 2ex (same as indent unit; line centered within) |
| Animation on MOI change | Instant (no transition) |

## Out of Scope

- **Keyboard navigation**: Shortcut to exit command line and navigate messages with reaction shortcuts (noted for future design)
