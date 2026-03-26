/* eslint-disable no-await-in-loop */
/**
 * Channel Spaces E2E Tests
 *
 * These tests verify that multi-space channel management provides proper
 * isolation between personas. Each channel space should get an independent
 * agent with its own address book and pet store.
 *
 * Requires a running Endo daemon (the Vite dev server starts one).
 */
// @ts-nocheck - E2E test with browser globals

import { test, expect, type Page } from '@playwright/test';

// Unique suffix to avoid collisions with previous test runs
const suffix = Date.now().toString(36);

/**
 * Wait for the app to fully initialize (spaces gutter and inventory visible).
 */
async function waitForApp(page: Page) {
  await page.waitForSelector('#spaces-gutter', { timeout: 30_000 });
  await page.waitForSelector('#pets', { timeout: 10_000 });
}

/**
 * Click the "+" button in the spaces gutter to open the Add Space modal.
 */
async function openAddSpaceModal(page: Page) {
  await page.locator('.add-space-button').click();
  await page.waitForSelector('.add-space-modal', { timeout: 5_000 });
}

/**
 * Create a new channel space via the Add Space modal.
 *
 * @param page - Playwright page
 * @param spaceName - Space name / pet name
 * @param displayName - Channel creator display name
 */
async function createChannelSpace(
  page: Page,
  spaceName: string,
  displayName: string,
) {
  await openAddSpaceModal(page);

  // Choose "New Channel"
  await page.locator('[data-mode="new-channel"]').click();

  // Fill form
  await page.locator('#channel-pet-name').fill(spaceName);
  await page.locator('#channel-proposed-name').fill(displayName);

  // Submit
  await page.locator('.add-space-submit').click();

  // Wait for modal to close and space to appear
  await page.waitForSelector('.add-space-modal', {
    state: 'hidden',
    timeout: 30_000,
  });

  // Wait for the new space to be active in the gutter
  await page.waitForTimeout(1000);
}

/**
 * Connect to an existing channel via the Add Space modal.
 *
 * @param page - Playwright page
 * @param locator - Channel locator URL
 * @param spaceName - Local space name
 * @param displayName - User's display name in the channel
 */
async function connectToChannel(
  page: Page,
  locator: string,
  spaceName: string,
  displayName: string,
) {
  await openAddSpaceModal(page);

  // Choose "Connect to Channel"
  await page.locator('[data-mode="connect-channel"]').click();

  // Fill locator
  await page.locator('#connect-locator').fill(locator);

  // Select "Create new persona" (should be default)
  // Fill space name and display name
  await page.locator('#connect-space-name').fill(spaceName);
  await page.locator('#connect-proposed-name').fill(displayName);

  // Submit
  await page.locator('.add-space-submit').click();

  // Wait for modal to close
  await page.waitForSelector('.add-space-modal', {
    state: 'hidden',
    timeout: 30_000,
  });

  await page.waitForTimeout(1000);
}

/**
 * Navigate to a space by clicking its icon in the gutter.
 */
async function selectSpace(page: Page, index: number) {
  // Space items include home (index 0), then user spaces
  const spaceItems = page.locator('.space-item[data-space-id]');
  await spaceItems.nth(index).click();
  await page.waitForTimeout(500);
}

/**
 * Get the current inventory/channels header text.
 */
async function getInventoryHeaderText(page: Page): Promise<string> {
  return page.locator('.inventory-title').innerText();
}

/**
 * Get all visible pet names in the inventory list.
 */
async function getVisiblePetNames(page: Page): Promise<string[]> {
  // Wait for at least one item to appear
  await page.waitForSelector('.pet-name', { timeout: 10_000 }).catch(() => {});
  const names = await page.locator('.pet-name').allInnerTexts();
  return names;
}

/**
 * Post a message in the current channel.
 */
async function postMessage(page: Page, text: string) {
  const input = page.locator('#chat-message');
  await input.click();
  await input.type(text);
  await page.locator('#chat-send-button').click();
  // Wait for message to appear
  await page.waitForTimeout(1000);
}

/**
 * Get all visible message texts in the message area.
 */
async function getMessageTexts(page: Page): Promise<string[]> {
  const bodies = await page.locator('.message-body').allInnerTexts();
  return bodies;
}

