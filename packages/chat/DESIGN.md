# Familiar Chat UI Design

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
- Advanced eval: Cmd+Enter expands to full editor

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
- Modal eval: Full editor for complex code (Cmd+Enter to expand)

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

## Command Bar States and Modeline

The command bar is the primary input area.
It transitions between distinct modes, each with specific keyboard behaviors
documented in the modeline.

### State: Empty (Send Mode)

**Visual**: Empty input field, placeholder text visible

**Modeline**:
- `@ inspect or message` - Type @ to start token entry
- `/ commands` - Type / to open command menu
- `Space continue with @{lastRecipient}` - (only if previous recipient exists)

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| `@` | Begin token autocomplete | Click token button (if exists) |
| `/` | Open command menu | Click menu button |
| `Space` | Insert last recipient (if any) | N/A - convenience shortcut |

### State: Token Autocomplete Visible

**Visual**: Autocomplete menu showing matching pet names

**Modeline**:
- `select reference` - Currently selecting a reference
- `Space chat` - Complete token and continue typing message
- `Enter inspect` - Complete token and inspect the value
- `↑↓ navigate` - Arrow keys to select different match

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| `↑` / `↓` | Navigate suggestions | Click on suggestion |
| `Space` / `Tab` | Complete token, add space, continue typing | Click suggestion |
| `Enter` | Complete token and inspect value | Double-click suggestion |
| `:` | Enter edge name mode | N/A - keyboard shortcut |
| `Escape` | Close menu | Click outside menu |
| `Backspace` | Delete character / close if at trigger | N/A |

### State: Token Only (Chip Present, No Message)

**Visual**: Single token chip in input, cursor after it

**Modeline**:
- `Enter inspect or write message` - Dual purpose based on content
- `⌫ delete chip` - Backspace removes the chip

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| `Enter` | Inspect the referenced value | Click chip |
| `Backspace` | Delete the chip | Click × on chip (if visible) |
| Any text | Begin composing message | Type directly |

### State: Token + Message Text

**Visual**: Token chip followed by message text

**Modeline**:
- `Enter send` - Send message to recipient
- `@ embed reference` - Add another token
- `⌫ delete chip` - Backspace at chip boundary deletes it

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| `Enter` | Send message | Click Send button |
| `@` | Begin another token | N/A - keyboard shortcut |
| `Backspace` (at chip) | Delete chip | Click × on chip |

### State: Text Only (No Token)

**Visual**: Text in input but no token chip

**Modeline**:
- `@ add recipient to send` - Need recipient to send

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| `@` | Begin token autocomplete | N/A |

### State: Command Selecting (After `/`)

**Visual**: Command menu visible with filtered options

**Modeline**:
- `type command name` - Filter by typing
- `Enter select` - Select highlighted command
- `Esc cancel` - Return to send mode

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| Type | Filter commands | N/A |
| `↑` / `↓` | Navigate commands | Hover over command |
| `Enter` / `Tab` / `Space` | Select command | Click command |
| `Escape` | Cancel, return to send | Click outside menu |

### State: Inline Command Form

**Visual**: Command form with labeled fields

**Modeline** (varies by command, example for general):
- `Enter submit` - Execute the command
- `Tab next field` - Move to next field
- `Esc cancel` - Return to send mode

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| `Tab` | Next field | Click field |
| `Shift+Tab` | Previous field | Click field |
| `Enter` | Submit form | Click Execute button |
| `Escape` | Cancel command | Click × button |

### State: Eval Command (Inline)

**Modeline**:
- `@ add endowment` - Add a binding
- `Enter evaluate` - Run the code
- `Cmd+Enter expand to editor` - Open modal editor
- `Esc cancel` - Return to send mode

## Value Modal

The value modal displays inspected values and allows saving them with pet
names.

### Value States

