/**
 * Formula Inspector E2E Tests
 *
 * These tests verify the Value modal's back-face Formula view, the F
 * flip key, the modal-header gear icon, the Backspace pop, and the
 * Escape consistency. They require Playwright because the card-flip
 * transform and the focus-management behavior depend on the real CSS
 * engine.
 *
 * Note: the inventory-row gear icon was removed — it was redundant with
 * the modal-header gear and made the row too busy. The only entry
 * points to the Formula back face are now the modal-header gear button
 * (`#value-flip-to-formula`) and the `F` accelerator.
 *
 * Like the sibling e2e specs, this file presumes a test harness on
 * window.__testHarness that injects fixture pet names and a synthetic
 * EndoHost. The harness is built incrementally; the cases below are
 * the contract these tests will cover once the harness lands.
 *
 * See designs/formula-inspector.md "Test Plan".
 */
// @ts-nocheck - E2E test with browser globals

import { test, expect, type Page } from '@playwright/test';

const setupHarness = async (page: Page) => {
  await page.goto('/');
  await page.waitForSelector('#chat-message');
  await page.evaluate(() => {
    // eslint-disable-next-line no-underscore-dangle
    const harness = window.__testHarness;
    if (harness?.setFixture) {
      harness.setFixture({
        names: [
          { name: 'my-eval', type: 'eval', id: 'eval-id-1' },
          { name: 'my-worker', type: 'worker', id: 'worker-id-1' },
          { name: 'my-key', type: 'keypair', id: 'kp-id-1' },
        ],
        formulas: {
          'eval-id-1': {
            type: 'eval',
            number: 'eval-id-1',
            properties: {
              source: { kind: 'literal', value: '1 + 1' },
              worker: { kind: 'reference', identifier: 'worker-id-1' },
              endowments: { kind: 'reference-list', entries: {} },
            },
          },
          'worker-id-1': {
            type: 'worker',
            number: 'worker-id-1',
            properties: {},
          },
          'kp-id-1': {
            type: 'keypair',
            number: 'kp-id-1',
            properties: {
              publicKey: { kind: 'literal', value: '0xPUBLIC' },
              privateKey: { kind: 'literal', value: '0xSECRET' },
            },
          },
        },
      });
    }
  });
};

test.describe('Formula Inspector (Value modal back face)', () => {
  test.fixme('F flips the modal from front face to Formula back face', async ({
    page,
  }) => {
    await setupHarness(page);
    // Click an inventory row to open the modal on the front face.
    await page.locator('.pet-item-row >> text=my-eval').click();
    await expect(page.locator('#value-window')).toBeVisible();
    await expect(page.locator('#value-window')).not.toHaveClass(/flipped/);

    // Press F.
    await page.keyboard.press('f');
    await expect(page.locator('#value-window')).toHaveClass(/flipped/);
    // The back face names the type once via its human-facing title; the
    // redundant raw-type chip has been removed.
    await expect(page.locator('#formula-view-title')).toHaveText('Evaluation');
  });

  test.fixme('modal-header gear button flips to the Formula back face', async ({
    page,
  }) => {
    await setupHarness(page);
    // Open the modal on the front face, then click the header gear.
    await page.locator('.pet-item-row >> text=my-eval').click();
    await expect(page.locator('#value-window')).not.toHaveClass(/flipped/);
    await page.locator('#value-flip-to-formula').click();
    await expect(page.locator('#value-window')).toHaveClass(/flipped/);
  });

  test.fixme('clicking a reference button opens that value and Backspace returns', async ({
    page,
  }) => {
    await setupHarness(page);
    await page.locator('.pet-item-row >> text=my-eval').click();
    await page.keyboard.press('f');
    // Click the worker reference button (labels are humanized: "Worker").
    await page.locator('.formula-view-reference >> text=Worker').click();
    // The modal lands on the front face for the worker.
    await expect(page.locator('#value-window')).not.toHaveClass(/flipped/);

    // Backspace on the back face (flip back first) returns to eval.
    await page.keyboard.press('f');
    await page.keyboard.press('Backspace');
    await expect(page.locator('#value-window')).not.toHaveClass(/flipped/);
  });

  test.fixme('Escape on back face flips to front face; Escape on front face closes', async ({
    page,
  }) => {
    await setupHarness(page);
    await page.locator('.pet-item-row >> text=my-eval').click();
    await page.keyboard.press('f');
    await expect(page.locator('#value-window')).toHaveClass(/flipped/);

    // Escape on back face: flip-to-front, not close.
    await page.keyboard.press('Escape');
    await expect(page.locator('#value-window')).not.toHaveClass(/flipped/);
    await expect(page.locator('#value-frame')).toBeVisible();

    // Escape on front face: closes.
    await page.keyboard.press('Escape');
    await expect(page.locator('#value-frame')).not.toBeVisible();
  });

  test.fixme('keypair back face shows public key but suppresses private key', async ({
    page,
  }) => {
    await setupHarness(page);
    await page.locator('.pet-item-row >> text=my-key').click();
    await page.locator('#value-flip-to-formula').click();
    const back = page.locator('#value-back-face');
    await expect(back).toContainText('0xPUBLIC');
    await expect(back).not.toContainText('0xSECRET');
    await expect(back).toContainText('Private key not displayed');
  });

  test.fixme('reduced-motion preference disables the card-flip rotation', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await setupHarness(page);
    await page.locator('.pet-item-row >> text=my-eval').click();
    // Sample the computed transition-property; under reduced motion
    // the card-flip transform transition is disabled.
    const trans = await page
      .locator('#value-window')
      .evaluate(el => getComputedStyle(el).transitionDuration);
    // The reduced-motion rule overrides the 200ms duration.
    expect(trans === '0s' || trans === '0ms' || trans === '').toBe(true);
    await context.close();
  });
});
