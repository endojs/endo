# Drag and Drop and Block Selection in a Block-Based Outliner

A standalone guide for implementing drag-and-drop and block selection in a browser-based outliner where the document is a tree of independently addressable blocks. Covers the HTML5 drag API integration, drop zone math, tree mutation semantics, the full selection model (bullet click, Shift+Click, Shift+Arrow, bounding box drag-select), and the subtle edge cases that make or break the feel.

Based on patterns developed in the [Muddle](https://github.com/nicedland/muddle) project and informed by the state of the art in tools like Roam Research.

---

## Table of Contents

### Part 1: Block Selection

1. [Selection Model: Anchor, Focus, and Contiguous Ranges](#selection-model)
2. [Block Position Registry](#block-position-registry)
3. [Bullet Click: Single Block Selection](#bullet-click)
4. [Shift+Click: Range Selection and Deselection](#shift-click)
5. [Shift+Arrow Keys: Keyboard Range Extension](#shift-arrow-keys)
6. [Drag-to-Select: Bounding Box Selection](#drag-to-select)
7. [Selection Visual Feedback](#selection-visual-feedback)
8. [Batch Operations on Selected Blocks](#batch-operations)
9. [Selection Clearing](#selection-clearing)

### Part 2: Drag and Drop

10. [Data Model](#data-model)
11. [HTML Structure That Makes Drag Work](#html-structure)
12. [Drag Initiation](#drag-initiation)
13. [Drop Zone Calculation](#drop-zone-calculation)
14. [Drop Visual Feedback](#drop-visual-feedback)
15. [Executing the Drop](#executing-the-drop)
16. [Modifier Keys: Move vs. Reference](#modifier-keys)
17. [Selection and Multi-Block Drag](#selection-and-multi-block-drag)
18. [Validation: Preventing Circular Drops](#validation)
19. [Same-Parent Index Adjustment](#same-parent-index-adjustment)
20. [Auto-Expand Collapsed Blocks](#auto-expand-collapsed-blocks)
21. [Architecture: Separating Behavior from DOM](#architecture)
22. [Edge Cases and Pitfalls](#edge-cases)
23. [Browser Compatibility](#browser-compatibility)

---

# Part 1: Block Selection

An outliner needs two completely different selection systems: **text selection** within a single block (handled by the browser natively via `<textarea>`) and **block selection** across multiple blocks (handled by your code). The challenge is making these two coexist without fighting each other.

---

## Selection Model

Selection uses an **anchor-focus model**, borrowed from browser text selection semantics:

```typescript
interface SelectionContext {
  anchor: AutomergeUrl | null;   // where the selection started
  focus: AutomergeUrl | null;    // where the selection currently ends
  selected: Set<AutomergeUrl>;   // all blocks in the contiguous range
}
```

**All selections are contiguous ranges.** Non-contiguous selection (Ctrl+Click to cherry-pick individual blocks) is intentionally unsupported. It adds significant complexity — what does it mean to drag three non-adjacent blocks? how do you validate batch indent? — with little practical value.

The `selected` set is always the computed result of "every block between anchor and focus in document order":

```typescript
function computeSelectedBlocks(
  anchor: AutomergeUrl | null,
  focus: AutomergeUrl | null,
  flattenedBlocks: BlockPosition[]
): Set<AutomergeUrl> {
  if (!anchor || !focus) return new Set();

  const anchorIndex = flattenedBlocks.findIndex(b => b.url === anchor);
  const focusIndex = flattenedBlocks.findIndex(b => b.url === focus);
  if (anchorIndex === -1 || focusIndex === -1) return new Set();

  const start = Math.min(anchorIndex, focusIndex);
  const end = Math.max(anchorIndex, focusIndex);

  const selected = new Set<AutomergeUrl>();
  for (let i = start; i <= end; i++) {
    selected.add(flattenedBlocks[i].url);
  }
  return selected;
}
```

**Direction-independent:** The anchor can be above or below the focus. The range is always `min(anchor, focus)` to `max(anchor, focus)` in document order. This means Shift+Click works the same whether you extend up or down.

---

## Block Position Registry

Selection depends on knowing the **document order** of all blocks — a depth-first traversal of the tree, respecting collapse state. Each block registers its position on mount:

```typescript
interface BlockPosition {
  url: AutomergeUrl;
  parentUrl: AutomergeUrl | null;
  indexInParent: number;
  depth: number;
}
```

The `SelectionProvider` maintains a sorted array of these positions. When a block mounts, it registers; when it unmounts, it unregisters:

```typescript
const registerBlock = (position: BlockPosition) => {
  blockPositions.current = blockPositions.current.filter(
    p => p.url !== position.url
  );
  blockPositions.current.push(position);
  // Sort to maintain document order
  blockPositions.current.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.indexInParent - b.indexInParent;
  });
};
```

This registry is the single source of truth for "what comes before/after what." It's used by:
- Range computation (Shift+Click, Shift+Arrow)
- Batch operation ordering (indent/unindent apply in document order)
- Bounding box selection (mapping spatial overlap to block identity)

---

## Bullet Click

Clicking a block's bullet point selects that single block:

```typescript
function selectSingleBlock(blockUrl: AutomergeUrl): SelectionContext {
  return {
    anchor: blockUrl,
    focus: blockUrl,
    selected: new Set([blockUrl]),
  };
}
```

In the component, the bullet's click handler checks for the Shift modifier to decide between single-select and range-extend:

```typescript
const handleClick = (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  select(e.shiftKey);  // extend=true when Shift held
};
```

The `select` function (from `useBlockSelection`) dispatches to either `extendSelection` or `selectSingleBlock` depending on the `extend` flag.

**Why the bullet and not the whole block?** Clicking the text area should place the cursor for text editing. Clicking the bullet should select the block for structural operations. These are different intents from the same visual row.

---

## Shift+Click

Shift+Click has **two different behaviors** depending on whether the clicked block is already selected:

### Clicking an unselected block: extend range

Creates a contiguous selection from the current anchor to the clicked block:

```typescript
function selectRange(
  fromBlock: AutomergeUrl,
  toBlock: AutomergeUrl,
  flattenedBlocks: BlockPosition[]
): SelectionContext {
  return {
    anchor: fromBlock,
    focus: toBlock,
    selected: computeSelectedBlocks(fromBlock, toBlock, flattenedBlocks),
  };
}
```

If there's no existing anchor (empty selection), the clicked block becomes both anchor and focus — a single-block selection that can be extended from.

### Clicking an already-selected block: remove it and its descendants

This is the non-obvious behavior. Shift+clicking a block that's *already in the selection* removes it **and all its descendants** from the selection:

```typescript
function shiftClickBlock(
  blockUrl: AutomergeUrl,
  currentSelection: SelectionContext,
  flattenedBlocks: BlockPosition[]
): SelectionContext {
  if (currentSelection.selected.has(blockUrl)) {
    // Remove block and its descendants
    const toRemove = getBlockAndDescendants(blockUrl, flattenedBlocks);
    const newSelected = new Set(
      [...currentSelection.selected].filter(url => !toRemove.has(url))
    );

    if (newSelected.size === 0) return clearSelection();

    // Preserve anchor if it's still selected, else pick first remaining
    const anchor = currentSelection.anchor && newSelected.has(currentSelection.anchor)
      ? currentSelection.anchor
      : flattenedBlocks.find(b => newSelected.has(b.url))?.url ?? null;
    // Focus becomes last remaining block in document order
    const focus = [...flattenedBlocks].reverse()
      .find(b => newSelected.has(b.url))?.url ?? null;

    return { anchor, focus, selected: newSelected };
  } else {
    // Extend range from anchor
    const anchor = currentSelection.anchor || blockUrl;
    return selectRange(anchor, blockUrl, flattenedBlocks);
  }
}
```

**Why remove descendants too?** In a tree, selecting a parent implies its subtree. Deselecting a parent but keeping its children would be confusing — the children are visually nested *inside* the parent.

**Finding descendants** uses the flattened block list and depth: walk forward from the block until you hit a block at the same or shallower depth:

```typescript
function getBlockAndDescendants(
  blockUrl: AutomergeUrl,
  flattenedBlocks: BlockPosition[]
): Set<AutomergeUrl> {
  const result = new Set<AutomergeUrl>();
  const blockIndex = flattenedBlocks.findIndex(b => b.url === blockUrl);
  if (blockIndex === -1) return result;

  const blockDepth = flattenedBlocks[blockIndex].depth;
  result.add(blockUrl);

  for (let i = blockIndex + 1; i < flattenedBlocks.length; i++) {
    if (flattenedBlocks[i].depth <= blockDepth) break;
    result.add(flattenedBlocks[i].url);
  }
  return result;
}
```

### Shift+Click summary table

| Starting state | Click target | Result |
|---------------|-------------|--------|
| No selection | Any block | Select just that block |
| Block A selected | Unselected block B | Select range A→B |
| Range A→D selected | Unselected block F | Extend range A→F |
| Range A→D selected | Selected block C (has children C1, C2) | Remove C, C1, C2 from selection |
| Single block A selected | Block A (same block) | Clear selection entirely |

---

## Shift+Arrow Keys

Shift+Up/Down extends the selection by one block at a time from the keyboard. This is handled in the navigation behavior layer:

```typescript
// In getNavigationAction():
if (modifiers.shift && (key === 'ArrowUp' || key === 'ArrowDown')) {
  const target = key === 'ArrowUp' ? ctx.previousBlock : ctx.nextBlock;
  if (target) {
    return { action: 'extend-selection', target };
  }
  return { action: 'default' };
}
```

The component layer receives this `extend-selection` action and calls:

```typescript
function extendSelection(
  currentSelection: SelectionContext,
  toBlock: AutomergeUrl,
  flattenedBlocks: BlockPosition[]
): SelectionContext {
  const anchor = currentSelection.anchor || toBlock;
  return {
    anchor,
    focus: toBlock,
    selected: computeSelectedBlocks(anchor, toBlock, flattenedBlocks),
  };
}
```

**Key behavior:** The anchor stays fixed. Only the focus moves. This means:
- Shift+Down repeatedly extends the selection downward
- Shift+Up after Shift+Down *contracts* the selection (focus moves back toward anchor)
- When focus crosses the anchor, the selection direction reverses

This matches how Shift+Arrow works in browser text selection — the anchor is planted, the focus is the moving end.

**Starting from nothing:** If there's no selection when Shift+Arrow is pressed, the current block becomes both anchor and focus (single-block selection), then the next press extends from there.

---

## Drag-to-Select

Drag-to-select draws a bounding box across blocks using mouse events. This is **completely separate** from the HTML5 Drag and Drop API — it uses `mousedown`/`mousemove`/`mouseup`, not `dragstart`/`dragover`/`drop`.

### The Two-Mode Problem

The fundamental challenge: dragging inside a textarea should select text (normal browser behavior), but dragging across empty space between blocks should trigger block selection. These are the same mouse gesture with different intent.

**Solution: only activate bounding box selection on mousedown in empty space.**

```typescript
const handleMouseDown = (e: React.MouseEvent) => {
  if (e.button !== 0) return;   // left click only

  // Don't start if clicking on interactive block elements
  const target = e.target as HTMLElement;
  if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;

  // Check if click landed on a block's bullet or content
  if (isPointInBlock(e.clientX, e.clientY)) return;

  e.preventDefault();
  startBoundingBoxSelection(e.clientX, e.clientY);
  selectionOps.clearSelection();
  collectBlockRects();
};
```

`isPointInBlock` uses `document.elementFromPoint()` to check whether the click landed on a `.block-textarea` or `.block-bullet`. If so, the bounding box doesn't activate. This allows:
- **Click inside textarea** → places text cursor (no block selection)
- **Click on bullet** → selects that block (handled by bullet click, not bounding box)
- **Click on empty space** → starts bounding box drag-select

### Block Rect Snapshotting

When selection starts, snapshot all block positions immediately:

```typescript
const collectBlockRects = () => {
  const blocks = container.querySelectorAll('[data-url]');
  const rects: BlockRect[] = [];

  blocks.forEach(block => {
    const url = block.getAttribute('data-url') as AutomergeUrl;
    // CRITICAL: measure .block-row, not the full .block div
    const rowElement = block.querySelector('.block-row');
    const rect = (rowElement || block).getBoundingClientRect();
    rects.push({ url, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
  });

  blockRectsRef.current = rects;
};
```

**Why measure `.block-row`?** The outer `.block` div includes the entire subtree of children. If you measure it, drawing a box near any child would also select the parent, because the parent's rect encompasses everything. Measuring only the `.block-row` (just the bullet + textarea for that single line) gives correct per-block hit testing.

**Why snapshot once?** Block positions don't change during a drag-select. Recalculating on every mousemove would be wasteful and could introduce jitter if blocks reflow.

### Overlap Detection

On each mousemove, compute which block rects overlap the selection box:

```typescript
const getBlocksInBox = (box: SelectionBox): AutomergeUrl[] => {
  const minX = Math.min(box.startX, box.currentX);
  const maxX = Math.max(box.startX, box.currentX);
  const minY = Math.min(box.startY, box.currentY);
  const maxY = Math.max(box.startY, box.currentY);

  return blockRectsRef.current
    .filter(rect => {
      const overlapsX = rect.left < maxX && rect.right > minX;
      const overlapsY = rect.top < maxY && rect.bottom > minY;
      return overlapsX && overlapsY;
    })
    .map(rect => rect.url);
};
```

The overlapping URLs are passed directly to `selectBlocks()`, which sets them as the selection:

```typescript
selectBlocks: (urls: AutomergeUrl[]) => {
  if (urls.length === 0) {
    setState(clearSelectionFn());
  } else {
    setState({
      anchor: urls[0],
      focus: urls[urls.length - 1],
      selected: new Set(urls),
    });
  }
},
```

### Rendering the Selection Box

The box is a `position: fixed` div with semi-transparent styling and `pointerEvents: 'none'` so it doesn't interfere with the underlying content:

```typescript
const boxStyle = selectionBox ? {
  position: 'fixed',
  left: Math.min(selectionBox.startX, selectionBox.currentX),
  top: Math.min(selectionBox.startY, selectionBox.currentY),
  width: Math.abs(selectionBox.currentX - selectionBox.startX),
  height: Math.abs(selectionBox.currentY - selectionBox.startY),
  backgroundColor: 'rgba(66, 133, 244, 0.2)',
  border: '1px solid rgba(66, 133, 244, 0.5)',
  pointerEvents: 'none',
  zIndex: 9999,
} : null;
```

The box is rendered as a sibling of the block tree, not inside any specific block. It appears during drag and disappears on `mouseup`.

### Global Event Listeners

**Critical:** Attach `mousemove` and `mouseup` to `window`, not the container element. If the mouse leaves the container during drag, the selection must still track and complete:

```typescript
useEffect(() => {
  if (isSelecting) {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }
}, [isSelecting]);
```

### Edge cases to test

| Scenario | Expected behavior |
|----------|-------------------|
| Click in textarea, drag within it | Normal text selection, no bounding box |
| Click in textarea, drag vertically past block boundary | Should NOT trigger block selection (text selection continues) |
| Click in textarea, drag horizontally left past textarea edge | Should NOT trigger block selection |
| Click on empty space, drag across blocks | Bounding box appears, blocks selected |
| Click on empty space, drag outside the container | Selection continues tracking via window listeners |
| Triple-click in textarea (select all text) | No block selection, just text selection |
| Selection box disappears on mouseup | Box element removed from DOM, selected blocks remain highlighted |

---

## Selection Visual Feedback

Selected blocks receive a CSS class:

```css
.block.selected > .block-row {
  background-color: rgba(66, 133, 244, 0.15);
  border-radius: 4px;
}
```

The `.selected` class is applied to the outer `.block` div, but the background is scoped to `> .block-row` — this prevents the highlight from covering the block's children. Only the selected block's own row gets the blue tint.

Each block checks its selection state via the provider:

```typescript
function useBlockSelection(url: AutomergeUrl) {
  const { state, operations } = useSelection();
  return {
    isSelected: state.selected.has(url),
    select: (extend = false) => operations.selectBlock(url, extend),
  };
}
```

---

## Batch Operations

When multiple blocks are selected, certain operations apply to the entire selection:

### Batch Indent/Unindent (Tab / Shift+Tab)

Tab and Shift+Tab apply to all selected blocks. But the operation must be **validated for the entire selection** before proceeding — partial application would leave the tree in a confusing state:

```typescript
function canBatchIndent(
  selection: SelectionContext,
  flattenedBlocks: BlockPosition[],
  direction: 'indent' | 'unindent'
): boolean {
  const selectedBlocks = flattenedBlocks.filter(b =>
    selection.selected.has(b.url)
  );
  if (selectedBlocks.length === 0) return false;

  if (direction === 'indent') {
    // First selected block must have a previous sibling to indent under
    return selectedBlocks[0].indexInParent > 0;
  } else {
    // ALL selected blocks must have parents (can't unindent root-level)
    return selectedBlocks.every(b => b.parentUrl !== null && b.depth > 0);
  }
}
```

**Why check the first block for indent?** Indenting means "become a child of the previous sibling." If the first selected block has no previous sibling, there's nothing to indent under. The remaining blocks follow suit.

**Why check all blocks for unindent?** Unindenting means "move up one level." Any root-level block in the selection blocks the entire operation.

### Batch Drag

When dragging from a selected block, the entire selection is dragged. See [Selection and Multi-Block Drag](#selection-and-multi-block-drag) in Part 2.

### Ordering guarantee

Batch operations always process blocks in **document order** (top-to-bottom), regardless of the order they were selected:

```typescript
function getBlocksForBatchOperation(
  selection: SelectionContext,
  flattenedBlocks: BlockPosition[]
): AutomergeUrl[] {
  return flattenedBlocks
    .filter(b => selection.selected.has(b.url))
    .map(b => b.url);
}
```

---

## Selection Clearing

Selection clears in these situations:

| Trigger | Behavior |
|---------|----------|
| Click a bullet without Shift | Clears previous selection, selects clicked block |
| Click inside a textarea | Clears block selection, enters text editing mode |
| Start bounding box drag | Clears previous selection before starting new one |
| Shift+Click the only selected block | Clears selection entirely |
| Escape key (if implemented) | Clears selection |

```typescript
function clearSelection(): SelectionContext {
  return { anchor: null, focus: null, selected: new Set() };
}
```

**Selection persists after drag-drop.** When you drop selected blocks, the selection is not automatically cleared. The user can still see what they just moved. Clicking elsewhere clears it.

---

# Part 2: Drag and Drop

---

## Data Model

The outliner's tree is composed of **blocks**, where each block is an independent document (in our case, an Automerge CRDT document with its own URL). A block's children are stored as an ordered array of references:

```typescript
interface ChildReference {
  url: AutomergeUrl;      // Points to the child block document
  instanceId: string;     // UUID unique to this specific placement
}

interface Block {
  id: string;
  content: string;
  children: ChildReference[];
  metadata: { created: string; modified: string };
}
```

**Why `instanceId`?** The same block can appear in multiple places in the tree (transclusion / block references). Each placement gets a unique `instanceId` so the UI can distinguish between them. When you Alt+drag to create a reference, a new `ChildReference` is created with the same `url` but a fresh `instanceId`.

**Why per-block documents?** Each block being its own document means drag-and-drop is a metadata operation — you never copy content, you just move or duplicate a *reference*. This also means all drag-drop operations work offline and sync via CRDT merge.

The three mutation primitives needed for drag-and-drop:

```typescript
// On the parent block:
async addChild(child: BlockHandle, index?: number): Promise<void>
async removeChild(index: number): Promise<void>
async moveChild(fromIndex: number, toIndex: number): Promise<void>
```

---

## HTML Structure

The DOM structure matters for drag-and-drop more than you'd expect. The key insight: **put `data-url` on the block row, not the block container.**

```html
<div class="block" data-instance-id="..." data-depth="0">
  <!-- block-row = just bullet + text for THIS block -->
  <div class="block-row" data-url="automerge:abc123">
    <div class="block-bullet-container" style="padding-left: 0px">
      <button class="block-expand-toggle">▶</button>
      <button class="block-bullet" draggable="true">•</button>
    </div>
    <div class="block-content">
      <textarea class="block-textarea" rows="1">Block text</textarea>
    </div>
  </div>
  <!-- Children rendered recursively -->
  <div class="block-children" role="group">
    <div class="block" data-depth="1">
      <div class="block-row" data-url="automerge:def456">...</div>
    </div>
  </div>
</div>
```

**Why this matters:** The outer `.block` div encompasses the entire subtree. If you use it for hit-testing, hovering over a child block will also match the parent, because the parent's bounding rect contains everything. Placing `data-url` on `.block-row` (which is just the single line: bullet + textarea) gives you accurate per-block hit detection.

The `draggable="true"` attribute goes on the **bullet element**, not the whole block. This keeps text selection working normally inside the textarea — only the bullet initiates drag.

---

## Drag Initiation

Drag starts from the bullet element via the HTML5 Drag and Drop API:

```typescript
const onDragStart = (e: React.DragEvent) => {
  // If this block is part of a multi-block selection, drag all selected
  const urls = selectionState.selected.size > 0
    ? Array.from(selectionState.selected)
    : [blockUrl];

  e.dataTransfer.effectAllowed = 'copyMove';
  e.dataTransfer.setData('text/plain', JSON.stringify(urls));

  // Tell the drag context what we're dragging
  dragOps.startDrag(urls);
};
```

**Key decisions:**
- `effectAllowed = 'copyMove'` because we support both move (default) and copy/reference (Alt+drag)
- We use the native browser drag image (the ghosted element). No custom `setDragImage()` needed — simpler and more predictable.
- The drag payload is serialized as JSON in `text/plain`, containing the URLs of all blocks being dragged.

---

## Drop Zone Calculation

Each block is divided into three vertical zones based on mouse Y position:

```
┌──────────────────────────┐
│     Top 25%: BEFORE      │  → Insert as sibling before this block
├──────────────────────────┤
│                          │
│    Middle 50%: INTO      │  → Insert as first child of this block
│                          │
├──────────────────────────┤
│    Bottom 25%: AFTER     │  → Insert as sibling after this block
└──────────────────────────┘
```

```typescript
interface DropZone {
  parentUrl: AutomergeUrl;
  position: 'before' | 'after' | 'into';
  index: number;  // insertion index in the parent's children array
}

function calculateDropZone(
  mouseY: number,
  blockBounds: { top: number; bottom: number; height: number },
  parentUrl: AutomergeUrl,
  indexInParent: number
): DropZone {
  const percentage = (mouseY - blockBounds.top) / blockBounds.height;

  if (percentage < 0.25) {
    // Before: same parent, same index (pushes target forward)
    return { parentUrl, position: 'before', index: indexInParent };
  } else if (percentage > 0.75) {
    // After: same parent, index + 1
    return { parentUrl, position: 'after', index: indexInParent + 1 };
  } else {
    // Into: target block becomes the parent, index 0 (first child)
    return { parentUrl: targetBlockUrl, position: 'into', index: 0 };
  }
}
```

**The "into" zone is what makes this an outliner** rather than just a reorderable list. The middle 50% of each block is a drop target that reparents the dragged block as a child. This is how users build hierarchy through drag-and-drop.

The 25/50/25 split is a good default. Some implementations use dynamic zones that favor "before" and "after" when the target block already has children, and favor "into" when it's a leaf — but the fixed split is simpler and works well in practice.

---

## Drop Visual Feedback

Three CSS classes correspond to the three drop zones:

```typescript
function getDropZoneClass(position: 'before' | 'after' | 'into' | null): string {
  if (!position) return '';
  switch (position) {
    case 'before': return 'drop-zone-before';
    case 'after':  return 'drop-zone-after';
    case 'into':   return 'drop-zone-into';
  }
}
```

| Zone | Visual Treatment | CSS Approach |
|------|-----------------|--------------|
| Before | Horizontal blue line above the block | `border-top` or `::before` pseudo-element |
| After | Horizontal blue line below the block | `border-bottom` or `::after` pseudo-element |
| Into | Blue outline/highlight around the block | `outline` or `box-shadow` |

Cursor feedback changes based on the drag mode:

```typescript
function getDragVisualFeedback(altKey: boolean) {
  return {
    cursorStyle: altKey ? 'copy' : 'move',
    showPlusIndicator: altKey,  // "+" badge signals reference creation
  };
}
```

Set `e.dataTransfer.dropEffect` on every `dragover` event to make the browser show the right cursor:

```typescript
const onDragOver = (e: React.DragEvent) => {
  e.preventDefault();  // Required to allow drop
  e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
  // ... calculate and display drop zone
};
```

**Common visual bug:** If you only apply the drop-zone class to the currently hovered block but forget to remove it from the previous one, you get lingering indicators. Track the current drop target in state and clear the previous one on every `dragover`.

---

## Executing the Drop

On drop, the operation depends on the resolved mode and drop zone:

```typescript
const onDrop = (e: React.DragEvent) => {
  e.preventDefault();

  const { action, dropZone } = getDragResult(dragContext);
  if (action === 'invalid') return;

  if (action === 'move') {
    // 1. Remove block from source parent
    await sourceParent.removeChild(sourceIndex);
    // 2. Add to destination parent at computed index
    await destParent.addChild(blockHandle, dropZone.index);
  } else if (action === 'reference') {
    // Don't remove from source — just add a new reference
    await destParent.addChild(blockHandle, dropZone.index);
    // addChild creates a new ChildReference with a fresh instanceId
  }

  dragOps.endDrag();
};
```

**Move = remove + insert.** The block document itself doesn't change — only its parent's `children` array is modified. The source parent loses a `ChildReference`, and the destination parent gains one.

**Reference = insert only.** The same block URL now appears in two parents' `children` arrays, each with a unique `instanceId`. Edits to the block's content are visible in both locations.

---

## Modifier Keys

| Modifier | During Drag | Effect |
|----------|-------------|--------|
| None | Default | **Move**: block is relocated, removed from source |
| Alt/Option | Hold during drag | **Reference**: block stays at source, a new reference is placed at destination |

```typescript
function getDragMode(altKey: boolean): 'move' | 'reference' {
  return altKey ? 'reference' : 'move';
}
```

**Implementation detail:** Check `e.altKey` on every `dragover` event, not just `dragstart`. This lets users toggle the mode in real-time by pressing or releasing Alt mid-drag. This is better UX than Roam Research's approach, which requires Alt to be held *before* initiating the drag and doesn't allow mid-drag mode changes.

Visual feedback must update in real-time too — when the user presses Alt mid-drag, the cursor should immediately switch from "move" to "copy" and the `+` indicator should appear.

---

## Selection and Multi-Block Drag

### Selection Model

Selection uses an anchor-focus model with a contiguous range constraint:

```typescript
interface SelectionContext {
  anchor: BlockId | null;   // where selection started
  focus: BlockId | null;    // where selection ends
  selected: Set<BlockId>;   // all blocks in the contiguous range
}
```

**Contiguous-only:** Non-contiguous selection (Ctrl+Click) is intentionally unsupported. It adds significant complexity to drag-drop (what does it mean to drag blocks from three different locations?) with little practical value.

### Multi-Block Drag Behavior

When the user drags from a block that's part of a selection, the entire selection is dragged:

```typescript
const onDragStart = (e: React.DragEvent) => {
  const urls = selectionState.selected.size > 0
    ? Array.from(selectionState.selected)
    : [blockUrl];
  dragOps.startDrag(urls);
};
```

On drop, each block in the selection is moved/referenced in order. The selection is preserved after the drop completes — the user can still see what they just moved.

### Selection Inputs

| Action | Result |
|--------|--------|
| Click bullet | Select single block (clear previous) |
| Shift+Click bullet | Extend selection range from anchor to clicked block |
| Shift+Arrow Up/Down | Extend selection by one block |
| Drag in empty space | Bounding box selection (see below) |

---

## Validation

Drops must be validated to prevent creating cycles in the tree:

```typescript
function isValidDrop(
  draggingUrls: AutomergeUrl[],
  targetUrl: AutomergeUrl,
  targetDescendants: Set<AutomergeUrl>
): boolean {
  // Cannot drop a block onto itself
  if (draggingUrls.includes(targetUrl)) return false;

  // Cannot drop a block into any of its own descendants
  for (const url of draggingUrls) {
    if (targetDescendants.has(url)) return false;
  }
  return true;
}
```

**Why this matters:** If block A contains child B, and you drop A into B, you've created A→B→A — a cycle. The tree becomes infinite. You need to walk the target's ancestor chain (or precompute descendants) and reject any drop where the dragged block is an ancestor of the target.

For multi-block drag, validate *every* block in the selection against the target. If any single block would create a cycle, the entire drop is invalid.

When validation fails, return `{ action: 'invalid' }` and suppress all visual drop indicators — no blue line, cursor shows "not-allowed."

---

## Same-Parent Index Adjustment

When moving blocks within the same parent, removing a source block shifts the indices of all subsequent siblings. You must adjust the target index:

```typescript
function adjustDropIndexForSameParent(
  sourceIndices: number[],
  targetIndex: number
): number {
  const countBefore = sourceIndices.filter(i => i < targetIndex).length;
  return targetIndex - countBefore;
}
```

**Example walkthrough:**

```
Parent children: [A, B, C, D, E]
                   0  1  2  3  4

Drag B (index 1) to after D (target index 4):

1. Remove B:      [A, C, D, E]    — indices shifted
                    0  1  2  3
2. Adjusted index: 4 - 1 = 3      — one source before target
3. Insert at 3:   [A, C, D, B, E]
```

For multi-block moves (e.g., dragging indices 1 and 3 to index 5):
```
adjustDropIndexForSameParent([1, 3], 5) = 5 - 2 = 3
```

**This adjustment only applies when source and destination share the same parent.** Cross-parent moves don't need it because the remove and insert happen on different arrays.

---

## Auto-Expand Collapsed Blocks

When a user drags over a collapsed block, it should auto-expand after a short delay so they can drop into its children without having to cancel the drag, expand manually, and start over:

```typescript
function shouldExpandOnDragHover(
  isCollapsed: boolean,
  hoverDuration: number,
  expandDelay: number = 500  // milliseconds
): boolean {
  return isCollapsed && hoverDuration >= expandDelay;
}
```

**Implementation:** Track when the drag enters each block (via `dragenter` or `dragover` timing). When the hover duration exceeds the threshold, expand the block. Reset the timer when the drag leaves.

500ms is a good default — fast enough to feel responsive, slow enough to avoid accidental expansion when dragging past.

---

## Architecture

The most important architectural decision: **all selection and drag-drop logic is pure functions, independent of React, the DOM, and the data layer.**

```
┌───────────────────────────────────────────────────────────┐
│  Behavior Layer (pure functions)                          │
│  selection.ts: computeSelectedBlocks, shiftClickBlock,    │
│    extendSelection, canBatchIndent, etc.                  │
│  dragDrop.ts: calculateDropZone, isValidDrop,             │
│    getDragMode, adjustDropIndexForSameParent, etc.        │
│  Input: context object → Output: action/result            │
├───────────────────────────────────────────────────────────┤
│  Component Layer (React)                                  │
│  SelectionProvider, DragContext, BoundingBoxSelection,    │
│  Block, BlockBullet                                       │
│  Translates DOM events → contexts, actions → effects      │
├───────────────────────────────────────────────────────────┤
│  Data Layer (Automerge CRDT)                              │
│  BlockHandle.addChild(), removeChild(), etc.              │
│  Tree mutations, sync                                     │
└───────────────────────────────────────────────────────────┘
```

**Why this matters:**
- Behavior functions are trivially unit-testable — no DOM, no async, just data in → data out
- The component layer is thin: translate events into context objects, call behavior functions, execute the result
- The data layer knows nothing about drag-and-drop — it just exposes tree mutation primitives
- You can test every edge case (circular drops, same-parent reordering, multi-block validation) with fast synchronous tests

```typescript
// Example: testing selection with no DOM
it('Shift+Click on selected block removes it and descendants', () => {
  const blocks = [
    { url: 'a', parentUrl: null, indexInParent: 0, depth: 0 },
    { url: 'a1', parentUrl: 'a', indexInParent: 0, depth: 1 },
    { url: 'b', parentUrl: null, indexInParent: 1, depth: 0 },
  ];
  const selection = { anchor: 'a', focus: 'b', selected: new Set(['a', 'a1', 'b']) };

  const result = shiftClickBlock('a', selection, blocks);

  expect(result.selected.has('a')).toBe(false);   // removed
  expect(result.selected.has('a1')).toBe(false);  // descendant removed
  expect(result.selected.has('b')).toBe(true);    // kept
});

// Example: testing drop zone calculation with no DOM
it('middle of block returns into zone', () => {
  const zone = calculateDropZone(
    150,                                    // mouseY: middle of block
    { top: 100, bottom: 200, height: 100 }, // block bounds
    'parent-url' as AutomergeUrl,
    2                                       // index in parent
  );
  expect(zone.position).toBe('into');
  expect(zone.index).toBe(0);  // first child
});
```

---

## Edge Cases

### Dropping at exact zone boundaries

At exactly 25% or 75%, the middle "into" zone wins (because the conditions are `< 0.25` and `> 0.75`). This is a deliberate choice — "into" is the hardest zone to hit, so it deserves the tiebreaker.

### Dragging a block with children

Standard drag moves the block and all its children as a unit. The block's `children` array comes along for free because children are stored inside the block document. No special handling needed for the subtree — it moves atomically.

### Reference to a reference

When Alt+dragging a block that is itself a reference (appears in multiple places), you create another reference to the same underlying block. All three placements share the same content. This is valid and intentional.

### Empty blocks

Dragging an empty block is allowed. Dropping "into" an empty block is allowed (it gains its first child).

### Root-level constraints

Whether blocks can be dragged to the root level depends on your data model. If you have a single root document, blocks can only be siblings within it. Validate accordingly.

### Concurrent edits (CRDT-specific)

With CRDTs, two users can simultaneously reparent the same block. Automerge handles the array splice conflicts, but the result may be surprising (block appears in both locations). The `instanceId` pattern helps here — each placement is unique, so concurrent moves don't cause duplication of content, just duplication of references, which can be detected and resolved.

### Mobile

Touch devices don't have modifier keys. If you need reference-creation on mobile, provide a mode toggle in the UI (e.g., a toolbar button that switches between move and reference mode). Long-press to initiate drag works via the HTML5 drag API on most mobile browsers, but the experience is less reliable than desktop.

---

## Browser Compatibility

| Browser | Reliability | Notes |
|---------|-------------|-------|
| Chrome | Best | Most reliable drag-drop and visual feedback |
| Firefox | Good | Sidebar-to-main drag may have issues |
| Safari | Fair | Accuracy problems with drop zone visual feedback |
| Mobile browsers | Variable | No modifier keys; long-press initiation varies |

The HTML5 Drag and Drop API is well-supported but has quirks:
- You **must** call `e.preventDefault()` in `dragover` to allow drops
- `dropEffect` and `effectAllowed` interact in non-obvious ways across browsers
- Some browsers fire `dragleave` before `dragenter` when moving between adjacent elements, causing flicker. Debounce or use a counter to track enter/leave pairs.