| State | Title Display | Description |
|-------|---------------|-------------|
| Has ID + pet names | `@foo @bar` (blue chips) | Value retained in store with names |
| Has ID + no pet names | `(unnamed)` | Value retained but not named |
| Has message context | `#42:attachment` (gray chip) | Value from inbox message |
| Ephemeral (no ID) | `Ephemeral Value` | Transient value (e.g., from `/list`) |

A value can show BOTH message context chip AND pet name chips if applicable.

### Modal Actions

| Action | Keyboard | Manual |
|--------|----------|--------|
| Close | `Escape` | Click × or backdrop |
| Save | `Enter` (in name field) | Click Save button |
| Enter Profile | N/A | Click "Enter Profile" (for host types) |

## Field Types

The command system supports several field types, each with specialized
rendering and behavior:

| Type | Description | UI Component |
|------|-------------|--------------|
| `petNamePath` | Single hierarchical path (e.g., `dir.subdir.name`) | Text input with autocomplete |
| `petNamePaths` | Multiple paths | Chip container with autocomplete |
| `messageNumber` | Reference to a message | Number input with message picker |
| `text` | Free-form text | Plain text input |
| `edgeName` | Edge name from a message | Text input with autocomplete |
| `locator` | Endo locator URL | Text input |
| `source` | JavaScript source code | Monaco editor (inline or modal) |
| `endowments` | Pet name to identifier bindings | Specialized chip + binding UI |

### Pet Name Path Autocomplete

For single-path fields (`petNamePath`):

- Type to filter suggestions from current level
- `.` accepts selection and drills into it
- Tab/Enter accepts selection
- Escape closes menu

### Multi-Path Chip Input

For multi-value fields (`petNamePaths`), completed paths become visual chips:

```
┌─────────────────────────────────────────────────────────────┐
│ [path.to.first ×] [second-name ×] [third.path| ]            │
└─────────────────────────────────────────────────────────────┘
```

Keyboard behavior:
- `.` accepts current suggestion, creates chip, continues drilling into it
- Space accepts current suggestion, creates chip, starts fresh path
- Enter accepts current input and submits the form
- Backspace (on empty input) removes the last chip
- Arrow keys navigate suggestions

## Component Architecture

### File Structure

