// @ts-check
/* global document, window, requestAnimationFrame */

import harden from '@endo/harden';
import { E } from '@endo/far';

/** @import { ChannelMessage } from './channel-utils.js' */

/**
 * @typedef {object} ShareTarget
 * @property {string} id - Space ID
 * @property {string} name - Display name
 * @property {string} icon - Emoji icon
 * @property {string[]} profilePath - Pet-name path to the agent
 * @property {string} [channelPetName] - Pet name of the channel
 */

/**
 * @typedef {object} ShareModalAPI
 * @property {(opts: ShareModalShowOptions) => void} show
 * @property {() => void} hide
 */

/**
 * @typedef {object} ShareModalShowOptions
 * @property {ChannelMessage[]} heritageChain - Messages to share (root-first)
 * @property {string} previewText - Short preview of the message being shared
 * @property {unknown} powers - Current persona powers for channel creation
 * @property {unknown} rootPowers - Root powers for resolving other personas
 * @property {ShareTarget[]} targets - Available channel spaces to share to
 * @property {(channelName: string) => void} [onNavigate] - Navigate to new channel
 */

/**
 * Resolve powers for a given profile path from root.
 * @param {unknown} rootPowers
 * @param {string[]} profilePath
 * @returns {Promise<unknown>}
 */
const resolvePersonaPowers = async (rootPowers, profilePath) => {
  /** @type {unknown} */
  let powers = rootPowers;
  for (const name of profilePath) {
    powers = E(/** @type {any} */ (powers)).lookup(name);
  }
  return powers;
};

/**
 * Fetch pet names from a persona's namespace.
 * @param {unknown} personaPowers
 * @returns {Promise<string[]>}
 */
const listPetNames = async personaPowers => {
  try {
    const names =
      await /** @type {{ list: () => Promise<AsyncIterable<string>> }} */ (
        E(personaPowers)
      ).list();
    /** @type {string[]} */
    const result = [];
    for await (const name of names) {
      result.push(name);
    }
    return result.sort();
  } catch {
    return [];
  }
};

/**
 * Create the share modal component.
 *
 * @param {HTMLElement} $container - Container element for the modal
 * @returns {ShareModalAPI}
 */
