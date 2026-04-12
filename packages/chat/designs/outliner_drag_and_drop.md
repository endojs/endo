# Outliner Drag & Drop + Group Selection

## Features

### 1. Drag & Drop Reordering
- **Drag handle**: The bullet point (or collapse handle) on each committed node acts as the drag handle.
- **Drop indicator**: A horizontal blue line shows the drop target between sibling nodes.
- **Same-parent constraint**: Nodes can only be reordered among their siblings (same parent). Use Tab/Shift-Tab for reparenting.
- **Group drag**: If multiple nodes are selected, dragging any of them drags the whole selection, preserving relative order.

### 2. Group Selection (Drag-Select)
- **Click**: Selects a single node (clears other selection).
- **Cmd/Ctrl+Click**: Toggles individual node in selection.
- **Shift+Click**: Range-selects between last-clicked and clicked node.
- **Rubber-band**: Click and drag on empty space to draw a selection rectangle; all nodes whose rows intersect are selected.
- **Escape**: Clears selection.

## Persistence: Move Messages

Reordering is persisted via `move` reply type messages (already declared in `MODIFIER_REPLY_TYPES` in `edit-queue.js`).

### Move message format
```
E(channel).post(
  [String(newSortOrder)],  // fractional sort order
  [],                       // no names
  [],                       // no petNames
  String(targetNodeNumber), // replyTo = node being moved
  [],                       // no ids
  'move'                    // replyType
)
```

### Sort order computation
- Each node's default sort order = its message number (chronological).
- Move messages override this with a fractional value.
- When dropping between nodes with sort orders A and B, the new order = (A + B) / 2.
- When dropping at start/end, the order is extended by ±1.
- Multiple selected nodes get evenly spaced sort orders within the gap.

### Processing
- A `moveOverrides` map tracks `nodeKey → sortOrder` from the latest move message for each node.
- `getSortedVisibleChildren` uses `moveOverrides` values instead of message numbers when available.
- Move messages are `modifier` type (not visible as children), consistent with edit/deletion.

## Files Modified
- `outliner-component.js` — Selection state, drag handlers, move processing, DOM reordering
- `index.css` — Selection highlighting, drop indicator, drag ghost, rubber-band rectangle
