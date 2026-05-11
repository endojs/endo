# Building a Browser-Based Outliner: HTML Interaction Patterns

A comprehensive guide to the interaction patterns required to make a block-based outliner feel like a real editable document in the browser. Based on patterns converged upon in the [Muddle](https://github.com/nicedland/muddle) project — a local-first collaborative knowledge graph.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [The Behavior Layer: Pure Functions Over DOM Events](#the-behavior-layer)
3. [DOM Structure & Why We Use Textareas](#dom-structure)
4. [Keyboard Interactions](#keyboard-interactions)
   - [Arrow Key Navigation & Boundary Crossing](#arrow-key-navigation)
   - [Enter Key: Block Creation & Splitting](#enter-key)
   - [Backspace & Delete: Merging & Deletion](#backspace-and-delete)
   - [Tab / Shift+Tab: Indent & Dedent](#indent-and-dedent)
   - [Modifier Combos](#modifier-combos)
5. [Drag-to-Select (Bounding Box Selection)](#drag-to-select)
6. [Multi-Block Selection Model](#multi-block-selection)
7. [Drag and Drop](#drag-and-drop)
8. [Focus Management](#focus-management)
9. [Paste Handling](#paste-handling)
10. [Testing Strategies](#testing-strategies)
11. [Lessons Learned](#lessons-learned)

---

## Architecture Overview

An outliner presents a tree of blocks where each block is an independently editable text node. The core challenge is making this tree feel like a single continuous document — arrow keys should flow between blocks, Enter should create new blocks, Backspace should merge them, and drag-to-select should work across block boundaries.

Our architecture separates concerns into three layers:

```
┌──────────────────────────────────────────────────────┐
│  Behavior Layer (pure functions)                     │
│  editing.ts, navigation.ts, selection.ts, dragDrop.ts│
│  Input: context object → Output: action descriptor   │
├──────────────────────────────────────────────────────┤
│  Component Layer (React)                             │
│  BlockContent, Block, BlockTree, BoundingBoxSelection│
│  Translates DOM events → contexts, actions → effects │
├──────────────────────────────────────────────────────┤
│  Data Layer (Automerge CRDT)                         │
│  BlockHandle, BlockTreeContext                       │
│  Tree mutations, content updates, sync               │
└──────────────────────────────────────────────────────┘
```

The behavior layer is the heart of the system. Every keyboard interaction is modeled as a **pure function** that takes a context object (cursor position, surrounding blocks, modifier keys) and returns an action descriptor. The component layer translates DOM events into these contexts and executes the returned actions. This makes the interaction logic trivially testable without a browser.

---

## The Behavior Layer

The single most important architectural decision: **all interaction logic lives in pure functions that are independent of React, the DOM, and the data layer.**

### Type Definitions

```typescript
// The context passed to editing behavior functions
interface EditingContext {
  key: 'Enter' | 'Backspace' | 'Delete' | 'Tab';
  cursorPosition: number;
  textLength: number;
  content: string;
  hasChildren: boolean;
  previousBlock: BlockId | null;
  nextBlock: BlockId | null;
  parentUrl: BlockId | null;
  canIndent: boolean;
  canUnindent: boolean;
  modifiers: { shift: boolean; cmd: boolean; alt: boolean };
}

// The context passed to navigation behavior functions
interface NavigationContext {
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
  cursorPosition: number;
  textLength: number;
  previousBlock: BlockId | null;
  nextBlock: BlockId | null;
  isCollapsed: boolean;
  modifiers: { shift: boolean; cmd: boolean; alt: boolean };
}

// Actions returned by the behavior functions
type EditAction =
  | { type: 'create-sibling'; content?: string }
  | { type: 'create-child'; content?: string }
  | { type: 'split'; atPosition: number }
  | { type: 'merge-previous' }
  | { type: 'merge-next' }
  | { type: 'delete' }
  | { type: 'indent' }
  | { type: 'unindent' }
  | { type: 'insert-newline' }
  | { type: 'default' };

type NavigationResult = {
  action: 'navigate' | 'extend-selection' | 'toggle-expand' | 'default';
  target?: BlockId;
  cursorPosition?: 'start' | 'end' | number;
};
```

The `{ type: 'default' }` action is critical — it means "let the browser handle this normally." Most keystrokes fall through to default behavior. The behavior layer only intercepts keys at meaningful boundaries.

### Why This Matters

This pattern means you can write tests like:

```typescript
it('Enter at end creates sibling', () => {
  const ctx = createContext({
    cursorPosition: 20,
    textLength: 20,
    hasChildren: false,
  });
  expect(getEnterAction(ctx)).toEqual({ type: 'create-sibling' });
});
```

No DOM, no React, no async. Just data in, data out. This is how we achieved comprehensive test coverage of every edge case without slow browser tests.

---

## DOM Structure

### Why Textareas, Not ContentEditable

We use `<textarea>` elements instead of `contentEditable` divs. This is a deliberate choice:

- **Predictable cursor behavior**: `textarea.selectionStart` / `selectionEnd` give exact numeric cursor positions. ContentEditable uses Range/Selection APIs that are notoriously inconsistent across browsers.
- **No HTML injection surface**: Textareas only contain plain text. No XSS concerns from paste, no unexpected formatting.
- **Simpler event model**: `onChange` gives you the new value. No `beforeinput` / `input` event circus.
- **Auto-resize is trivial**: Set `height: auto`, then `height = scrollHeight + 'px'` on every change.

The tradeoff is that rich text formatting (bold, links) must be rendered separately — we use markdown rendering for display and raw text for editing.

### HTML Structure

```html
<div class="block-tree">
  <div class="block" data-instance-id="..." data-depth="0">
    <!-- The block-row contains bullet + content on one line -->
    <div class="block-row" data-url="automerge:abc123">
      <!-- Bullet area: expand toggle + drag handle -->
      <div class="block-bullet-container" style="padding-left: 0px">
        <button class="block-expand-toggle">▶</button>
        <button class="block-bullet" draggable="true">•</button>
      </div>
      <!-- Editable text -->
      <div class="block-content">
        <textarea class="block-textarea" rows="1">Block text here</textarea>
      </div>
    </div>
    <!-- Children rendered recursively -->
    <div class="block-children" role="group">
      <div class="block" data-depth="1">
        <div class="block-row" data-url="automerge:def456">
          <div class="block-bullet-container" style="padding-left: 24px">
            <!-- 24px per depth level -->
            ...
          </div>
          ...
        </div>
      </div>
    </div>
  </div>
</div>
```

**Critical detail**: `data-url` is placed on `.block-row`, NOT on the outer `.block` div. The outer `.block` div includes children, so its bounding rect encompasses the entire subtree. Placing `data-url` on `.block-row` ensures that when we measure block positions for drag-select, a parent block's rect doesn't overlap its children's rects.

### Indentation via Padding

Indentation is achieved with `padding-left: ${depth * 24}px` on the bullet container. The tree structure is real (nested DOM), but visual indentation is controlled by this padding rather than CSS nesting rules. A vertical guide line is drawn with a `::before` pseudo-element on `.block-children`:

```css
.block-children::before {
  content: '';
  position: absolute;
  left: 32px;
  top: 0; bottom: 0;
  width: 1px;
  background-color: var(--border-light, #e0e0e0);
}
```

### Auto-Resizing Textarea

```typescript
useEffect(() => {
  const textarea = textareaRef.current;
  if (textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }
}, [content]);
```

Setting `height: auto` first collapses the textarea, then `scrollHeight` gives the natural content height. Combined with `overflow: hidden` and `resize: none` in CSS, this makes the textarea seamlessly grow and shrink with its content.

---

## Keyboard Interactions

### Arrow Key Navigation

The single most defining behavior of an outliner — separating it from a regular text editor — is **arrow key boundary crossing**. When the cursor hits the edge of one block, it flows into the adjacent block.

```typescript
export function getNavigationAction(ctx: NavigationContext): NavigationResult {
  const { key, cursorPosition, textLength, modifiers } = ctx;

  // Cmd/Ctrl + Up/Down toggles expand/collapse
  if (modifiers.cmd && (key === 'ArrowUp' || key === 'ArrowDown')) {
    return { action: 'toggle-expand' };
  }

  // Shift + Up/Down extends block selection
  if (modifiers.shift && (key === 'ArrowUp' || key === 'ArrowDown')) {
    const target = key === 'ArrowUp' ? ctx.previousBlock : ctx.nextBlock;
    if (target) return { action: 'extend-selection', target };
    return { action: 'default' };
  }

  // LEFT at position 0 → jump to END of previous block
  if (key === 'ArrowLeft' && cursorPosition === 0 && ctx.previousBlock) {
    return { action: 'navigate', target: ctx.previousBlock, cursorPosition: 'end' };
  }

  // RIGHT at end → jump to START of next block
  if (key === 'ArrowRight' && cursorPosition === textLength && ctx.nextBlock) {
    return { action: 'navigate', target: ctx.nextBlock, cursorPosition: 'start' };
  }

  // LEFT/RIGHT within text: let browser handle it
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    return { action: 'default' };
  }

  // UP at text start → navigate to previous block
  if (key === 'ArrowUp' && cursorPosition === 0 && ctx.previousBlock) {
    return { action: 'navigate', target: ctx.previousBlock, cursorPosition: 'end' };
  }

  // DOWN at text end → navigate to next block
  if (key === 'ArrowDown' && cursorPosition === textLength && ctx.nextBlock) {
    return { action: 'navigate', target: ctx.nextBlock, cursorPosition: 'start' };
  }

  return { action: 'default' };
}
```

**Key behavioral details:**

| Key | Position | Result |
|-----|----------|--------|
| Left Arrow | Position 0 | Jump to **end** of previous block |
| Right Arrow | End of text | Jump to **start** of next block |
| Up Arrow | Position 0 | Jump to **end** of previous block |
| Down Arrow | End of text | Jump to **start** of next block |
| Any arrow | Mid-text | Default browser behavior (move within text) |

The Left/Right crossing works across indentation levels — pressing Left at the start of a child block jumps to the end of the parent, and Right at the end of a parent jumps into the first child.

Navigation respects collapsed state: if a parent block is collapsed, its children are skipped in the traversal order:

```typescript
export function findAdjacentVisibleBlock(
  currentId: string,
  blocks: Array<{ id: string; isVisible: boolean }>,
  direction: 'previous' | 'next'
): string | null {
  const visibleBlocks = blocks.filter(b => b.isVisible);
  const currentIndex = visibleBlocks.findIndex(b => b.id === currentId);
  if (currentIndex === -1) return null;

  if (direction === 'previous') {
    return currentIndex > 0 ? visibleBlocks[currentIndex - 1].id : null;
  } else {
    return currentIndex < visibleBlocks.length - 1
      ? visibleBlocks[currentIndex + 1].id : null;
  }
}
```

### Enter Key

Enter behavior is context-aware based on cursor position:

```typescript
export function getEnterAction(ctx: EditingContext): EditAction {
  const { cursorPosition, textLength, modifiers } = ctx;

  // Shift+Enter: soft line break within same block
  if (modifiers.shift) {
    return { type: 'insert-newline' };
  }

  // At end: create sibling (or child if block has expanded children)
  if (cursorPosition === textLength) {
    if (ctx.hasChildren && textLength > 0) {
      return { type: 'create-child' };
    }
    return { type: 'create-sibling' };
  }

  // At beginning: insert empty block above
  if (cursorPosition === 0) {
    return { type: 'create-sibling', content: '' };
  }

  // Mid-text: split block at cursor
  return { type: 'split', atPosition: cursorPosition };
}
```

| Cursor Position | Context | Result |
|-----------------|---------|--------|
| End of text | No children | Create empty sibling below |
| End of text | Has expanded children | Create empty child (first position) |
| Beginning | Any | Insert empty block above, keep cursor in original |
| Mid-text | Any | Split: text before stays, text after moves to new block |
| Any | Shift held | Insert `\n` within block (soft line break) |
| End of empty block | Has children | Create sibling (not child) |

**Split helper:**

```typescript
export function splitContent(content: string, atPosition: number) {
  return {
    before: content.slice(0, atPosition),
    after: content.slice(atPosition),
  };
}
```

**Focus requirement (SPEC-ENTER-4):** After Enter creates a new block, cursor **must** appear in the new block within 500ms, ready for typing. This is the most critical UX requirement — if the user has to click to start typing in the new block, the outliner feels broken.

### Backspace and Delete

```typescript
export function getBackspaceAction(ctx: EditingContext): EditAction {
  const { cursorPosition, textLength, previousBlock } = ctx;

  // Not at beginning: let browser delete the character
  if (cursorPosition !== 0) return { type: 'default' };

  // At beginning of empty block: delete the block entirely
  if (textLength === 0 && previousBlock) return { type: 'delete' };

  // At beginning of non-empty block: merge into previous
  if (previousBlock) return { type: 'merge-previous' };

  return { type: 'default' };
}

export function getDeleteAction(ctx: EditingContext): EditAction {
  const { cursorPosition, textLength, nextBlock } = ctx;

  // Not at end: let browser delete the character
  if (cursorPosition !== textLength) return { type: 'default' };

  // At end with next block: pull next block's content into this one
  if (nextBlock) return { type: 'merge-next' };

  return { type: 'default' };
}
```

**Merge helper** (cursor lands at the junction point):

```typescript
export function mergeContent(first: string, second: string) {
  return {
    merged: first + second,
    cursorPosition: first.length, // cursor at the join point
  };
}
```

| Key | Position | Block State | Result |
|-----|----------|-------------|--------|
| Backspace | Position 0 | Empty, has previous | Delete block, focus previous at end |
| Backspace | Position 0 | Has text, has previous | Merge: concatenate with previous, cursor at junction |
| Backspace | Position 0 | No previous | No-op |
| Backspace | Mid-text | Any | Default (delete char) |
| Delete | End of text | Has next block | Merge: pull next block's text into this one |
| Delete | End of text | No next | No-op |
| Delete | Mid-text | Any | Default (delete char) |

### Indent and Dedent

Tab indents a block (makes it a child of its previous sibling). Shift+Tab unindents (moves it up to its parent's level).

```typescript
export function getTabAction(ctx: EditingContext): EditAction {
  const { modifiers, canIndent, canUnindent } = ctx;

  if (modifiers.shift) {
    return canUnindent ? { type: 'unindent' } : { type: 'default' };
  }
  return canIndent ? { type: 'indent' } : { type: 'default' };
}
```

**Indent operation** (tree mutation):
1. Find the block's previous sibling in the parent's children array
2. Remove the block from its current parent
3. Append the block as the last child of the previous sibling
4. Expand the new parent so children are visible

**Unindent operation** (tree mutation):
1. Remove the block from its current parent
2. Insert it into the grandparent's children array, immediately after the parent

**When indent is allowed:**
- Block has a previous sibling (you can't indent the first child — there's nothing to nest under)
- Block is not at root level (implementation-specific)

**When unindent is allowed:**
- Block has a parent AND that parent has a parent (grandparent exists)
- Block is not already at root level

**Cursor preservation:** After indent/unindent, the block's textarea is destroyed and recreated (it moves in the DOM). The focus manager saves the cursor position before the operation and restores it after the new textarea mounts.

### Modifier Combos

| Combo | Action |
|-------|--------|
| Cmd/Ctrl+Z | Undo |
| Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y | Redo |
| Cmd/Ctrl+Up | Collapse children |
| Cmd/Ctrl+Down | Expand children |
| Cmd/Ctrl+A | Move to block start (first press) / Select all (second press) |
| Cmd/Ctrl+E | Jump to block end |
| Cmd/Ctrl+J | Create new note |
| Shift+Enter | Soft line break within block |
| Shift+Up/Down | Extend block selection |
| `[` with selected text | Wrap with `[[` `]]` (wikilink) |

---

## Drag-to-Select

Drag-to-select allows the user to draw a bounding box across multiple blocks to select them. This is separate from text selection within a single textarea.

### The Two-Mode Problem

The fundamental challenge: dragging within a textarea should select text (normal browser behavior), but dragging across the empty space between blocks should trigger block selection. These are two completely different interactions using the same mouse gesture.

**Solution: only activate bounding box selection on mousedown in empty space.**

```typescript
const handleMouseDown = (e: React.MouseEvent) => {
  // Only left click
  if (e.button !== 0) return;

  // Don't start if clicking on interactive elements (textarea, bullet)
  if (isPointInBlock(e.clientX, e.clientY)) return;

  // Don't interfere with text selection
  const target = e.target as HTMLElement;
  if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;

  e.preventDefault();
  setIsSelecting(true);
  collectBlockRects(); // snapshot all block positions
  selectionOps.clearSelection();
};
```

`isPointInBlock` uses `document.elementFromPoint` to check whether the click landed on a `.block-textarea` or `.block-bullet`. If so, the bounding box selection doesn't activate.

### Block Rect Collection

When selection starts, we snapshot all block positions:

```typescript
const collectBlockRects = () => {
  const blocks = container.querySelectorAll('[data-url]');
  const rects: BlockRect[] = [];

  blocks.forEach(block => {
    const url = block.getAttribute('data-url');
    // CRITICAL: measure .block-row, not the outer .block div
    const rowElement = block.querySelector('.block-row');
    const rect = (rowElement || block).getBoundingClientRect();
    rects.push({ url, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
  });

  blockRectsRef.current = rects;
};
```

**Why measure `.block-row`?** The outer `.block` div includes the entire subtree of children. If you measure it, dragging across children will also select the parent, because the parent's bounding rect encompasses everything. Measuring only the `.block-row` (which is just the bullet + textarea for that single block) gives accurate hit testing.

### Selection Box Rendering

During drag, we render a semi-transparent blue rectangle:

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

### Overlap Detection

On each mousemove, find blocks whose rects overlap the selection box:

```typescript
const getBlocksInBox = (box: SelectionBox): BlockId[] => {
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

### Global Event Listeners

Mouse move and mouse up must be attached to `window`, not the container. Otherwise, if the mouse leaves the container during drag, the selection breaks:

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

---

## Multi-Block Selection

### Selection Model

Selection uses an **anchor-focus model** borrowed from browser text selection:

```typescript
interface SelectionContext {
  anchor: BlockId | null;   // where selection started
  focus: BlockId | null;    // where selection currently ends
  selected: Set<BlockId>;   // computed set of all blocks in range
}
```

**All selections are contiguous ranges.** Non-contiguous selection (Ctrl+Click individual blocks) is intentionally not supported — it adds complexity without proportional value.

### Computing the Selected Set

Given anchor and focus, compute the contiguous range using the flattened block list (document order):

```typescript
export function computeSelectedBlocks(
  anchor: BlockId | null,
  focus: BlockId | null,
  flattenedBlocks: BlockPosition[]
): Set<BlockId> {
  if (!anchor || !focus) return new Set();

  const anchorIndex = flattenedBlocks.findIndex(b => b.url === anchor);
  const focusIndex = flattenedBlocks.findIndex(b => b.url === focus);
  if (anchorIndex === -1 || focusIndex === -1) return new Set();

  const start = Math.min(anchorIndex, focusIndex);
  const end = Math.max(anchorIndex, focusIndex);

  const selected = new Set<BlockId>();
  for (let i = start; i <= end; i++) {
    selected.add(flattenedBlocks[i].url);
  }
  return selected;
}
```

### Block Position Registry

Each block registers its position when it mounts:

```typescript
interface BlockPosition {
  url: BlockId;
  parentUrl: BlockId | null;
  indexInParent: number;
  depth: number;
}
```

The provider maintains a sorted array of these positions representing document order (depth-first traversal). This is used for range computation and for determining whether batch operations are valid.

### Selection Interactions

**Bullet click:** Select single block. With Shift: extend selection.

**Shift+Click on unselected block:** Extend range from anchor to clicked block.

**Shift+Click on selected block:** Remove that block and its descendants from selection:

```typescript
export function shiftClickBlock(
  blockUrl: BlockId,
  currentSelection: SelectionContext,
  flattenedBlocks: BlockPosition[]
): SelectionContext {
  if (currentSelection.selected.has(blockUrl)) {
    // Remove block + descendants
    const toRemove = getBlockAndDescendants(blockUrl, flattenedBlocks);
    const newSelected = new Set(
      [...currentSelection.selected].filter(url => !toRemove.has(url))
    );
    if (newSelected.size === 0) return clearSelection();
    // ... update anchor/focus
  } else {
    // Extend range from anchor
    return selectRange(currentSelection.anchor || blockUrl, blockUrl, flattenedBlocks);
  }
}
```

**Shift+Arrow keys:** Extend selection to the next/previous block.

### Batch Indent/Unindent

When multiple blocks are selected, Tab/Shift+Tab applies to all of them. Validation ensures the operation is valid for the entire selection before proceeding:

```typescript
export function canBatchIndent(
  selection: SelectionContext,
  flattenedBlocks: BlockPosition[],
  direction: 'indent' | 'unindent'
): boolean {
  const selectedBlocks = flattenedBlocks.filter(b => selection.selected.has(b.url));
  if (selectedBlocks.length === 0) return false;

  if (direction === 'indent') {
    // First selected block must have a previous sibling
    return selectedBlocks[0].indexInParent > 0;
  } else {
    // All selected blocks must have parents
    return selectedBlocks.every(b => b.parentUrl !== null && b.depth > 0);
  }
}
```

### Visual Feedback

Selected blocks get a CSS class:

```css
.block.selected > .block-row {
  background-color: rgba(66, 133, 244, 0.15);
  border-radius: 4px;
}
```

---

## Drag and Drop

### Drop Zone Calculation

Each block is divided into three vertical zones:

```typescript
export function calculateDropZone(
  mouseY: number,
  blockBounds: { top: number; bottom: number; height: number },
  parentUrl: BlockId,
  indexInParent: number
): DropZone {
  const percentage = (mouseY - blockBounds.top) / blockBounds.height;

  if (percentage < 0.25) {
    return { parentUrl, position: 'before', index: indexInParent };
  } else if (percentage > 0.75) {
    return { parentUrl, position: 'after', index: indexInParent + 1 };
  } else {
    return { parentUrl: targetBlockUrl, position: 'into', index: 0 };
  }
}
```

| Mouse Position | Zone | Visual Indicator | Result |
|---------------|------|------------------|--------|
| Top 25% | Before | Horizontal blue line above | Insert as sibling before |
| Middle 50% | Into | Blue outline around block | Insert as first child |
| Bottom 25% | After | Horizontal blue line below | Insert as sibling after |

### Validation

Blocks cannot be dropped into themselves or their descendants:

```typescript
export function isValidDrop(
  draggingUrls: BlockId[],
  targetUrl: BlockId,
  targetDescendants: Set<BlockId>
): boolean {
  if (draggingUrls.includes(targetUrl)) return false;
  for (const url of draggingUrls) {
    if (targetDescendants.has(url)) return false;
  }
  return true;
}
```

### Modifier Keys

- **Standard drag**: Move block (and all children) to new location
- **Alt/Option + drag**: Create a reference (link) instead of moving

```typescript
export function getDragMode(altKey: boolean): 'move' | 'reference' {
  return altKey ? 'reference' : 'move';
}
```

Visual feedback changes the cursor to `copy` and shows a `+` indicator when Alt is held.

### Auto-Expand on Hover

When dragging over a collapsed block, it auto-expands after 500ms so you can drop into its children:

```typescript
export function shouldExpandOnDragHover(
  isCollapsed: boolean,
  hoverDuration: number,
  expandDelay: number = 500
): boolean {
  return isCollapsed && hoverDuration >= expandDelay;
}
```

### Same-Parent Index Adjustment

When moving blocks within the same parent, removing the source blocks shifts indices. This must be accounted for:

```typescript
export function adjustDropIndexForSameParent(
  sourceIndices: number[],
  targetIndex: number
): number {
  const countBefore = sourceIndices.filter(i => i < targetIndex).length;
  return targetIndex - countBefore;
}
```

---

## Focus Management

Focus management is the trickiest part of the system. When the tree structure changes (indent, split, create sibling), blocks are destroyed and recreated in the DOM. The focus manager bridges this gap.

### Textarea Registry

Every block registers its textarea ref on mount:

```typescript
useEffect(() => {
  registerTextarea(url, textareaRef.current);
  return () => registerTextarea(url, null);
}, [url]);
```

### Pending Focus Queue

When a block is created (e.g., Enter creates a sibling), the new block doesn't exist in the DOM yet. The focus manager queues the focus request:

```typescript
focusBlock(newUrl, 'start');
// The block with newUrl hasn't mounted yet.
// When it mounts and registers its textarea, the pending focus fires.
```

### Cursor Position Preservation

For indent/unindent, the cursor position must be saved before the operation and restored after:

```typescript
// Before indent:
const savedPosition = saveCursorPosition(url); // reads selectionStart

// After indent (block remounts with new DOM position):
// When the textarea registers, restore position:
textarea.setSelectionRange(savedPosition, savedPosition);
textarea.focus();
```

### Double requestAnimationFrame

Focus is applied with two nested `requestAnimationFrame` calls for mobile compatibility:

```typescript
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(position, position);
  });
});
```

This ensures the DOM has fully settled, particularly on mobile browsers where layout may be deferred.

---

## Paste Handling

Pasted bulleted text is parsed into a tree structure and inserted as nested blocks:

```typescript
const BULLET_PATTERN = /^(\s*)(•|-|\*|\+|\d+\.)\s+(.*)$/;

export function parseBulletedText(text: string): ParsedBlock[] {
  const lines = text.split('\n');
  // ... parse indentation and bullet markers into tree
}
```

Indentation in the pasted text determines parent-child relationships. Two spaces of indentation equals one nesting level.

When pasting a block link (an automerge URL) into an empty block, the block's reference is replaced entirely. Into a non-empty block, the link is added as a child.

---

## Testing Strategies

### Unit Tests for Behavior Functions

Every behavior function has comprehensive unit tests. These are fast (no DOM, no browser) and cover all edge cases:

```typescript
describe('Enter Key Behavior', () => {
  it('creates sibling at end of text', () => {
    const ctx = createContext({ cursorPosition: 20, textLength: 20 });
    expect(getEnterAction(ctx)).toEqual({ type: 'create-sibling' });
  });

  it('splits block mid-text', () => {
    const ctx = createContext({ cursorPosition: 10, textLength: 20 });
    expect(getEnterAction(ctx)).toEqual({ type: 'split', atPosition: 10 });
  });

  it('inserts empty block above at beginning', () => {
    const ctx = createContext({ cursorPosition: 0, textLength: 20 });
    expect(getEnterAction(ctx)).toEqual({ type: 'create-sibling', content: '' });
  });

  it('creates child when parent has children', () => {
    const ctx = createContext({ cursorPosition: 20, textLength: 20, hasChildren: true });
    expect(getEnterAction(ctx)).toEqual({ type: 'create-child' });
  });

  it('creates sibling for empty block even with children', () => {
    const ctx = createContext({ cursorPosition: 0, textLength: 0, hasChildren: true });
    expect(getEnterAction(ctx).type).toBe('create-sibling');
  });
});
```

Selection tests use mock block position arrays:

```typescript
function createFlattenedBlocks(): BlockPosition[] {
  return [
    { url: 'a', parentUrl: null, indexInParent: 0, depth: 0 },
    { url: 'a1', parentUrl: 'a', indexInParent: 0, depth: 1 },
    { url: 'a2', parentUrl: 'a', indexInParent: 1, depth: 1 },
    { url: 'b', parentUrl: null, indexInParent: 1, depth: 0 },
    { url: 'b1', parentUrl: 'b', indexInParent: 0, depth: 1 },
    { url: 'c', parentUrl: null, indexInParent: 2, depth: 0 },
  ];
}

it('selects contiguous range', () => {
  const blocks = createFlattenedBlocks();
  const result = computeSelectedBlocks('a1', 'b', blocks);
  expect(result.size).toBe(3); // a1, a2, b
});
```

### E2E Tests for Browser Integration

Unit tests can't catch everything. E2E tests (Playwright) verify the full stack in a real browser:

```typescript
test('ArrowLeft at position 0 crosses to previous block', async ({ page }) => {
  await createNewNote(page, 'Arrow Test');
  await page.keyboard.type('First block');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second block');

  // Move to position 0 of second block
  await page.keyboard.press('Home');

  // Press Left — should cross to end of first block
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);

  const focused = page.locator('.block-textarea:focus');
  expect(await focused.inputValue()).toBe('First block');
  expect(await focused.evaluate(
    (el: HTMLTextAreaElement) => el.selectionStart
  )).toBe('First block'.length);
});

test('Enter splits block and focuses new block', async ({ page }) => {
  await page.keyboard.type('BEFORE|AFTER');
  await page.keyboard.press('Home');
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');

  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  const original = page.locator('.block-textarea').first();
  expect(await original.inputValue()).toBe('BEFORE|');

  const focused = page.locator('.block-textarea:focus');
  expect(await focused.inputValue()).toBe('AFTER');
});

test('Tab indents block under previous sibling', async ({ page }) => {
  await page.keyboard.type('Parent');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Child');
  await page.keyboard.press('Tab');

  const focused = page.locator('.block-textarea:focus');
  const depth = await focused.evaluate(el => {
    let d = 0;
    let node = el.parentElement;
    while (node) {
      if (node.classList.contains('children')) d++;
      node = node.parentElement;
    }
    return d;
  });
  expect(depth).toBeGreaterThan(0);
});
```

### What Unit Tests Catch vs. E2E

| Concern | Unit Tests | E2E Tests |
|---------|------------|-----------|
| Decision logic (what action to take) | Yes | — |
| Edge cases in behavior functions | Yes | — |
| Focus actually moves to correct block | — | Yes |
| Cursor position after operations | — | Yes |
| Textarea auto-resize | — | Yes |
| Drag-to-select visual behavior | — | Yes |
| Block creation renders in DOM | — | Yes |
| Cross-browser keyboard handling | — | Yes |

---

## Lessons Learned

**1. Measure `.block-row`, not `.block`.** Our most persistent drag-select bug was parent blocks being selected when only children were in the selection box. The fix: measure the row element (bullet + content) not the outer block container (which includes children).

**2. Textareas over contentEditable.** ContentEditable is seductive but treacherous. Cursor position tracking, paste handling, and cross-browser consistency are all dramatically simpler with textareas. The tradeoff (no inline rich text editing) is worth it for an outliner where structure matters more than formatting.

**3. Pure behavior functions are the best testing investment.** By extracting all decision logic into pure functions, we achieved comprehensive test coverage with fast, reliable unit tests. The browser tests catch integration issues, but the behavior tests catch logic bugs.

**4. Focus management is a state machine.** The pattern of "queue focus for a block that doesn't exist yet" is essential. Any operation that changes tree structure (Enter, Backspace merge, indent, unindent) will destroy and recreate DOM nodes. The focus manager must handle the gap.

**5. Global mouse listeners for drag operations.** Always attach mousemove and mouseup to `window` during drag. If you attach them to the container, the drag breaks when the mouse leaves the container boundary.

**6. Contiguous-only selection simplifies everything.** Supporting non-contiguous selection (Ctrl+Click) adds significant complexity to every batch operation. Contiguous ranges are simple to compute, validate, and operate on.

**7. `requestAnimationFrame` nesting for mobile.** A single rAF is not enough on mobile browsers. Two nested rAF calls ensure the DOM has fully settled before applying focus.

**8. The `{ type: 'default' }` action is load-bearing.** Most keystrokes should fall through to browser defaults. The behavior layer must explicitly opt-in to intercepting a key, never opt-out. Get this wrong and you break basic typing.