export const createShareModal = $container => {
  /** @type {ShareModalShowOptions | null} */
  let currentOpts = null;
  /** @type {string | null} */
  let selectedTargetId = null;
  /** @type {string | null} */
  let selectedChannelPetName = null;

  const hide = () => {
    currentOpts = null;
    selectedTargetId = null;
    selectedChannelPetName = null;
    $container.style.display = 'none';
    $container.innerHTML = '';
  };

  /**
   * Execute the share: fork heritage chain to new channel,
   * then post a reference in the target channel.
   *
   * @param {string} shareName - Pet name for the shared channel
   * @param {{ canEdit: boolean, canComment: boolean }} policy - Access policy
   * @param {ShareTarget} target - Target space
   * @param {string} targetChannelPetName - Specific channel pet name within the target space
   */
  const executeShare = async (
    shareName,
    policy,
    target,
    targetChannelPetName,
  ) => {
    if (!currentOpts) return;
    const { heritageChain, powers, rootPowers } = currentOpts;

    // 1. Create a new channel with the heritage chain
    const channelPetName = shareName;
    const displayName = shareName;

    await E(
      /** @type {{ makeChannel: (petName: string, proposedName: string) => Promise<unknown> }} */ (
        powers
      ),
    ).makeChannel(channelPetName, displayName);

    const newChannelRef = await E(
      /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
        powers
      ),
    ).lookup(channelPetName);

    // 2. Post heritage chain into the new channel
    for (let i = 0; i < heritageChain.length; i += 1) {
      const msg = heritageChain[i];
      const replyTo = i > 0 ? String(i - 1) : undefined;
      // eslint-disable-next-line no-await-in-loop
      await E(newChannelRef).post(msg.strings, msg.names, [], replyTo, msg.ids);
    }

    // 3. Post a reference message in the target channel
    try {
      const targetPersonaPowers = await resolvePersonaPowers(
        rootPowers,
        target.profilePath,
      );
      const targetChannelRef = await E(
        /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
          targetPersonaPowers
        ),
      ).lookup(targetChannelPetName);

      await E(targetChannelRef).post(
        ['Shared thread: ', ''],
        [channelPetName],
        [channelPetName],
        undefined,
        [],
      );

      // If sharing to an agent's space, also send an inbox message
      // so the agent is notified about the shared content.
      if (target.profilePath.length > 0) {
        const agentPetName = target.profilePath[0];
        try {
          await E(
            /** @type {{ send: (...args: unknown[]) => Promise<void> }} */ (
              rootPowers
            ),
          ).send(
            agentPetName,
            ['A thread was shared with you: ', ''],
            [channelPetName],
            [channelPetName],
          );
        } catch {
          // Agent inbox notification is best-effort
        }
      }
    } catch (err) {
      window.reportError(err);
    }

    hide();

    // Navigate to the new channel if callback provided
    if (currentOpts && currentOpts.onNavigate) {
      currentOpts.onNavigate(channelPetName);
    }
  };

  /**
   * @param {ShareModalShowOptions} opts
   */
  const show = opts => {
    currentOpts = opts;
    selectedTargetId = null;
    selectedChannelPetName = null;

    const channelTargets = opts.targets.filter(
      t => t.channelPetName !== undefined,
    );

    // Group targets by profilePath to deduplicate personas
    /** @type {Map<string, { profilePath: string[], icon: string, name: string, channels: ShareTarget[] }>} */
    const spaceGroups = new Map();
    for (const t of channelTargets) {
      const pathKey = t.profilePath.join('/');
      const group = spaceGroups.get(pathKey);
      if (group) {
        group.channels.push(t);
      } else {
        spaceGroups.set(pathKey, {
          profilePath: t.profilePath,
          icon: t.icon,
          name: t.name,
          channels: [t],
        });
      }
    }

    // Build modal DOM
    const $backdrop = document.createElement('div');
    $backdrop.className = 'share-backdrop';
    $backdrop.addEventListener('click', hide);

    const $modal = document.createElement('div');
    $modal.className = 'share-modal';

    // Header
    const $header = document.createElement('div');
    $header.className = 'share-header';
    const $title = document.createElement('h2');
    $title.className = 'share-title';
    $title.textContent = 'Share';
    const $close = document.createElement('button');
    $close.className = 'share-close';
    $close.type = 'button';
    $close.textContent = '\u00D7';
    $close.addEventListener('click', hide);
    $header.appendChild($title);
    $header.appendChild($close);
    $modal.appendChild($header);

    // Form
    const $form = document.createElement('form');
    $form.className = 'share-form';

    // Preview of what's being shared
    const $preview = document.createElement('div');
    $preview.className = 'share-preview';
    $preview.textContent = opts.previewText;
    $form.appendChild($preview);

    // Name field
    const $nameField = document.createElement('div');
    $nameField.className = 'share-field';
    const $nameLabel = document.createElement('label');
    $nameLabel.className = 'share-label';
    $nameLabel.textContent = 'Label';
    const $nameInput = document.createElement('input');
    $nameInput.className = 'share-input';
    $nameInput.type = 'text';
    $nameInput.placeholder = 'thread-name';
    $nameInput.pattern = '[a-z0-9][a-z0-9-]*';
    const defaultName =
      opts.previewText
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30) || `shared-${Date.now()}`;
    $nameInput.value = defaultName;
    const $nameHint = document.createElement('span');
    $nameHint.className = 'share-hint';
    $nameHint.textContent = 'Lowercase letters, numbers, hyphens';
    $nameField.appendChild($nameLabel);
    $nameField.appendChild($nameInput);
    $nameField.appendChild($nameHint);
    $form.appendChild($nameField);

    // Access policy field — checkboxes, both off by default (view-only)
    const $policyField = document.createElement('div');
    $policyField.className = 'share-field';
    const $policyLabel = document.createElement('label');
    $policyLabel.className = 'share-label';
    $policyLabel.textContent = 'Access';
    $policyField.appendChild($policyLabel);

    const $policyOptions = document.createElement('div');
    $policyOptions.className = 'share-policy-options';

    const $editCheck = document.createElement('input');
    $editCheck.type = 'checkbox';
    $editCheck.id = 'share-policy-edit';
    $editCheck.name = 'share-policy-edit';

    const $commentCheck = document.createElement('input');
    $commentCheck.type = 'checkbox';
    $commentCheck.id = 'share-policy-comment';
    $commentCheck.name = 'share-policy-comment';

    const policyChecks = [
      { $input: $editCheck, label: 'Can edit', icon: '\u270E' },
      { $input: $commentCheck, label: 'Can comment', icon: '\uD83D\uDCAC' },
    ];
    for (const pc of policyChecks) {
      const $opt = document.createElement('label');
      $opt.className = 'share-policy-option';
      const $text = document.createElement('span');
      $text.textContent = `${pc.icon} ${pc.label}`;
      $opt.appendChild(pc.$input);
      $opt.appendChild($text);
      $policyOptions.appendChild($opt);
    }
    $policyField.appendChild($policyOptions);
    $form.appendChild($policyField);

    // ---- Inventory selector + breadcrumbs ----

    const $targetField = document.createElement('div');
    $targetField.className = 'share-field';
    const $targetLabel = document.createElement('label');
    $targetLabel.className = 'share-label';
    $targetLabel.textContent = 'Share to';
    $targetField.appendChild($targetLabel);

    const $navigator = document.createElement('div');
    $navigator.className = 'share-navigator';

    // Breadcrumb bar
    const $navBreadcrumb = document.createElement('div');
    $navBreadcrumb.className = 'share-nav-breadcrumb';
    $navigator.appendChild($navBreadcrumb);

    // Single item list
    const $navList = document.createElement('div');
    $navList.className = 'share-nav-list';
    $navigator.appendChild($navList);

    /**
     * Navigation state: the path of pet names we've drilled into,
     * plus the profilePath prefix from the root space.
     * @type {{ label: string, profilePath: string[], petName?: string }[]}
     */
    const navPath = [];

    /**
     * Currently selected item name (at the current navigation level).
     * @type {string | null}
     */
    let navSelectedName = null;

    // Forward-declare for mutual references in click handlers.
    /** @type {() => Promise<void>} */
    // eslint-disable-next-line prefer-const
    let renderNavLevel;

    /**
     * Enable the submit button if a target is selected.
     */
    const updateSubmitState = () => {
      const $submit = $form.querySelector('.share-submit');
      if ($submit) {
        /** @type {HTMLButtonElement} */ ($submit).disabled =
          !selectedChannelPetName;
      }
    };

    /**
     * Render the breadcrumb bar from navPath.
     */
    const renderNavBreadcrumb = () => {
      $navBreadcrumb.innerHTML = '';

      // Root crumb
      const $root = document.createElement('button');
      $root.className = 'share-nav-crumb';
      $root.type = 'button';
      $root.textContent = '\u2302 Spaces'; // ⌂ Spaces
      $root.addEventListener('click', () => {
        navPath.length = 0;
        navSelectedName = null;
        selectedTargetId = null;
        selectedChannelPetName = null;
        updateSubmitState();
        renderNavLevel().catch(window.reportError);
      });
      $navBreadcrumb.appendChild($root);

      // Path crumbs
      for (let i = 0; i < navPath.length; i += 1) {
        const sep = document.createElement('span');
        sep.className = 'share-nav-sep';
        sep.textContent = ' \u203A '; // ›
        $navBreadcrumb.appendChild(sep);

        const segment = navPath[i];
        if (i < navPath.length - 1) {
          // Clickable ancestor
          const idx = i;
          const $crumb = document.createElement('button');
          $crumb.className = 'share-nav-crumb';
          $crumb.type = 'button';
          $crumb.textContent = segment.label;
          $crumb.addEventListener('click', () => {
            navPath.length = idx + 1;
            navSelectedName = null;
            selectedChannelPetName = null;
            updateSubmitState();
            renderNavLevel().catch(window.reportError);
          });
          $navBreadcrumb.appendChild($crumb);
        } else {
          // Current level label
          const $current = document.createElement('span');
          $current.className = 'share-nav-crumb-current';
          $current.textContent = segment.label;
          $navBreadcrumb.appendChild($current);
        }
      }
    };

    /**
     * Render the item list for the current navigation level.
     */
    renderNavLevel = async () => {
      $navList.innerHTML = '';
      renderNavBreadcrumb();

      if (navPath.length === 0) {
        // Root level: show space groups
        if (spaceGroups.size === 0) {
          const $empty = document.createElement('div');
          $empty.className = 'share-target-empty';
          $empty.textContent = 'No spaces available';
          $navList.appendChild($empty);
          return;
        }

        for (const [, group] of spaceGroups) {
          const representative = group.channels[0];
          const $item = document.createElement('button');
          $item.className = 'share-nav-item';
          $item.type = 'button';

          const $icon = document.createElement('span');
          $icon.className = 'share-nav-item-icon';
          $icon.textContent = group.icon;

          const $name = document.createElement('span');
          $name.className = 'share-nav-item-name';
          $name.textContent = group.name;

          const $chevron = document.createElement('span');
          $chevron.className = 'share-nav-item-chevron';
          $chevron.textContent = '\u203A'; // ›

          $item.appendChild($icon);
          $item.appendChild($name);
          $item.appendChild($chevron);

          $item.addEventListener('click', () => {
            navPath.push({
              label: group.name,
              profilePath: representative.profilePath,
            });
            navSelectedName = null;
            selectedTargetId = representative.id;
            selectedChannelPetName = null;
            updateSubmitState();
            renderNavLevel().catch(window.reportError);
          });

          $navList.appendChild($item);
        }
        return;
      }

      // Deeper level: fetch pet names from resolved powers
      const $loading = document.createElement('div');
      $loading.className = 'share-channel-loading';
      $loading.textContent = 'Loading\u2026';
      $navList.appendChild($loading);

      const currentSegment = navPath[navPath.length - 1];
      const currentProfilePath = currentSegment.profilePath;

      // Build the full lookup path: profilePath + any deeper petName segments
      const deeperNames = navPath
        .slice(1)
        .map(seg => seg.petName)
        .filter(
          /** @param {string | undefined} n @returns {n is string} */ n =>
            n !== undefined,
        );

      // Resolve powers for the full path in one call
      const fullPath = [...currentProfilePath, ...deeperNames];

      /** @type {unknown} */
      let currentPowers;
      try {
        currentPowers = await resolvePersonaPowers(opts.rootPowers, fullPath);
      } catch {
        $loading.textContent = 'Unable to access this location';
        return;
      }

      /** @type {string[]} */
      let petNames;
      try {
        petNames = await listPetNames(currentPowers);
      } catch {
        petNames = [];
      }

      $loading.remove();

      if (petNames.length === 0) {
        const $empty = document.createElement('div');
        $empty.className = 'share-target-empty';
        $empty.textContent = 'No items found';
        $navList.appendChild($empty);
        return;
      }

      for (const petName of petNames) {
        const $item = document.createElement('button');
        $item.className = 'share-nav-item';
        $item.type = 'button';
        if (navSelectedName === petName) {
          $item.classList.add('share-target-selected');
        }

        const $name = document.createElement('span');
        $name.className = 'share-nav-item-name';
        $name.textContent = petName;

        const $chevron = document.createElement('span');
        $chevron.className = 'share-nav-item-chevron';
        $chevron.type = 'button';
        $chevron.textContent = '\u203A'; // ›

        $item.appendChild($name);
        $item.appendChild($chevron);

        // Click name area: select this item as the share target
        $item.addEventListener('click', e => {
          // If chevron was clicked, drill in instead
          if (
            /** @type {HTMLElement} */ (e.target).closest(
              '.share-nav-item-chevron',
            )
          ) {
            return;
          }
          // Deselect previous
          const $prev = $navList.querySelectorAll('.share-target-selected');
          for (const $s of $prev) $s.classList.remove('share-target-selected');
          $item.classList.add('share-target-selected');
          navSelectedName = petName;
          selectedChannelPetName = petName;
          updateSubmitState();
        });

        // Click chevron: drill into this item
        $chevron.addEventListener('click', e => {
          e.stopPropagation();
          navPath.push({
            label: petName,
            profilePath: currentProfilePath,
            petName,
          });
          navSelectedName = null;
          selectedChannelPetName = null;
          updateSubmitState();
          renderNavLevel().catch(window.reportError);
        });

        $navList.appendChild($item);
      }
    };

    renderNavLevel().catch(window.reportError);

    $targetField.appendChild($navigator);
    $form.appendChild($targetField);

    // Actions
    const $actions = document.createElement('div');
    $actions.className = 'share-actions';

    const $cancel = document.createElement('button');
    $cancel.className = 'share-cancel';
    $cancel.type = 'button';
    $cancel.textContent = 'Cancel';
    $cancel.addEventListener('click', hide);

    const $submit = document.createElement('button');
    $submit.className = 'share-submit';
    $submit.type = 'submit';
    $submit.textContent = 'Share';
    $submit.disabled = true;

    $actions.appendChild($cancel);
    $actions.appendChild($submit);
    $form.appendChild($actions);

    $form.addEventListener('submit', e => {
      e.preventDefault();
      const name = $nameInput.value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^-|-$/g, '');
      if (!name) return;
      if (!selectedChannelPetName) return;
      if (navPath.length === 0) return;

      const policy = {
        canEdit: $editCheck.checked,
        canComment: $commentCheck.checked,
      };

      // Build the target from the navigation path.
      // The first navPath entry's profilePath is the persona path.
      // Deeper entries add petName segments to the lookup path.
      const firstSegment = navPath[0];
      const deeperPetNames = navPath
        .slice(1)
        .map(seg => seg.petName)
        .filter(
          /** @param {string | undefined} n @returns {n is string} */ n =>
            n !== undefined,
        );

      /** @type {ShareTarget} */
      const target = {
        id: selectedTargetId || firstSegment.label,
        name: firstSegment.label,
        icon: '',
        profilePath: [...firstSegment.profilePath, ...deeperPetNames],
      };

      $submit.disabled = true;
      $submit.textContent = 'Sharing\u2026';

      executeShare(name, policy, target, selectedChannelPetName).catch(err => {
        $submit.disabled = false;
        $submit.textContent = 'Share';
        window.reportError(err);
      });
    });

    $modal.appendChild($form);

    $container.innerHTML = '';
    $container.appendChild($backdrop);
    $container.appendChild($modal);
    $container.style.display = 'flex';

    // Focus the name input
    requestAnimationFrame(() => $nameInput.select());
  };

  return harden({ show, hide });
};
harden(createShareModal);