```
packages/chat/
  # Core Components
  chat.js                          # Main entry, UI orchestrator
  main.js                          # Application bootstrap
  connection.js                    # WebSocket connection to daemon

  # UI Components (extracted from chat.js)
  inbox-component.js               # Message display with tokens
  inventory-component.js           # Pet name listing panel
  chat-bar-component.js            # Command input and execution
  value-component.js               # Value inspection modal

  # Shared Utilities
  value-render.js                  # Value rendering to DOM
  time-formatters.js               # Date/time formatting

  # Command System
  command-registry.js              # Command definitions and field types
  command-selector.js              # Slash command menu
  command-executor.js              # Command execution logic
  inline-command-form.js           # Dynamic form rendering

  # Autocomplete Components
  token-autocomplete.js            # Token chip autocomplete for send mode
  petname-path-autocomplete.js     # Single path autocomplete
  petname-paths-autocomplete.js    # Multi-path chip autocomplete

  # Eval Components
  inline-eval.js                   # Inline eval form
  eval-form.js                     # Modal eval editor
  counter-proposal-form.js         # Counter-proposal editor
  monaco-wrapper.js                # Monaco editor integration
  monaco-iframe-main.js            # Monaco editor bootstrap

  # Message Components
  send-form.js                     # Message sending with tokens
  message-picker.js                # Message number selection
  markdown-render.js               # Markdown to DOM

  # Other
  help-modal.js                    # Help overlay
  ref-iterator.js                  # Reference iteration
  index.css                        # Styles
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| `chat.js` | Orchestrates components, manages profile navigation |
| `inbox-component.js` | Renders messages, token chips, eval proposals |
| `inventory-component.js` | Displays pet names, handles expansion |
| `chat-bar-component.js` | Command input, mode management, modeline |
| `value-component.js` | Value modal, save functionality |
| `send-form.js` | Message composition, state tracking |
| `token-autocomplete.js` | Token chip creation, autocomplete |

## Inventory Panel

The inventory displays named values with contextual actions:

- Disclosure triangle to expand directories
- Click name to inspect value
- × button to remove (disabled for SPECIAL names)
- SPECIAL toggle to show/hide system names

### Expansion Behavior

Directories (values with `followNameChanges`) can be expanded:
- Click disclosure triangle to expand/collapse
- Nested items use wrapped powers for correct paths
- Collapse cleans up subscriptions

## Message Display

Messages in the inbox show:

### Package Messages
- Sender chip (`@name`)
- Markdown-rendered content
- Token chips for embedded values (clickable to inspect)

### Eval Proposal Messages
- Proposer chip
- Source code in syntax-highlighted fence
- Endowments mapping (codeName ← @petName)
- Action buttons: Grant, Counter-proposal, Reject

### Request Messages
- Description text
- Resolve/Reject inputs
- Status after settlement

## Profile System

Users can navigate between host profiles:

- Profile path shown in breadcrumb bar
- `/enter` command to enter a host as current profile
- `/exit` command to return to parent profile
- Each profile has its own inventory view
- Breadcrumbs are clickable to navigate up

## Error Handling

- Command mode: Red bubble above command row
- Send mode: Red bubble above input field
- Both use speech pointer indicating source
- Errors clear on next input

## CSS Variables

The UI uses CSS custom properties for theming:

- `--accent-primary`: Primary action color
- `--accent-light`: Light accent for backgrounds
- `--text-primary`, `--text-muted`: Text colors
- `--bg-primary`, `--bg-secondary`: Background colors
- `--border-color`, `--border-light`: Border colors
- `--radius-sm`, `--radius-md`, `--radius-lg`: Border radii
- `--shadow-sm`, `--shadow-md`, `--shadow-lg`: Box shadows
- `--transition-fast`: Animation timing
- `--sidebar-width`: Inventory panel width (resizable)

## Command Categories

| Category | Commands | Description |
|----------|----------|-------------|
| Messaging | request, dismiss, adopt, resolve, reject | Peer communication |
| Execution | js (eval) | JavaScript evaluation |
| Storage | list (ls), show, remove (rm), move (mv), copy (cp), mkdir | Inventory management |
| Connections | invite, accept | Peer connections |
| Workers | spawn | Worker management |
| Agents | mkhost (host), mkguest (guest) | Profile creation |
| Profile | enter, exit | Profile navigation |
| Bundles | mkbundle, mkplugin | Module instantiation |
| System | cancel, help | System operations |

Parentheses indicate aliases.

## Security Considerations

- Monaco editor runs in sandboxed iframe
- All pet name references are resolved through daemon APIs
- No direct file system access from UI
- WebSocket connection authenticated via daemon
- Eval proposals require explicit grant from host

## Known Gaps and TODOs

This section tracks known violations of design invariants or missing features.

### Modeline Implementation Notes

The modeline at the bottom of the chat bar shows the overall command bar state.
Additionally, autocomplete dropdown menus contain their own inline hints
specific to menu navigation:

- **Token autocomplete**: `↑↓ navigate · Tab/Enter select · : add label ·
  Esc cancel`
- **Pet name path autocomplete**: `↑↓ navigate · Tab select · . drill down ·
  Esc cancel`
- **Pet name paths autocomplete**: `↑↓ navigate · . drill down · Space add ·
  Enter submit · Esc cancel`

These inline hints complement, rather than duplicate, the modeline.

### Modeline Gaps
- [ ] Verify all inline command forms show appropriate modeline hints
- [ ] Verify eval form modeline is complete

### Keyboard-Manual Parity Gaps
- [ ] Space to insert last recipient has no manual equivalent (acceptable
  convenience)
- [ ] Edge name entry (`:`) has no manual equivalent

### Other
- [ ] Command history (up/down arrow) not yet implemented
- [ ] Chip × button not always visible for deletion
