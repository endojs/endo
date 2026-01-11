# Familiar Chat UI Design

## Overview

Familiar Chat is a web-based interface for interacting with the Endo daemon. It provides a command-driven UI for managing an inventory of named values (pet names), sending messages between peers, and evaluating JavaScript expressions in isolated workers.

## Design Principles

### 1. Structured Input Over Text Parsing

Commands use structured form fields rather than parsing free-form text. Each command has a defined schema with typed fields (pet name paths, message numbers, text, etc.). This provides:

- Clear visual affordances for each parameter
- Field-specific autocomplete and validation
- Reduced parsing errors and ambiguity
- Easier keyboard navigation between fields

### 2. Keyboard-First Navigation

The UI prioritizes keyboard efficiency:

- `/` triggers command selection from any state
- `@` creates token references in messages and endowment fields
- Tab advances between fields
- Enter submits, Escape cancels
- Backspace in empty first field returns to base mode
- Arrow keys navigate autocomplete menus and command history

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
- Tab to accept suggestions
- `.` to drill down into path
- Space to accept and start new value (multi-value fields)

## Field Types

The command system supports several field types, each with specialized rendering and behavior:

| Type | Description | UI Component |
|------|-------------|--------------|
| `petNamePath` | Single hierarchical path (e.g., `dir.subdir.name`) | Text input with autocomplete |
| `petNamePaths` | Multiple paths | Chip container with autocomplete |
| `messageNumber` | Reference to a message | Number input with message picker |
| `text` | Free-form text | Plain text input |
| `edgeName` | Edge name from a message | Text input |
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

This design allows efficient entry of multiple paths while maintaining autocomplete for each.

## Component Architecture

### Command Bar States

```
send (base mode)
  |-- "/" at start --> selecting
  |-- "@" --> token autocomplete

selecting (command menu visible)
  |-- select command --> inline form
  |-- Escape --> send

inline form (command-specific fields)
  |-- Enter --> execute
  |-- Escape --> send
  |-- Backspace (empty first field) --> send

eval form (inline or modal)
  |-- "@" --> create endowment
  |-- Cmd+Enter --> expand to modal
  |-- Enter --> evaluate
```

### Endowment Fields (Eval Command)

Endowments bind pet names to JavaScript identifiers:

```
[@petName] → codeName
```

- Pet name in chip (with autocomplete)
- Arrow separator
- Code name in monospace (auto-inferred from pet name)
- Kebab-case converts to camelCase automatically
- `=` key allows manual codeName override

### Monaco Editor Integration

The eval command uses Monaco editor for JavaScript editing:

- Lazy-loaded to minimize initial bundle size
- Sandboxed in iframe for security isolation
- Inline mode: Single-line with expand capability
- Modal mode: Full multi-line editor (Cmd+Enter to expand)
- Syntax highlighting and basic IntelliSense

### Message Picker

When selecting message numbers:

- All messages show number badges (top-left, white on black)
- Click to select, highlighted messages show selection
- Number populates the message number field

### Error Display

- Command mode: Red bubble above command row
- Send mode: Red bubble above input field
- Both use speech pointer indicating source

### Inventory Column

The inventory displays named values with contextual actions:

- Name and type indicator for each entry
- Dismiss button (×) always visible on hover
- Menu button (⋯) reveals additional actions:
  - Enter: Switch to this profile (for hosts)
  - View: Show the value details

### Profile System

Users can navigate between host profiles:

- Profile path shown in header (e.g., `SELF > my-host > sub-host`)
- `/enter` command to enter a host as current profile
- `/exit` command to return to parent profile
- Each profile has its own inventory view

### Smart Defaults

Some commands auto-populate related fields:

- `mkhost` and `mkguest`: Entering a handle name auto-populates the agent name as `profile-for-{handleName}`
- This can be overridden by manually editing the agent name field

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

## Command History

Commands are persisted to IndexedDB for history navigation:

- Up Arrow: Navigate to previous command
- Down Arrow: Navigate to next command (during history nav)
- History entries restore the full form state
- Current unsaved form is preserved during navigation

## File Structure

```
packages/chat/src/
  chat.js                          # Main entry, UI orchestrator
  main.js                          # Application bootstrap
  connection.js                    # WebSocket connection to daemon

  # Command System
  command-registry.js              # Command definitions and field types
  command-selector.js              # Slash command menu
  command-executor.js              # Command execution logic
  inline-command-form.js           # Dynamic form rendering

  # Autocomplete Components
  petname-path-autocomplete.js     # Single path autocomplete
  petname-paths-autocomplete.js    # Multi-path chip autocomplete

  # Eval Components
  inline-eval.js                   # Inline eval form
  eval-modal.js                    # Modal eval editor
  monaco-iframe-main.js            # Monaco editor bootstrap

  # Utilities
  message-parse.js                 # Message tokenization
  ref-iterator.js                  # Reference iteration
  markdown-render.js               # Markdown to DOM
```

## Security Considerations

- Monaco editor runs in sandboxed iframe
- All pet name references are resolved through daemon APIs
- No direct file system access from UI
- WebSocket connection authenticated via daemon
