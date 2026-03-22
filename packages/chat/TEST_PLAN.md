# Test Plan for packages/chat

This document outlines the testing strategy for the Familiar Chat application.

## 1. Unit Tests (Pure Functions)

Extract and test pure logic that doesn't require DOM manipulation.

### Target Functions

- **`relativeTime(date)`** - Time delta formatting
  - Returns "just now" for < 60 seconds
  - Returns "Xm ago" for < 60 minutes
  - Returns "Xh ago" for < 24 hours
  - Returns "Xd ago" for < 7 days
  - Returns empty string for >= 7 days

- **`appendTextWithBreaks($parent, text)`** - Newline to `<br>` conversion
  - Single line: no `<br>` added
  - Multiple lines: `<br>` between each
  - Empty lines preserved
  - HTML entities escaped

- **`parseMessage()` in `message-parse.js`** - Token extraction
  - Plain text returns single string
  - `@token` extracts pet name
  - `@petName:edgeName` extracts both
  - Multiple tokens in sequence
  - Escaped `@@` produces literal `@`

### Framework

Use existing ava setup with `@endo/ses-ava`.

## 2. DOM Component Tests

Test DOM manipulation components with jsdom or happy-dom.

### Token Autocomplete Component

- Typing `@` opens menu
- Filtering narrows results as user types
- Arrow keys navigate menu items
- Enter/Tab selects highlighted item
- Escape closes menu
- Colon (`:`) triggers edge name entry mode
- Space injected after token completion
- Punctuation removes preceding space
- Menu closes when clicking outside

### Timestamp Tooltip

- Hover over timestamp shows tooltip
- Tooltip positioned at top of message
- Click on line copies to clipboard
- Checkmark shown after successful copy
- Copy icon visible on line hover

### Message Rendering

- Sent messages have blue background
- Received messages show sender name
- Token hover shows adoption popup
- Newlines converted to `<br>` in message body
- Flexbox layout keeps timestamp in column

## 3. Integration Tests

Mock `E(powers)` interface and test full component flows.

### Mock Powers Factory

```javascript
const createMockPowers = (overrides = {}) => ({
  followMessages: async function* () {},
  followNameChanges: async function* () {},
  identify: async () => 'test-id',
  reverseIdentify: async () => 'test-name',
  send: async () => {},
  adopt: async () => {},
  dismiss: async () => {},
  reject: async () => {},
  resolve: async () => {},
  ...overrides,
});
```

### Test Scenarios

**Send Message Flow**
- Type `@recipient hello world`
- Press Enter or click Send
- Verify `send()` called with correct arguments
- Verify input cleared on success
- Verify error displayed on failure

**Send with Multiple Tokens**
- Type `@alice please meet @bob`
- Verify message strings and pet names extracted correctly
- Verify edge names default to pet names

**Adopt Value Flow**
- Render message with adoptable token
- Hover over token to show popup
- Enter pet name and click Adopt
- Verify `adopt()` called with message number, edge name, pet name

**Dismiss Message Flow**
- Render message with dismiss button
- Click Dismiss
- Verify `dismiss()` called
- Verify message removed from DOM

**Error Handling**
- Send without recipient token shows error
- Failed send displays error message
- Failed adopt displays error on message

## 4. E2E Tests (Playwright)

Full browser tests against a test daemon instance.

### Setup

- Start test daemon with known state
- Create test guest with predictable pet names
- Navigate to chat UI

### Scenarios

**Basic Load**
- Chat UI renders without errors
- Command line is focused
- Pet names load in autocomplete

**Send to Self**
- Type `@SELF hello`
- Press Enter
- Message appears in transcript
- Message styled as sent (blue)

**Receive Message**
- Send message from another guest
- Message appears in transcript
- Message styled as received (sender shown)
- Adoption controls work

**Token Autocomplete E2E**
- Type `@` and verify menu appears
- Type partial name and verify filtering
- Use arrow keys and Enter to select
- Verify token inserted with space

**Keyboard Navigation**
- Tab through interactive elements
- Enter submits from command line
- Escape closes menus

## 5. File Structure

```
packages/chat/
  src/
    chat.js
    message-parse.js
    ...
  test/
    unit/
      relative-time.test.js
      message-parse.test.js
    component/
      token-autocomplete.test.js
      timestamp-tooltip.test.js
      message-render.test.js
    integration/
      chat-bar.test.js
      inbox.test.js
    e2e/
      chat.e2e.test.js
    fixtures/
      mock-powers.js
      test-messages.js
```

## 6. Implementation Phases

### Phase 1: Unit Test Foundation
- Extract pure functions to testable modules
- Add unit tests for `relativeTime`, `parseMessage`
- Ensure tests run in SES environment

### Phase 2: Component Test Infrastructure
- Set up jsdom/happy-dom environment
- Create mock powers factory
- Add tests for token autocomplete

### Phase 3: Integration Tests
- Test `chatBarComponent` with mocks
- Test `inboxComponent` message rendering
- Cover error paths

### Phase 4: E2E Tests (Optional)
- Playwright setup
- Test daemon fixture
- Critical path coverage

## 7. Future Considerations

- **Timezone display**: When sender timezone is added to messages, test that both timezones display when they differ
- **Accessibility**: Add tests for screen reader compatibility, ARIA attributes
- **Performance**: Test with large message volumes
- **Offline behavior**: Test reconnection and message sync
