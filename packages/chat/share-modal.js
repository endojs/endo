// @ts-check
/* global document, window, requestAnimationFrame */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { makeRefIterator } from './ref-iterator.js';

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
 * @property {ShareTarget[]} targets - Available channels to share to
 * @property {(channelName: string) => void} [onNavigate] - Navigate to new channel
 */

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

  const hide = () => {
    currentOpts = null;
    selectedTargetId = null;
    $container.style.display = 'none';
    $container.innerHTML = '';
  };

  /**
   * Execute the share: fork heritage chain to new channel,
   * then post a reference in the target channel.
   *
   * @param {string} shareName - Pet name for the shared channel
   * @param {string} policy - 'view' or 'comment'
   * @param {ShareTarget} target - Target channel to share into
   */
  const executeShare = async (shareName, policy, target) => {
    if (!currentOpts) return;
    const { heritageChain, powers } = currentOpts;

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
      await E(newChannelRef).post(
        msg.strings,
        msg.names,
        [],
        replyTo,
        msg.ids,
      );
    }

    // 3. Post a reference message in the target channel
    if (target.channelPetName) {
      try {
        const targetChannelRef = await E(
          /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
            powers
          ),
        ).lookup(target.channelPetName);

        await E(targetChannelRef).post(
          ['Shared thread: ', ''],
          [channelPetName],
          [channelPetName],
          undefined,
          [],
        );
      } catch (err) {
        window.reportError(err);
      }
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

    const channelTargets = opts.targets.filter(
      t => t.channelPetName !== undefined,
    );

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
    // Auto-generate a default name from preview
    const defaultName = opts.previewText
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

    // Policy field
    const $policyField = document.createElement('div');
    $policyField.className = 'share-field';
    const $policyLabel = document.createElement('label');
    $policyLabel.className = 'share-label';
    $policyLabel.textContent = 'Access';
    $policyField.appendChild($policyLabel);

    const $policyOptions = document.createElement('div');
    $policyOptions.className = 'share-policy-options';

    const policies = [
      { value: 'view', label: 'View only', icon: '\uD83D\uDD12' },
      { value: 'comment', label: 'View & comment', icon: '\uD83D\uDCAC' },
    ];
    for (const p of policies) {
      const $opt = document.createElement('label');
      $opt.className = 'share-policy-option';
      const $radio = document.createElement('input');
      $radio.type = 'radio';
      $radio.name = 'share-policy';
      $radio.value = p.value;
      if (p.value === 'view') $radio.checked = true;
      const $text = document.createElement('span');
      $text.textContent = `${p.icon} ${p.label}`;
      $opt.appendChild($radio);
      $opt.appendChild($text);
      $policyOptions.appendChild($opt);
    }
    $policyField.appendChild($policyOptions);
    $form.appendChild($policyField);

    // Target selection
    const $targetField = document.createElement('div');
    $targetField.className = 'share-field';
    const $targetLabel = document.createElement('label');
    $targetLabel.className = 'share-label';
    $targetLabel.textContent = 'Share to';
    $targetField.appendChild($targetLabel);

    const $targetList = document.createElement('div');
    $targetList.className = 'share-target-list';

    if (channelTargets.length === 0) {
      const $empty = document.createElement('div');
      $empty.className = 'share-target-empty';
      $empty.textContent = 'No channels available';
      $targetList.appendChild($empty);
    }

    for (const target of channelTargets) {
      const $item = document.createElement('button');
      $item.className = 'share-target-item';
      $item.type = 'button';
      $item.dataset.targetId = target.id;

      const $icon = document.createElement('span');
      $icon.className = 'share-target-icon';
      $icon.textContent = target.icon;

      const $name = document.createElement('span');
      $name.className = 'share-target-name';
      $name.textContent = target.name;

      $item.appendChild($icon);
      $item.appendChild($name);

      $item.addEventListener('click', () => {
        // Deselect previous
        const $prev = $targetList.querySelector('.share-target-selected');
        if ($prev) $prev.classList.remove('share-target-selected');
        // Select this one
        $item.classList.add('share-target-selected');
        selectedTargetId = target.id;
        // Enable submit
        const $submit = $form.querySelector('.share-submit');
        if ($submit) {
          /** @type {HTMLButtonElement} */ ($submit).disabled = false;
        }
      });

      $targetList.appendChild($item);
    }

    $targetField.appendChild($targetList);
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

      const policyInput = $form.querySelector(
        'input[name="share-policy"]:checked',
      );
      const policy = policyInput
        ? /** @type {HTMLInputElement} */ (policyInput).value
        : 'view';

      const target = channelTargets.find(t => t.id === selectedTargetId);
      if (!target) return;

      $submit.disabled = true;
      $submit.textContent = 'Sharing\u2026';

      executeShare(name, policy, target).catch(err => {
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
