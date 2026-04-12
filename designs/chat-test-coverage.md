# Chat Test Coverage

| | |
|---|---|
| **Created** | 2026-03-02 |
| **Updated** | 2026-03-02 |
| **Author** | Kris Kowal (prompted) |
| **Status** | **Complete** |
| **Source** | Extracted from `packages/chat/DESIGN.md` |

## Test Organization

The chat package has unit and component tests using AVA and happy-dom.
Tests are organized by type:

```
test/
  index.test.js              # Infrastructure verification
  helpers/
    mock-powers.js           # Mock daemon powers for testing
    mock-powers.test.js      # Tests for the mock itself
    dom-setup.js             # happy-dom setup utilities
    keyboard-events.js       # Keyboard event simulation
  unit/
    command-registry.test.js # Command definitions and utilities
    command-executor.test.js # Command execution logic
    message-parse.test.js    # Message parsing for @references
    ref-iterator.test.js     # Remote async iterator wrapper
    time-formatters.test.js  # Date/time formatting
    markdown-render.test.js  # Markdown parsing and rendering
    value-render.test.js     # Value rendering and type inference
  component/
    send-form.test.js        # Send form component state
    petname-path-autocomplete.test.js  # Single path autocomplete
    petname-paths-autocomplete.test.js # Multi-path chip autocomplete
    inline-command-form.test.js        # Inline command form rendering
    monaco-wrapper.test.js             # Monaco postMessage protocol docs
    form-request-inbox.test.js         # Form-request message workflow
    spaces-gutter-home.test.js         # Home space config, context menu, modal
  e2e/                       # Playwright tests (requires real browser)
    README.md                # E2E test documentation
    token-autocomplete.spec.ts  # Token @mention autocomplete
    monaco-editor.spec.ts       # Monaco editor integration
```

## Testing Approach

**Mock Powers**: The `makeMockPowers()` function creates a `Far()` remotable that
simulates the daemon's powers interface.
It tracks method calls, supports async iteration, and can be configured with
initial names, values, and IDs.

**DOM Testing**: happy-dom provides a lightweight DOM implementation.
Global setup is done BEFORE importing chat modules because they reference DOM
globals at module load time.

## Untestable Behaviors (Require Full Browser)

Some behaviors cannot be tested with happy-dom due to Selection API limitations:

- **Token autocomplete in contenteditable**: Typing `@`, filtering suggestions,
  arrow navigation, and Escape to close menu all require the browser's Selection
  API for cursor positioning in contenteditable elements.
- **Monaco editor integration**: Runs in an iframe with cross-window messaging.
- **WebSocket connection**: Requires actual or mock server.

These behaviors require Playwright for proper E2E testing.

## E2E Tests (Playwright)

End-to-end tests using Playwright are in `test/e2e/`:

```
test/e2e/
  README.md                    # Documentation for e2e test approach
  token-autocomplete.spec.ts   # Token @mention autocomplete tests
  monaco-editor.spec.ts        # Monaco editor integration tests
```

**Token Autocomplete Tests** cover:
- Menu visibility (`@` opens menu, `@@` escapes, Escape/Backspace closes)
- Filtering (case-insensitive, "No matches" display)
- Navigation (ArrowUp/Down, wrap-around)
- Selection (Tab, Enter, Space, click)
- Edge names (`:` enters mode, typing edge name)
- Token deletion (Backspace after token)
- getMessage parsing (single/multiple tokens, edge names)
- Edge cases (`@` not triggered after alphanumeric)

**Monaco Editor Tests** cover:
- Loading (iframe loads, editor focused)
- Content (typing updates, initial value)
- Keyboard shortcuts (Cmd+Enter submit, Escape, Cmd+E add endowment)
- Syntax highlighting, line numbers, multi-line
- dispose removes iframe
- postMessage protocol tests

**Component Tests (happy-dom)** include `monaco-wrapper.test.js` which documents
the postMessage protocol without requiring a browser.

## Test Count by Module

| Module | Tests | Coverage |
|--------|-------|----------|
| command-registry | 16 | Complete - all utilities |
| command-executor | 32 | Complete - all 20+ commands |
| message-parse | 20 | Complete - parsing edge cases |
| ref-iterator | 8 | Complete - async iteration |
| time-formatters | 16 | Complete - formatting utilities |
| markdown-render | 27 | Complete - parsing and rendering |
| value-render | 36 | Complete - all pass-style types |
| mock-powers | 10 | Complete - mock verification |
| send-form | 4 | Partial - state management only |
| petname-path-autocomplete | 17 | Complete - API, navigation, selection |
| petname-paths-autocomplete | 20 | Complete - chips, callbacks, navigation |
| inline-command-form | 24 | Complete - rendering, validation, submission |
| monaco-wrapper | 1 | Protocol documentation (skipped tests document API) |
| form-request-inbox | 3 | Complete - form rendering, submission, settlement |
| spaces-gutter-home | 5 | Complete - context menu, modal, config persistence |
| **Unit/Component Total** | **244** | |

## E2E Test Count (Playwright)

| Spec File | Tests | Coverage |
|-----------|-------|----------|
| token-autocomplete.spec.ts | 25 | Menu, filtering, navigation, selection, edge names |
| monaco-editor.spec.ts | 14 | Loading, content, shortcuts, protocol |
| **E2E Total** | **39** | |