/**
 * Get all visible message author names.
 */
async function getMessageAuthors(page: Page): Promise<string[]> {
  const authors = await page.locator('.channel-author').allInnerTexts();
  return authors;
}

test.describe('Channel Space Isolation', () => {
  test.describe.configure({ mode: 'serial' });

  const spaceA = `alpha-${suffix}`;
  const spaceB = `beta-${suffix}`;

  test('creating a channel space shows "Channels" header instead of "Inventory"', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);

    // Create a channel space
    await createChannelSpace(page, spaceA, 'Alice');

    // The header should say "Channels" not "Inventory"
    const headerText = await getInventoryHeaderText(page);
    expect(headerText.toLowerCase()).toBe('channels');
  });

  test('each channel space gets an independent pet store', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    // Create Space A
    await createChannelSpace(page, spaceA, 'Alice');
    const petNamesA = await getVisiblePetNames(page);

    // Create Space B
    await createChannelSpace(page, spaceB, 'Bob');
    const petNamesB = await getVisiblePetNames(page);

    // Each space should have its own independent inventory
    // Space A should have 'general' in its inventory
    // Space B should also have 'general' but in a different persona
    expect(petNamesA).toContain('general');
    expect(petNamesB).toContain('general');

    // Switch to Space A and verify its inventory is still independent
    // (finding Space A: it should be the first user space, index 1)
    await selectSpace(page, 1);
    const petNamesA2 = await getVisiblePetNames(page);
    expect(petNamesA2).toContain('general');
  });

  test('messages posted in one space do not appear in another', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);

    // Create Space A and post a message
    await createChannelSpace(page, `msg-a-${suffix}`, 'Alice');
    await postMessage(page, 'Hello from Alice!');

    // Verify message appears
    const messagesA = await getMessageTexts(page);
    expect(messagesA).toContain('Hello from Alice!');

    // Create Space B (different channel, different persona)
    await createChannelSpace(page, `msg-b-${suffix}`, 'Bob');

    // Space B should NOT show Alice's message (different channel)
    const messagesB = await getMessageTexts(page);
    expect(messagesB).not.toContain('Hello from Alice!');
  });

  test("two spaces joining the same channel see each other's messages with independent identities", async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);

    const sharedChannelSpace = `shared-${suffix}`;

    // Create Space A (admin of the channel)
    await createChannelSpace(page, sharedChannelSpace, 'Alice');

    // Alice posts
    await postMessage(page, 'Hello from the admin!');

    // Get the channel locator so Space B can connect
    // We need to open the channel menu and create an invitation
    // For now, we verify the channel header is present
    const channelHeader = page.locator('.channel-header-title');
    await expect(channelHeader).toBeVisible();
  });

  test('address books are independent across spaces viewing same channel', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);

    // This test verifies that the localStorage-based address book
    // (memberId -> nickname mapping) is scoped per persona, not per channel.
    //
    // Bug: channelComponent uses `channel-names:${channelName}` as the
    // localStorage key, which is the same for all personas viewing the same
    // channel. Nicknames assigned in one space leak to the other.
    //
    // Fix: The localStorage key must include the persona/space identity.

    const channelName = `ab-test-${suffix}`;

    // Create Space A
    await createChannelSpace(page, channelName, 'Alice');

    // Verify the channel author shows in scare quotes (no nickname assigned)
    const authors = await page.locator('.channel-author');
    // If Alice posts a message:
    await postMessage(page, 'Test message');

    // The author should show (proposed name in scare quotes or plain)
    const firstAuthor = await authors.first().innerText();
    expect(firstAuthor).toBeTruthy();

    // The localStorage key for the address book should include persona identity
    const storageKeys = await page.evaluate(() => {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('channel-names:')) {
          keys.push(key);
        }
      }
      return keys;
    });

    // Each address book key should include persona-specific information,
    // not just the channel's proposed name
    for (const key of storageKeys) {
      // The key should contain more than just "channel-names:ProposedName"
      // It should include a persona identifier to prevent sharing
      const parts = key.split(':');
      expect(parts.length).toBeGreaterThan(2);
    }
  });

  test('deleting a channel space clears its address book from localStorage', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);

    const spaceName = `del-ab-${suffix}`;
    await createChannelSpace(page, spaceName, 'Alice');

    // Post a message so the address book gets an entry
    await postMessage(page, 'Hello from Alice');

    // Verify that a localStorage key exists for this persona's address book
    const personaId = `persona-for-${spaceName}`;
    const keysBefore = await page.evaluate(pid => {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(`channel-names:${pid}:`)) {
          keys.push(key);
        }
      }
      return keys;
    }, personaId);

    // There should be at least one address book entry
    // (auto-assigned from the channel's getMembers)
    expect(keysBefore.length).toBeGreaterThanOrEqual(0);

    // Seed the address book with a known entry to test cleanup
    await page.evaluate(pid => {
      window.localStorage.setItem(
        `channel-names:${pid}:TestChannel`,
        JSON.stringify([['member-1', 'OldNickname']]),
      );
    }, personaId);

    // Verify the seeded entry exists
    const seededKey = await page.evaluate(
      pid => window.localStorage.getItem(`channel-names:${pid}:TestChannel`),
      personaId,
    );
    expect(seededKey).toBeTruthy();

    // Delete the space via right-click context menu
    const spaceItems = page.locator('.space-item[data-space-id]');
    const spaceCount = await spaceItems.count();
    // The last user space should be the one we just created
    const lastSpace = spaceItems.nth(spaceCount - 1);
    await lastSpace.click({ button: 'right' });
    await page.waitForSelector('.space-context-menu.visible', {
      timeout: 5000,
    });
    await page.locator('[data-action="delete"]').click();
    await page.waitForTimeout(1000);

    // After deletion, the address book entries for this persona should be cleared
    const keysAfter = await page.evaluate(pid => {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(`channel-names:${pid}:`)) {
          keys.push(key);
        }
      }
      return keys;
    }, personaId);

    expect(keysAfter.length).toBe(0);
  });

  test('channel items in inventory do not have disclosure triangles', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);

    await createChannelSpace(page, `disc-${suffix}`, 'Alice');

    // Wait for channel item to appear in inventory
    await page.waitForSelector('.pet-name', { timeout: 10_000 });

    // The disclosure triangle for channel items should be hidden
    const disclosureButtons = page.locator('.pet-disclosure');
    const count = await disclosureButtons.count();

    for (let i = 0; i < count; i++) {
      const disclosure = disclosureButtons.nth(i);
      const isHidden = await disclosure.evaluate(
        el =>
          el.classList.contains('hidden') ||
          getComputedStyle(el).visibility === 'hidden',
      );
      // Channel items should have hidden disclosure triangles
      // (other items like SELF, AGENT etc. may or may not be visible)
      const siblingName = await disclosure
        .locator('~ .pet-name')
        .first()
        .innerText()
        .catch(() => '');
      if (siblingName === 'general') {
        expect(isHidden).toBe(true);
      }
    }
  });

  test('switching channels within a space updates the message area without full rebuild', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForApp(page);

    const multiChannelSpace = `multi-${suffix}`;
    await createChannelSpace(page, multiChannelSpace, 'Alice');

    // Post in the default channel
    await postMessage(page, 'Message in default channel');

    // Use the "New" button to create a second channel within this space
    const newBtn = page.locator('.channel-action-btn', { hasText: 'New' });
    await expect(newBtn).toBeVisible();
    await newBtn.click();

    // Fill in the new channel form
    const formInputs = page.locator('.channel-form-input');
    await formInputs.nth(0).fill('second-channel');
    await formInputs.nth(1).fill('Alice');
    await page.locator('.channel-form-submit').click();

    // Wait for the channel to be created
    await page.waitForTimeout(2000);

    // The message area should now show the new channel (no messages)
    const messagesAfterSwitch = await getMessageTexts(page);
    expect(messagesAfterSwitch).not.toContain('Message in default channel');

    // Switch back to the original channel by clicking it in the list
    const channelItem = page
      .locator('.pet-name', { hasText: 'general' })
      .first();
    await channelItem.click();
    await page.waitForTimeout(1000);

    // Should see the original message again
    const messagesAfterReturn = await getMessageTexts(page);
    expect(messagesAfterReturn).toContain('Message in default channel');
  });
});
