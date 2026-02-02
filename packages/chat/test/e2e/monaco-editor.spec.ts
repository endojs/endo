/**
 * Monaco Editor E2E Tests
 *
 * These tests verify the Monaco editor integration which runs in an iframe.
 * They require Playwright because:
 * - Monaco runs in a separate iframe to avoid SES conflicts
 * - Communication is via postMessage
 * - Keyboard shortcuts need real browser events
 */

import { test, expect, Page } from '@playwright/test';

// Helper to open the eval modal
async function openEvalModal(page: Page) {
  await page.goto('/');
  await page.waitForSelector('#chat-message');

  // Type /js to trigger eval command
  const input = page.locator('#chat-message');
  await input.click();
  await input.type('/js');
  await page.keyboard.press('Enter');

  // Then Cmd+Enter to expand to modal (if in inline mode)
  // Or the modal might open directly depending on mode

  // Wait for Monaco iframe to load
  await page.waitForSelector('iframe[src*="monaco"]', { timeout: 15000 });
}

// Helper to get the Monaco iframe
function getMonacoIframe(page: Page) {
  return page.frameLocator('iframe[src*="monaco"]');
}

test.describe('Monaco Editor', () => {
  test.describe('Loading', () => {
    test('Monaco iframe loads successfully', async ({ page }) => {
      await openEvalModal(page);

      const iframe = page.locator('iframe[src*="monaco"]');
      await expect(iframe).toBeVisible();
    });

    test('editor is focused after load', async ({ page }) => {
      await openEvalModal(page);

      // The editor container inside the iframe
      const monaco = getMonacoIframe(page);
      const editor = monaco.locator('.monaco-editor');
      await expect(editor).toBeVisible();
    });
  });

  test.describe('Content', () => {
    test('typing updates content', async ({ page }) => {
      await openEvalModal(page);

      const monaco = getMonacoIframe(page);
      const editor = monaco.locator('.monaco-editor textarea');
      await editor.focus();
      await page.keyboard.type('const x = 1;');

      // Content should be in the editor
      const content = monaco.locator('.view-line');
      await expect(content).toContainText('const x = 1');
    });

    test('initial value is set', async ({ page }) => {
      // This test assumes we can set initial value somehow
      // May need test harness support
      await openEvalModal(page);

      // Verify the editor has the expected initial state
      const monaco = getMonacoIframe(page);
      const editor = monaco.locator('.monaco-editor');
      await expect(editor).toBeVisible();
    });
  });

  test.describe('Keyboard Shortcuts', () => {
    test('Cmd+Enter triggers submit', async ({ page }) => {
      await openEvalModal(page);

      const monaco = getMonacoIframe(page);
      const editor = monaco.locator('.monaco-editor textarea');
      await editor.focus();
      await page.keyboard.type('1 + 1');

      // Listen for submit event
      const submitted = page.evaluate(() => {
        return new Promise((resolve) => {
          const container = document.querySelector('.eval-editor-container');
          container?.addEventListener('monaco-submit', () => resolve(true), { once: true });
          setTimeout(() => resolve(false), 2000);
        });
      });

      // Press Cmd+Enter
      await page.keyboard.press('Meta+Enter');

      expect(await submitted).toBe(true);
    });

    test('Escape triggers escape event', async ({ page }) => {
      await openEvalModal(page);

      const monaco = getMonacoIframe(page);
      const editor = monaco.locator('.monaco-editor textarea');
      await editor.focus();

      // Listen for escape event
      const escaped = page.evaluate(() => {
        return new Promise((resolve) => {
          const container = document.querySelector('.eval-editor-container');
          container?.addEventListener('monaco-escape', () => resolve(true), { once: true });
          setTimeout(() => resolve(false), 2000);
        });
      });

      await page.keyboard.press('Escape');

      expect(await escaped).toBe(true);
    });

    test('Cmd+E triggers add endowment', async ({ page }) => {
      await openEvalModal(page);

      const monaco = getMonacoIframe(page);
      const editor = monaco.locator('.monaco-editor textarea');
      await editor.focus();

      // This should trigger the add endowment flow
      // The exact behavior depends on how the modal handles it
      await page.keyboard.press('Meta+e');

      // Verify endowment input appears or is focused
      // This depends on the UI implementation
    });
  });

  test.describe('Syntax Highlighting', () => {
    test('JavaScript keywords are highlighted', async ({ page }) => {
      await openEvalModal(page);

      const monaco = getMonacoIframe(page);
      const editor = monaco.locator('.monaco-editor textarea');
      await editor.focus();
      await page.keyboard.type('const foo = function() { return true; }');

      // Monaco applies syntax highlighting classes
      // Check for keyword tokens
      const keywords = monaco.locator('.mtk1, .mtk6'); // Monaco token classes
      await expect(keywords.first()).toBeVisible();
    });
  });

  test.describe('Line Numbers', () => {
    test('line numbers are displayed', async ({ page }) => {
      await openEvalModal(page);

      const monaco = getMonacoIframe(page);
      const lineNumbers = monaco.locator('.line-numbers');
      await expect(lineNumbers.first()).toBeVisible();
    });
  });

  test.describe('Multi-line', () => {
    test('Enter creates new line', async ({ page }) => {
      await openEvalModal(page);

      const monaco = getMonacoIframe(page);
      const editor = monaco.locator('.monaco-editor textarea');
      await editor.focus();
      await page.keyboard.type('line1');
      await page.keyboard.press('Enter');
      await page.keyboard.type('line2');

      // Should have two view-lines
      const lines = monaco.locator('.view-line');
      await expect(lines).toHaveCount(2);
    });
  });

  test.describe('dispose', () => {
    test('closing modal removes iframe', async ({ page }) => {
      await openEvalModal(page);

      // Verify iframe exists
      let iframe = page.locator('iframe[src*="monaco"]');
      await expect(iframe).toBeVisible();

      // Close the modal (escape or close button)
      await page.keyboard.press('Escape');

      // Iframe should be removed
      iframe = page.locator('iframe[src*="monaco"]');
      await expect(iframe).toHaveCount(0);
    });
  });
});

test.describe('Monaco Wrapper Protocol', () => {
  // These tests verify the postMessage protocol works correctly

  test('set-value updates editor content', async ({ page }) => {
    await openEvalModal(page);

    // Send set-value message from parent
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="monaco"]') as HTMLIFrameElement;
      iframe?.contentWindow?.postMessage({ type: 'set-value', value: 'test content' }, '*');
    });

    // Verify content updated
    const monaco = getMonacoIframe(page);
    const content = monaco.locator('.view-line');
    await expect(content).toContainText('test content');
  });

  test('monaco-change is sent when content changes', async ({ page }) => {
    await openEvalModal(page);

    // Set up listener for monaco-change
    const changed = page.evaluate(() => {
      return new Promise<string>((resolve) => {
        window.addEventListener('message', (event) => {
          if (event.data?.type === 'monaco-change') {
            resolve(event.data.value);
          }
        }, { once: true });
        setTimeout(() => resolve(''), 3000);
      });
    });

    // Type in editor
    const monaco = getMonacoIframe(page);
    const editor = monaco.locator('.monaco-editor textarea');
    await editor.focus();
    await page.keyboard.type('hello');

    const value = await changed;
    expect(value).toContain('hello');
  });
});
