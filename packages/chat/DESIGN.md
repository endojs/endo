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
- Tab/Space advance between fields
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
- Error bubbles: Positioned above the command line with speech pointer
- Message badges: Number indicators for message picking
- Mode indicators: Command label shows active command
- Modeline hints: Contextual keyboard shortcuts

### 5. Contextual Autocomplete

Autocomplete adapts to context:

- Pet name paths: Hierarchical completion with `.` separator
- Case-sensitive matching for precision
- Menu positioned near input field
- Tab/Space/Enter to accept suggestions

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

### Message Picker

When selecting message numbers:

- All messages show number badges (top-left, white on black)
- Click to select, highlighted messages show selection
- Number populates the message number field

### Error Display

- Command mode: Red bubble above command row
- Send mode: Red bubble above input field
- Both use speech pointer indicating source

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

- **Messaging**: request, dismiss, adopt, resolve, reject
- **Execution**: eval
- **Storage**: list, show, remove, move, copy, mkdir
- **Connections**: invite, accept
- **Workers**: spawn
- **Agents**: host, guest
- **Bundles**: mkbundle, mkplugin
- **System**: cancel, info, help

Some commands have aliases: `ls` (list), `rm` (remove), `mv` (move), `cp` (copy)

## Future Considerations

- Command history with IndexedDB persistence
- Monaco editor integration for modal eval
- Markdown formatting in messages
- Syntax highlighting in code blocks
- Dark mode theme support
