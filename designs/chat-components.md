# Chat Component Architecture

| | |
|---|---|
| **Created** | 2026-03-02 |
| **Updated** | 2026-03-02 |
| **Author** | Kris Kowal (prompted) |
| **Status** | **Complete** |
| **Source** | Extracted from `packages/chat/DESIGN.md` |

## File Structure

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
  icon-selector.js                 # Shared icon selector (emoji grid + letter tab)

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
  monaco-wrapper.js                # Monaco editor integration (inline)

  # Message Components
  send-form.js                     # Message sending with tokens
  message-picker.js                # Message number selection
  markdown-render.js               # Markdown to DOM

  # Spaces
  spaces-gutter.js                 # Spaces sidebar with home config
  add-space-modal.js               # Add space dialog
  edit-space-modal.js              # Edit space dialog (with showName option)
  scheme-picker.js                 # Color scheme picker

  # Other
  help-modal.js                    # Help overlay
  ref-iterator.js                  # Reference iteration
  index.css                        # Styles

  # Test Configuration
  playwright.config.ts             # Playwright E2E test configuration
```

## Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| `chat.js` | Orchestrates components, manages profile navigation |
| `inbox-component.js` | Renders messages, token chips, eval proposals |
| `inventory-component.js` | Displays pet names, handles expansion |
| `chat-bar-component.js` | Command input, mode management, modeline |
| `value-component.js` | Value modal, save functionality |
| `send-form.js` | Message composition, state tracking |
| `token-autocomplete.js` | Token chip creation, autocomplete |
| `spaces-gutter.js` | Space navigation, home config, context menus |
| `icon-selector.js` | Shared emoji/letter icon selector |

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

## Security Considerations

- Monaco editor runs in sandboxed iframe
- All pet name references are resolved through daemon APIs
- No direct file system access from UI
- WebSocket connection authenticated via daemon
- Eval proposals require explicit grant from host
- Guest `evaluate` mirrors Host `evaluate`, but execution is gated by the host approval flow.
- Counter-proposal messages may include endowments the guest should not accept. The current workflow relies on user review; consider revisiting this design if it proves risky.
