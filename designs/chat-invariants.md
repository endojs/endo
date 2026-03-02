# Chat Design Invariants and Principles

| | |
|---|---|
| **Created** | 2026-03-02 |
| **Updated** | 2026-03-02 |
| **Author** | Kris Kowal (prompted) |
| **Status** | **Complete** |
| **Source** | Extracted from `packages/chat/DESIGN.md` |

## Overview

Familiar Chat is a web-based interface for interacting with the Endo daemon.
It provides a command-driven UI for managing an inventory of named values
(pet names), sending messages between peers, and evaluating JavaScript
expressions in isolated workers.

## Design Invariants

These invariants must hold across the entire UI.
Violations indicate bugs or missing features.

### 1. Modeline Completeness

**Every keyboard action available in the current state MUST be hinted in the
modeline.**

The modeline displays contextual hints showing what keyboard actions are
available.
If a keyboard shortcut works in a given state but is not shown in the modeline,
that is a bug.

### 2. Keyboard-Manual Parity

**Every keyboard-accessible action MUST have a corresponding manual
(mouse/touch) action.**

Users should never be forced to use the keyboard.
Every operation achievable via keyboard shortcuts must also be achievable
through:
- Clickable buttons
- Menu items
- Direct manipulation (drag, click)

### 3. State Visibility

**The current UI mode and available actions MUST be visually apparent.**

Users should always know:
- What mode they're in (send, selecting, inline command, etc.)
- What actions are available
- What will happen when they press Enter

### 4. Escape Consistency

**Escape MUST always return to a safer/simpler state without losing critical
data.**

- From any modal: close and return to previous state
- From command mode: return to send mode
- From autocomplete menu: close menu, preserve typed text
- Never lose unsaved work without confirmation

### 5. Progressive Complexity

**Simple tasks MUST remain simple; complexity is opt-in.**

- Sending a message: `@recipient message` + Enter
- Inspecting a value: `@name` + Enter
- Commands: `/command` reveals structured form
- Advanced eval: ⌘Enter (Ctrl+Enter on Windows/Linux) expands to full editor

### 6. Autocomplete List Navigation

**All autocomplete dropdowns MUST use the same list-navigation and paging behavior.**

- **Home** selects the first item; **End** selects the last item.
- **Page Down** moves selection down by **(visible rows − 1)** so the previous row stays visible and the user sees the list move.
- **Page Up** moves selection up by **(visible rows − 1)** so one row of overlap is preserved and motion is visible.
- Visible row count is computed from the menu container height and single-row height: `pageSize = floor(containerHeight / itemHeight)`; the step is `max(1, pageSize − 1)`.

This applies to: command selector, token autocomplete, pet name path autocomplete, pet name paths autocomplete, and inline command form edge-name dropdown.

## Design Principles

### 1. Structured Input Over Text Parsing

Commands use structured form fields rather than parsing free-form text.
Each command has a defined schema with typed fields (pet name paths, message
numbers, text, etc.).
This provides:

- Clear visual affordances for each parameter
- Field-specific autocomplete and validation
- Reduced parsing errors and ambiguity
- Easier keyboard navigation between fields

### 2. Keyboard-First Navigation

The UI prioritizes keyboard efficiency:

- `/` triggers command selection from any state
- `@` creates token references in messages and endowment fields
- Tab/Space advances between fields or completes selections
- Enter submits or inspects depending on context
- Backspace in empty fields removes chips or returns to base mode
- Arrow keys navigate autocomplete menus

### 3. Progressive Disclosure

Simple operations stay simple; complexity is revealed as needed:

- Base mode: Direct message sending with `@recipient message`
- Slash commands: Structured forms for specific operations
- Inline eval: Quick expressions with optional endowments
- Modal eval: Full editor for complex code (⌘Enter to expand)

### 4. Visual Feedback

Clear visual cues for state and context:

- Token chips: Named values appear as styled chips with `@` prefix
- Path chips: Multi-value fields show completed paths as removable chips
- Error bubbles: Positioned above the command line with speech pointer
- Message badges: Number indicators for message picking
- Mode indicators: Command label shows active command
- Modeline hints: Contextual keyboard shortcuts
- Profile indicator: Shows current profile path in header

### 5. Contextual Autocomplete

Autocomplete adapts to context:

- Pet name paths: Hierarchical completion with `.` separator
- Case-sensitive matching for precision
- Menu positioned near input field
- Tab/Space to accept suggestions
- `.` to drill down into path
- Enter to inspect (in send mode token autocomplete)
- List navigation: ↑↓ by row; Home/End first/last; Page Up/Down by (visible rows − 1) so the user sees motion (see invariant 6)

### 6. Platform-Appropriate Modifier Keys

Keyboard modifiers must be displayed using platform conventions:

- **macOS**: Use Unicode symbols: `⌘` (Command), `⌥` (Option), `⇧` (Shift), `⌃` (Control)
- **Windows/Linux**: Use text abbreviations: `Ctrl`, `Alt`, `Shift`

For example, "Cmd+Enter" should display as `⌘Enter` on Mac and `Ctrl+Enter` on Windows/Linux.
