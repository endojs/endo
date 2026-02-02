/**
 * Token Autocomplete E2E Tests
 *
 * These tests verify the @mention autocomplete behavior in the chat input.
 * They require Playwright because the component uses:
 * - window.getSelection() for cursor tracking
 * - Range API for text manipulation in contenteditable
 * - DOM node splitting and insertion
 */

import { test, expect, Page } from '@playwright/test';

// Helper to set up a page with mock pet names
async function setupPage(page: Page, petNames: string[] = ['alice', 'bob', 'charlie']) {
  await page.goto('/');

  // Wait for the app to initialize
  await page.waitForSelector('#chat-message');

  // Inject mock pet names into the token autocomplete
  // This requires a test harness exposed on window
  await page.evaluate((names) => {
    // @ts-expect-error - test harness
    if (window.__testHarness?.setPetNames) {
      // @ts-expect-error - test harness
      window.__testHarness.setPetNames(names);
    }
  }, petNames);
}

// Helper to get the chat input
function getChatInput(page: Page) {
  return page.locator('#chat-message');
}

// Helper to get the autocomplete menu
function getMenu(page: Page) {
  return page.locator('.token-menu');
}

test.describe('Token Autocomplete', () => {
  test.describe('Menu Visibility', () => {
    test('typing @ opens autocomplete menu', async ({ page }) => {
      await setupPage(page);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');

      const menu = getMenu(page);
      await expect(menu).toBeVisible();
    });

    test('typing @@ escapes to literal @', async ({ page }) => {
      await setupPage(page);
      const input = getChatInput(page);
      await input.click();
      await input.type('@@');

      // Menu should be hidden
      const menu = getMenu(page);
      await expect(menu).not.toBeVisible();

      // Input should contain single @
      await expect(input).toHaveText('@');
    });

    test('Escape closes menu', async ({ page }) => {
      await setupPage(page);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');

      const menu = getMenu(page);
      await expect(menu).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(menu).not.toBeVisible();
    });

    test('Backspace at @ closes menu', async ({ page }) => {
      await setupPage(page);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');

      const menu = getMenu(page);
      await expect(menu).toBeVisible();

      await page.keyboard.press('Backspace');
      await expect(menu).not.toBeVisible();
    });

    test('clicking outside closes menu', async ({ page }) => {
      await setupPage(page);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');

      const menu = getMenu(page);
      await expect(menu).toBeVisible();

      // Click somewhere else
      await page.locator('body').click({ position: { x: 10, y: 10 } });
      await expect(menu).not.toBeVisible();
    });
  });

  test.describe('Filtering', () => {
    test('typing filters suggestions', async ({ page }) => {
      await setupPage(page, ['alice', 'alfred', 'bob']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@al');

      const items = page.locator('.token-menu-item');
      // Should show alice and alfred, not bob
      await expect(items).toHaveCount(2);
      await expect(items.nth(0)).toContainText('alice');
      await expect(items.nth(1)).toContainText('alfred');
    });

    test('filter is case-insensitive', async ({ page }) => {
      await setupPage(page, ['Alice', 'bob']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@a');

      const items = page.locator('.token-menu-item');
      await expect(items).toHaveCount(1);
    });

    test('shows "No matches" when filter has no results', async ({ page }) => {
      await setupPage(page, ['alice', 'bob']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@xyz');

      const empty = page.locator('.token-menu-empty');
      await expect(empty).toContainText('No matches');
    });
  });

  test.describe('Navigation', () => {
    test('ArrowDown moves selection', async ({ page }) => {
      await setupPage(page, ['alice', 'bob', 'charlie']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');

      // First item selected initially
      let selected = page.locator('.token-menu-item.selected');
      await expect(selected).toContainText('alice');

      await page.keyboard.press('ArrowDown');
      selected = page.locator('.token-menu-item.selected');
      await expect(selected).toContainText('bob');

      await page.keyboard.press('ArrowDown');
      selected = page.locator('.token-menu-item.selected');
      await expect(selected).toContainText('charlie');
    });

    test('ArrowUp moves selection backwards', async ({ page }) => {
      await setupPage(page, ['alice', 'bob', 'charlie']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');

      await page.keyboard.press('ArrowDown'); // bob
      await page.keyboard.press('ArrowDown'); // charlie
      await page.keyboard.press('ArrowUp'); // bob

      const selected = page.locator('.token-menu-item.selected');
      await expect(selected).toContainText('bob');
    });

    test('navigation wraps around', async ({ page }) => {
      await setupPage(page, ['alice', 'bob']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');

      await page.keyboard.press('ArrowDown'); // bob
      await page.keyboard.press('ArrowDown'); // wrap to alice

      const selected = page.locator('.token-menu-item.selected');
      await expect(selected).toContainText('alice');
    });
  });

  test.describe('Selection', () => {
    test('Tab selects and inserts token', async ({ page }) => {
      await setupPage(page, ['alice']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');

      await page.keyboard.press('Tab');

      // Token should be inserted
      const token = input.locator('.chat-token');
      await expect(token).toBeVisible();
      await expect(token).toHaveAttribute('data-pet-name', 'alice');

      // Menu should be closed
      const menu = getMenu(page);
      await expect(menu).not.toBeVisible();
    });

    test('Enter selects and inserts token', async ({ page }) => {
      await setupPage(page, ['alice']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');

      await page.keyboard.press('Enter');

      const token = input.locator('.chat-token');
      await expect(token).toBeVisible();
    });

    test('Space selects and inserts token', async ({ page }) => {
      await setupPage(page, ['alice']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');

      await page.keyboard.press('Space');

      const token = input.locator('.chat-token');
      await expect(token).toBeVisible();
    });

    test('clicking suggestion inserts token', async ({ page }) => {
      await setupPage(page, ['alice', 'bob']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');

      await page.locator('.token-menu-item').filter({ hasText: 'bob' }).click();

      const token = input.locator('.chat-token');
      await expect(token).toHaveAttribute('data-pet-name', 'bob');
    });
  });

  test.describe('Edge Names', () => {
    test(': enters edge name mode', async ({ page }) => {
      await setupPage(page, ['alice']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');

      await page.keyboard.press(':');

      // Menu should close, we're now typing edge name
      const menu = getMenu(page);
      await expect(menu).not.toBeVisible();

      // Should see @alice: in the input
      await expect(input).toContainText('@alice:');
    });

    test('typing after : sets edge name', async ({ page }) => {
      await setupPage(page, ['alice']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');
      await page.keyboard.press(':');
      await input.type('mylabel');
      await page.keyboard.press('Space');

      // Token should have custom edge name
      const token = input.locator('.chat-token');
      await expect(token).toHaveAttribute('data-pet-name', 'alice');
      await expect(token).toHaveAttribute('data-edge-name', 'mylabel');
    });

    test('Enter completes edge name entry', async ({ page }) => {
      await setupPage(page, ['alice']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');
      await page.keyboard.press(':');
      await input.type('label');
      await page.keyboard.press('Enter');

      const token = input.locator('.chat-token');
      await expect(token).toHaveAttribute('data-edge-name', 'label');
    });
  });

  test.describe('Token Deletion', () => {
    test('Backspace after token deletes it', async ({ page }) => {
      await setupPage(page, ['alice']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');
      await page.keyboard.press('Tab'); // Insert token

      // Cursor should be after token, press backspace
      await page.keyboard.press('Backspace');

      // Token should be deleted
      const token = input.locator('.chat-token');
      await expect(token).toHaveCount(0);
    });
  });

  test.describe('getMessage', () => {
    test('parses single token correctly', async ({ page }) => {
      await setupPage(page, ['alice']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');
      await page.keyboard.press('Tab');
      await input.type('hello');

      // Get message via test harness
      const message = await page.evaluate(() => {
        // @ts-expect-error - test harness
        return window.__testHarness?.getMessage?.();
      });

      expect(message.petNames).toEqual(['alice']);
      expect(message.edgeNames).toEqual(['alice']);
      expect(message.strings.join('')).toContain('hello');
    });

    test('parses multiple tokens correctly', async ({ page }) => {
      await setupPage(page, ['alice', 'bob']);
      const input = getChatInput(page);
      await input.click();

      await input.type('@');
      await page.keyboard.press('Tab'); // alice
      await input.type('and ');
      await input.type('@');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab'); // bob

      const message = await page.evaluate(() => {
        // @ts-expect-error - test harness
        return window.__testHarness?.getMessage?.();
      });

      expect(message.petNames).toEqual(['alice', 'bob']);
    });

    test('parses token with edge name', async ({ page }) => {
      await setupPage(page, ['alice']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');
      await page.keyboard.press(':');
      await input.type('file');
      await page.keyboard.press('Space');

      const message = await page.evaluate(() => {
        // @ts-expect-error - test harness
        return window.__testHarness?.getMessage?.();
      });

      expect(message.petNames).toEqual(['alice']);
      expect(message.edgeNames).toEqual(['file']);
    });
  });

  test.describe('Edge Cases', () => {
    test('@ not triggered after alphanumeric', async ({ page }) => {
      await setupPage(page, ['alice']);
      const input = getChatInput(page);
      await input.click();
      await input.type('email@');

      // Menu should NOT open (email@ is like an email address)
      const menu = getMenu(page);
      await expect(menu).not.toBeVisible();
    });

    test('@ triggered after space', async ({ page }) => {
      await setupPage(page, ['alice']);
      const input = getChatInput(page);
      await input.click();
      await input.type('hello @');

      const menu = getMenu(page);
      await expect(menu).toBeVisible();
    });

    test('menu hint is displayed', async ({ page }) => {
      await setupPage(page, ['alice']);
      const input = getChatInput(page);
      await input.click();
      await input.type('@');

      const hint = page.locator('.token-menu-hint');
      await expect(hint).toBeVisible();
      await expect(hint).toContainText('navigate');
      await expect(hint).toContainText('Esc');
    });
  });
});
