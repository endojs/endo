# End-to-End Tests with Playwright

This directory contains Playwright tests for behaviors that require a real browser environment.

## Why Playwright?

Some chat UI behaviors cannot be tested with happy-dom because they depend on:

1. **Selection API** - `window.getSelection()`, `Range` manipulation for contenteditable
2. **Iframe communication** - Monaco editor runs in an isolated iframe
3. **Full CSS layout** - Some interactions depend on element positioning

## Test Categories

### Token Autocomplete (`token-autocomplete.spec.ts`)

Tests the `@mention` autocomplete in contenteditable input:

- Typing `@` opens the autocomplete menu
- Filtering suggestions as you type
- Arrow key navigation through suggestions
- Tab/Enter/Space selects and inserts token
- `:` enters edge name mode (e.g., `@label:petname`)
- Escape closes menu
- Backspace at `@` closes menu
- `@@` escape sequence for literal `@`
- `getMessage()` correctly parses multiple tokens
- Deleting tokens with Backspace

### Monaco Editor (`monaco-editor.spec.ts`)

Tests the Monaco editor integration:

- Editor loads in iframe
- getValue/setValue work correctly
- Cmd+Enter triggers submit
- Cmd+E triggers add endowment
- Escape triggers escape event
- Content changes trigger onChange

## Setup

```bash
# Install Playwright browsers (one-time)
npx playwright install

# Run e2e tests
yarn test:e2e
```

## Writing Tests

Tests use Playwright's test runner. Example:

```typescript
import { test, expect } from '@playwright/test';

test('typing @ opens autocomplete menu', async ({ page }) => {
  await page.goto('/');

  // Focus the chat input
  const input = page.locator('#chat-message');
  await input.click();

  // Type @
  await input.type('@');

  // Menu should appear
  const menu = page.locator('.token-menu');
  await expect(menu).toBeVisible();
});
```

## Running Against Dev Server

Tests expect the chat dev server running:

```bash
# Terminal 1: Start dev server
yarn dev

# Terminal 2: Run e2e tests
yarn test:e2e
```

Or use Playwright's webServer config to auto-start.

## Test Isolation

Each test should:
1. Navigate to a fresh page
2. Set up necessary mock data via the test harness
3. Clean up after itself

## Mock Data

The test harness exposes methods to:
- Set up mock pet names for autocomplete
- Simulate daemon responses
- Inject test values

See `test-harness.ts` for the test utilities.
