// @ts-check
/* eslint-disable no-use-before-define */

import harden from '@endo/harden';

/** @import { ERef } from '@endo/eventual-send' */

import { E } from '@endo/eventual-send';

import {
  deriveConstants,
  formatDuration,
} from '@endo/spaces-util/heat-engine.js';
import { Fragment, h } from 'preact';
import { renderConfined } from '@endo/preact-container/renderer';

import { createHeatSimulation } from './heat-simulation.js';

// Channel header chrome (menu button + dropdown, invite-delivery modal, members
// panel, per-invitation attenuator modal), migrated from imperative DOM to a
// confined Preact tree rendered through a single `renderConfined`.
//
// SHAPE. `createChannelHeader` is a controller closure: it holds the mutable
// view `state`, exposes async handlers that talk to the channel/powers via
// `E()`, and re-renders the whole header by calling `renderConfined(h(Header,
// …), $mount)` after every state change. The same controller↔component split
// share-modal.js uses. `chat.js` is untouched: the entry signature and the
// returned `{ dispose }` API are preserved exactly.
//
// THE HOST-NODE BRIDGE. The attenuator modal embeds the heat SIMULATION
// (`heat-simulation.js`, still imperative DOM — a `<canvas>` plus scenario
// buttons with real listeners and a `getContext('2d')` draw loop). Live DOM
// with listeners cannot enter a confined vnode tree — `renderConfined` strips
// refs and real nodes. So the modal renders an empty ANCHOR slot
// (`data-heat-sim-anchor`) and, after each confined render, the controller
// mounts (once) `createHeatSimulation` into it and re-parents the wrapper node
// back into the freshly rendered anchor. This mirrors the host-node embedding
// the microblog/inbox migrations use. `heat-simulation.js` / `heat-engine.js`
// are unchanged.

/**
 * @typedef {object} ChannelHeaderAPI
 * @property {() => void} dispose - Dispose the header component
 */

/**
 * @typedef {object} MemberInfo
 * @property {string} proposedName
 * @property {string} invitedAs
 * @property {string} memberId
 * @property {string[]} pedigree
 * @property {boolean} active
 */

/**
 * The channel/member methods this header invokes via `E()`. The `channel`
 * option is loosely typed (`unknown`) at the boundary; cast through this at the
 * call sites, matching the inline-cast pattern the rest of the file uses.
 *
 * @typedef {object} ChannelHeaderChannel
 * @property {(inviteeName: string) => Promise<unknown>} createInvitation
 * @property {() => Promise<MemberInfo[]>} getMembers
 * @property {(invitedAs: string) => Promise<unknown>} getAttenuator
 */

/**
 * @typedef {'chat' | 'forum' | 'outliner' | 'microblog'} ViewMode
 */

/**
 * The active overlay below the menu button. Exactly one of: nothing, the
 * dropdown menu, the invite-delivery modal, the members panel, the attenuator
 * modal.
 *
 * @typedef {'none' | 'menu' | 'invite' | 'members' | 'attenuator'} Overlay
 */

/**
 * Heat config shape, matching `heat-engine`'s `HeatConfig`.
 *
 * @typedef {object} HeatConfig
 * @property {number} burstLimit
 * @property {number} sustainedRate
 * @property {number} lockoutDurationMs
 * @property {number} postLockoutPct
 */

/**
 * Log-scale conversion for lockout duration slider.
 * Maps 0–100 slider → 2000ms–259200000ms (2s–72h).
 * @param {number} sliderVal - 0 to 100
 * @returns {number} ms
 */
const sliderToLockoutMs = sliderVal => {
  const minLog = Math.log(2000);
  const maxLog = Math.log(259_200_000);
  return Math.round(Math.exp(minLog + (sliderVal / 100) * (maxLog - minLog)));
};
harden(sliderToLockoutMs);

/**
 * @param {number} ms
 * @returns {number} slider 0–100
 */
const lockoutMsToSlider = ms => {
  const minLog = Math.log(2000);
  const maxLog = Math.log(259_200_000);
  return Math.round(((Math.log(ms) - minLog) / (maxLog - minLog)) * 100);
};
harden(lockoutMsToSlider);

/**
 * Resolve a shareable `endo://` locator for a channel pet name, preferring the
 * host's `locateWithHints` and falling back to `locate` (guest / directory).
 * Returns null if no usable locator can be produced.
 *
 * @param {unknown} powers
 * @param {string} channelPetName
 * @param {ViewMode} viewMode
 * @returns {Promise<string | null>}
 */
const resolveLocator = async (powers, channelPetName, viewMode) => {
  let rawLocator;
  try {
    rawLocator = await E(
      /** @type {{ locateWithHints: (...args: string[]) => Promise<string> }} */ (
        powers
      ),
    ).locateWithHints(channelPetName);
  } catch {
    rawLocator = await E(
      /** @type {{ locate: (...args: string[]) => Promise<string> }} */ (
        powers
      ),
    ).locate(channelPetName);
  }
  if (!rawLocator || !String(rawLocator).startsWith('endo://')) {
    return null;
  }
  return viewMode && viewMode !== 'chat'
    ? `${rawLocator}&view=${viewMode}`
    : rawLocator;
};
harden(resolveLocator);

/**
 * The menu button (⋮) that toggles the dropdown / closes any overlay.
 *
 * @param {object} props
 * @param {() => void} props.onClick
 */
const MenuButton = ({ onClick }) =>
  h(
    'button',
    {
      type: 'button',
      class: 'channel-menu-btn',
      title: 'Channel actions',
      onClick,
    },
    '⋮',
  );
harden(MenuButton);

/**
 * The dropdown menu: view-mode switch plus invite / members actions.
 *
 * @param {object} props
 * @param {ViewMode} props.viewMode
 * @param {(action: string) => void} props.onAction
 */
const DropdownMenu = ({ viewMode, onAction }) => {
  /**
   * @param {ViewMode} mode
   * @param {string} label
   */
  const viewItem = (mode, label) =>
    h(
      'button',
      {
        type: 'button',
        class: `channel-menu-item view-mode-item ${
          viewMode === mode ? 'active' : ''
        }`,
        'data-action': `view-${mode}`,
        onClick: () => onAction(`view-${mode}`),
      },
      label,
    );

  return h(
    'div',
    { class: 'channel-menu' },
    h(
      'div',
      { class: 'channel-menu-section' },
      h('div', { class: 'channel-menu-label' }, 'View as'),
      viewItem('chat', 'Chat'),
      viewItem('forum', 'Forum'),
      viewItem('outliner', 'Outliner'),
      viewItem('microblog', 'Microblog'),
    ),
    h('div', { class: 'channel-menu-divider' }),
    h(
      'button',
      {
        type: 'button',
        class: 'channel-menu-item',
        'data-action': 'invite',
        onClick: () => onAction('invite'),
      },
      'Create Invitation',
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'channel-menu-item',
        'data-action': 'members',
        onClick: () => onAction('members'),
      },
      'Manage Members',
    ),
  );
};
harden(DropdownMenu);

/**
 * The invitation-delivery modal: copy a link or send to a contact.
 *
 * @param {object} props
 * @param {string} props.inviteeName
 * @param {boolean} props.sending
 * @param {() => void} props.onLink
 * @param {() => void} props.onContact
 * @param {() => void} props.onClose
 */
const InviteDeliveryModal = ({
  inviteeName,
  sending,
  onLink,
  onContact,
  onClose,
}) =>
  h(
    'div',
    { class: 'invite-delivery-modal' },
    h(
      'div',
      { class: 'invite-delivery-content' },
      h('h3', null, `Invitation created for “${inviteeName}”`),
      h('p', null, 'How would you like to share it?'),
      h(
        'div',
        { class: 'invite-delivery-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'invite-delivery-btn',
            'data-action': 'link',
            onClick: onLink,
          },
          'Copy Link',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'invite-delivery-btn',
            'data-action': 'contact',
            disabled: sending,
            onClick: onContact,
          },
          sending ? 'Sending…' : 'Send to Contact',
        ),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'invite-delivery-close',
          onClick: onClose,
        },
        '×',
      ),
    ),
  );
harden(InviteDeliveryModal);

/**
 * A single invitation row in the members panel.
 *
 * @param {object} props
 * @param {MemberInfo} props.member
 * @param {(invitedAs: string) => void} props.onManage
 */
const MemberEntry = ({ member, onManage }) =>
  h(
    'div',
    { class: `channel-member-entry ${member.active ? '' : 'disabled'}` },
    h('span', { class: 'member-name' }, `“${member.proposedName}”`),
    h(
      'span',
      { class: 'member-pedigree' },
      member.pedigree.length > 0 ? member.pedigree.join(' → ') : 'Creator',
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'member-manage-btn',
        'data-invited-as': member.invitedAs,
        onClick: () => onManage(member.invitedAs),
      },
      'Manage',
    ),
  );
harden(MemberEntry);

/**
 * The members panel listing this user's invitations.
 *
 * @param {object} props
 * @param {MemberInfo[]} props.members
 * @param {() => void} props.onClose
 * @param {(invitedAs: string) => void} props.onManage
 */
const MembersPanel = ({ members, onClose, onManage }) =>
  h(
    'div',
    { class: 'channel-members-panel' },
    h(
      'div',
      { class: 'channel-members-panel-header' },
      h('h3', null, 'Your Invitations'),
      h(
        'button',
        {
          type: 'button',
          class: 'channel-members-close',
          title: 'Close',
          onClick: onClose,
        },
        '×',
      ),
    ),
    members.length > 0
      ? members.map(member =>
          h(MemberEntry, { key: member.invitedAs, member, onManage }),
        )
      : h('p', { class: 'channel-members-empty' }, 'No invitations yet.'),
  );
harden(MembersPanel);

/**
 * A single labelled range slider with a live value readout.
 *
 * @param {object} props
 * @param {import('preact').ComponentChildren} props.label
 * @param {string} props.class
 * @param {number} props.min
 * @param {number} props.max
 * @param {number} props.value
 * @param {(value: number) => void} props.onInput
 */
const HeatSlider = ({ label, class: sliderClass, min, max, value, onInput }) =>
  h(
    'div',
    { class: 'heat-slider-field' },
    h('label', null, label),
    h('input', {
      type: 'range',
      class: sliderClass,
      min: String(min),
      max: String(max),
      value: String(value),
      /** @param {{ target: { value: string } }} e */
      onInput: e => onInput(Number(e.target.value)),
    }),
  );
harden(HeatSlider);

/**
 * The per-invitation attenuator modal: enable toggle, heat sliders, the heat
 * simulation (bridged into an anchor), copy-link, and emergency ban.
 *
 * @param {object} props
 * @param {string} props.invitedAs
 * @param {boolean} props.isActive
 * @param {HeatConfig} props.config
 * @param {number} props.banDuration
 * @param {string} props.derivedText
 * @param {boolean} props.canCopyLink
 * @param {() => void} props.onMenuButton
 * @param {() => void} props.onClose
 * @param {(checked: boolean) => void} props.onToggleValidity
 * @param {(value: number) => void} props.onBurst
 * @param {(value: number) => void} props.onSustained
 * @param {(value: number) => void} props.onLockout
 * @param {(value: number) => void} props.onPostLockout
 * @param {(value: number) => void} props.onBanDurationChange
 * @param {() => void} props.onApplyBan
 * @param {() => void} props.onCopyLink
 */
const AttenuatorModal = ({
  invitedAs,
  isActive,
  config,
  banDuration,
  derivedText,
  canCopyLink,
  onMenuButton,
  onClose,
  onToggleValidity,
  onBurst,
  onSustained,
  onLockout,
  onPostLockout,
  onBanDurationChange,
  onApplyBan,
  onCopyLink,
}) =>
  h(
    Fragment,
    null,
    h(MenuButton, { onClick: onMenuButton }),
    h(
      'div',
      { class: 'channel-attenuator-modal' },
      h(
        'div',
        { class: 'channel-attenuator-header' },
        h('h3', null, `Manage: “${invitedAs}”`),
        h(
          'button',
          {
            type: 'button',
            class: 'channel-attenuator-close',
            title: 'Close',
            onClick: onClose,
          },
          '×',
        ),
      ),
      h(
        'div',
        { class: 'channel-attenuator-body' },
        h(
          'label',
          { class: 'attenuator-field' },
          h('span', null, 'Enabled'),
          h('input', {
            type: 'checkbox',
            class: 'attenuator-valid',
            checked: isActive,
            /** @param {{ target: { checked: boolean } }} e */
            onChange: e => onToggleValidity(e.target.checked),
          }),
        ),
        h(HeatSlider, {
          label: h(
            Fragment,
            null,
            'Burst limit: ',
            h('span', { class: 'heat-burst-val' }, String(config.burstLimit)),
          ),
          class: 'heat-burst-slider',
          min: 3,
          max: 30,
          value: config.burstLimit,
          onInput: onBurst,
        }),
        h(HeatSlider, {
          label: h(
            Fragment,
            null,
            'Sustained rate: ',
            h(
              'span',
              { class: 'heat-sustained-val' },
              String(config.sustainedRate),
            ),
            ' msg/min',
          ),
          class: 'heat-sustained-slider',
          min: 1,
          max: 60,
          value: config.sustainedRate,
          onInput: onSustained,
        }),
        h(HeatSlider, {
          label: h(
            Fragment,
            null,
            'Cooldown: ',
            h(
              'span',
              { class: 'heat-lockout-val' },
              formatDuration(config.lockoutDurationMs),
            ),
          ),
          class: 'heat-lockout-slider',
          min: 0,
          max: 100,
          value: lockoutMsToSlider(config.lockoutDurationMs),
          onInput: onLockout,
        }),
        h(
          'details',
          { class: 'heat-advanced' },
          h('summary', null, 'Advanced'),
          h(HeatSlider, {
            label: h(
              Fragment,
              null,
              'Post-lockout heat: ',
              h(
                'span',
                { class: 'heat-postlockout-val' },
                `${config.postLockoutPct}%`,
              ),
            ),
            class: 'heat-postlockout-slider',
            min: 0,
            max: 100,
            value: config.postLockoutPct,
            onInput: onPostLockout,
          }),
          h('div', { class: 'heat-derived-params' }, derivedText),
        ),
        // The heat simulation is imperative DOM (canvas + listeners); the
        // controller bridges it into this anchor after render.
        h('div', { class: 'heat-sim-container', 'data-heat-sim-anchor': '' }),
        h(
          'div',
          { class: 'attenuator-field' },
          canCopyLink
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'attenuator-copy-link-btn',
                  onClick: onCopyLink,
                },
                'Copy Invite Link',
              )
            : null,
        ),
        h(
          'div',
          { class: 'attenuator-field' },
          h('span', null, 'Emergency ban'),
          h(
            'div',
            { class: 'attenuator-ban-row' },
            h('input', {
              type: 'number',
              class: 'attenuator-ban-duration',
              value: String(banDuration),
              min: '1',
              /** @param {{ target: { value: string } }} e */
              onInput: e => onBanDurationChange(Number(e.target.value)),
            }),
            h(
              'button',
              {
                type: 'button',
                class: 'attenuator-ban-btn',
                onClick: onApplyBan,
              },
              'Apply Ban',
            ),
          ),
        ),
      ),
    ),
  );
harden(AttenuatorModal);

/**
 * Create the channel header actions component (menu button + dropdown).
 * Renders into a sub-container within the conversation header bar,
 * without replacing the header's title or back button.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the actions
 * @param {unknown} options.channel - Channel or ChannelMember reference
 * @param {unknown} options.powers - Host powers for locator generation
 * @param {string} [options.channelPetName] - Pet name of the channel
 * @param {ViewMode} [options.viewMode] - Current view mode
 * @param {(mode: ViewMode) => void} [options.onViewModeChange] - Callback when view mode changes
 * @returns {ChannelHeaderAPI}
 */
export const createChannelHeader = ({
  $container,
  channel,
  powers,
  channelPetName,
  viewMode = 'chat',
  onViewModeChange,
}) => {
  // Dedicated confined mount inside `$container`; siblings of `$container` (the
  // header title / back button) are never reconciled away. `display: contents`
  // keeps the actions' own layout applying to the mount's children.
  const $mount = document.createElement('div');
  $mount.style.display = 'contents';
  $container.appendChild($mount);

  /**
   * @typedef {object} State
   * @property {Overlay} overlay
   * @property {string | null} inviteeName - The invitee for the delivery modal.
   * @property {boolean} sending - Contact-send in progress.
   * @property {MemberInfo[]} members - Loaded invitations for the panel.
   * @property {string | null} attenuatorMember - The `invitedAs` under management.
   * @property {object | null} attenuator - The attenuator ref for the open modal.
   * @property {boolean} attenuatorActive
   * @property {HeatConfig} config
   * @property {number} banDuration
   * @property {string} derivedText
   */

  /** @type {State} */
  let state = harden({
    overlay: 'none',
    inviteeName: null,
    sending: false,
    members: [],
    attenuatorMember: null,
    attenuator: null,
    attenuatorActive: true,
    config: {
      burstLimit: 10,
      sustainedRate: 30,
      lockoutDurationMs: 10_000,
      postLockoutPct: 40,
    },
    banDuration: 60,
    derivedText: '',
  });

  /** @type {ReturnType<typeof createHeatSimulation> | null} */
  let simInstance = null;
  // The simulation's host wrapper node, tracked here (the sim API exposes only
  // `updateParams` / `dispose`) so it can be re-parented if Preact re-creates
  // the anchor on a subsequent attenuator re-render.
  /** @type {HTMLElement | null} */
  let simWrapper = null;

  /** @type {ReturnType<typeof setTimeout> | null} */
  let debounceTimer = null;

  /** @type {(() => void) | null} */
  let outsideClickRemover = null;

  /**
   * Merge a partial state update and re-render the confined tree.
   * @param {Partial<State>} patchValue
   */
  const patch = patchValue => {
    state = harden({ ...state, ...patchValue });
    rerender();
  };

  /**
   * Compute the derived-params readout for the current config.
   * @param {HeatConfig} config
   * @returns {string}
   */
  const deriveText = config => {
    const { heatPerMessage, coolRate } = deriveConstants(config);
    return `Heat/msg: ${heatPerMessage.toFixed(1)} | Cool rate: ${coolRate.toFixed(2)}/s`;
  };

  /** Tear down the heat simulation if one is mounted. */
  const disposeSim = () => {
    if (simInstance) {
      simInstance.dispose();
      simInstance = null;
    }
    simWrapper = null;
  };

  /** Remove any pending document outside-click handler. */
  const clearOutsideClick = () => {
    if (outsideClickRemover) {
      outsideClickRemover();
      outsideClickRemover = null;
    }
  };

  // ---- Menu / overlay handlers ----

  const toggleMenu = () => {
    clearOutsideClick();
    disposeSim();
    patch({
      overlay: state.overlay === 'menu' ? 'none' : 'menu',
      attenuatorMember: null,
      attenuator: null,
    });
  };

  /** @param {string} action */
  const onMenuAction = action => {
    clearOutsideClick();
    if (action === 'invite') {
      patch({ overlay: 'none' });
      handleInvite().catch(window.reportError);
      return;
    }
    if (action === 'members') {
      if (state.overlay === 'members') {
        patch({ overlay: 'none' });
      } else {
        patch({ overlay: 'none' });
        showMembers().catch(window.reportError);
      }
      return;
    }
    if (
      action === 'view-chat' ||
      action === 'view-forum' ||
      action === 'view-outliner' ||
      action === 'view-microblog'
    ) {
      const newMode = /** @type {ViewMode} */ (action.replace('view-', ''));
      if (newMode !== viewMode && onViewModeChange) {
        viewMode = newMode;
        onViewModeChange(newMode);
      }
      patch({ overlay: 'none' });
    }
  };

  const handleInvite = async () => {
    const inviteeName = window.prompt(
      'Enter a display name for the new member:',
    );
    if (!inviteeName) return;

    try {
      await E(/** @type {ChannelHeaderChannel} */ (channel)).createInvitation(
        inviteeName,
      );

      if (powers && channelPetName) {
        // Show the delivery-options modal as a confined overlay.
        patch({ overlay: 'invite', inviteeName, sending: false });
        return;
      }
    } catch (err) {
      window.alert(
        `Failed to create invitation: ${/** @type {Error} */ (err).message}`,
      );
    }
    patch({ overlay: 'none' });
  };

  const closeInvite = () => {
    patch({ overlay: 'none', inviteeName: null, sending: false });
  };

  const onInviteLink = () => {
    const { inviteeName } = state;
    patch({ overlay: 'none', inviteeName: null, sending: false });
    if (!powers || !channelPetName) return;
    const run = async () => {
      try {
        const locator = await resolveLocator(powers, channelPetName, viewMode);
        if (locator === null) {
          window.alert(
            'Could not generate a shareable link. The daemon may not have network addresses configured.',
          );
          return;
        }
        window.prompt('Share this locator with the invitee:', locator);
      } catch {
        window.alert(
          `Invitation created for "${inviteeName}". Share the channel locator directly.`,
        );
      }
    };
    run().catch(window.reportError);
  };

  const onInviteContact = () => {
    if (!powers || !channelPetName) return;
    const contactName = window.prompt(
      'Pet name of the contact to send invitation to:',
    );
    if (!contactName) {
      closeInvite();
      return;
    }
    patch({ sending: true });
    const run = async () => {
      try {
        const edgeName = channelPetName;
        await E(
          /** @type {{ send: (to: string, strings: string[], edgeNames: string[], petNames: string[]) => Promise<void> }} */ (
            powers
          ),
        ).send(
          contactName,
          [
            `You’ve been invited to join `,
            `. Join the channel to participate.`,
          ],
          [edgeName],
          [channelPetName],
        );
        closeInvite();
        window.alert(`Invitation sent to @${contactName}.`);
      } catch (err) {
        patch({ sending: false });
        window.alert(`Failed to send: ${/** @type {Error} */ (err).message}`);
      }
    };
    run().catch(window.reportError);
  };

  // ---- Members panel ----

  const showMembers = async () => {
    try {
      const members = await E(
        /** @type {ChannelHeaderChannel} */ (channel),
      ).getMembers();
      disposeSim();
      patch({
        overlay: 'members',
        members,
        attenuatorMember: null,
        attenuator: null,
      });
    } catch (err) {
      console.error('[ChannelHeader] Failed to get members:', err);
      patch({ overlay: 'none' });
    }
  };

  const closeMembers = () => {
    patch({ overlay: 'none' });
  };

  // ---- Attenuator modal ----

  /** @param {string} invitedAs */
  const showAttenuatorModal = async invitedAs => {
    try {
      const [attenuator, members] = await Promise.all([
        E(/** @type {ChannelHeaderChannel} */ (channel)).getAttenuator(
          invitedAs,
        ),
        E(/** @type {ChannelHeaderChannel} */ (channel)).getMembers(),
      ]);
      const memberInfo = members.find(m => m.invitedAs === invitedAs);
      const isActive = memberInfo ? memberInfo.active : true;

      // Fetch existing heat config.
      let existingConfig = null;
      try {
        existingConfig = await E(
          /** @type {{ getHeatConfig: () => Promise<HeatConfig> }} */ (
            attenuator
          ),
        ).getHeatConfig();
      } catch {
        // No config yet.
      }

      /** @type {HeatConfig} */
      const config = {
        burstLimit: existingConfig ? existingConfig.burstLimit : 10,
        sustainedRate: existingConfig ? existingConfig.sustainedRate : 30,
        lockoutDurationMs: existingConfig
          ? existingConfig.lockoutDurationMs
          : 10_000,
        postLockoutPct: existingConfig ? existingConfig.postLockoutPct : 40,
      };

      disposeSim();
      patch({
        overlay: 'attenuator',
        attenuatorMember: invitedAs,
        attenuator,
        attenuatorActive: isActive,
        config,
        derivedText: deriveText(config),
      });
    } catch (err) {
      window.alert(
        `Failed to get attenuator: ${/** @type {Error} */ (err).message}`,
      );
    }
  };

  /** Persist the current heat config, debounced. */
  const debouncedSave = () => {
    const { attenuator } = state;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const run = async () => {
        try {
          await E(attenuator).setHeatConfig({ ...state.config });
        } catch (err) {
          console.error('[ChannelHeader] Failed to set heat config:', err);
        }
      };
      run().catch(window.reportError);
    }, 300);
  };

  /**
   * Apply a config field change: update state, push to the live simulation,
   * and debounce-save.
   * @param {Partial<HeatConfig>} fieldPatch
   */
  const updateConfig = fieldPatch => {
    const config = harden({ ...state.config, ...fieldPatch });
    patch({ config, derivedText: deriveText(config) });
    if (simInstance) simInstance.updateParams(config);
    debouncedSave();
  };

  const onBurst = /** @param {number} value */ value =>
    updateConfig({ burstLimit: value });
  const onSustained = /** @param {number} value */ value =>
    updateConfig({ sustainedRate: value });
  const onLockout = /** @param {number} value */ value =>
    updateConfig({ lockoutDurationMs: sliderToLockoutMs(value) });
  const onPostLockout = /** @param {number} value */ value =>
    updateConfig({ postLockoutPct: value });

  /** @param {boolean} checked */
  const onToggleValidity = checked => {
    const { attenuator } = state;
    const run = async () => {
      try {
        await E(attenuator).setInvitationValidity(checked);
      } catch (err) {
        window.alert(
          `Failed to set validity: ${/** @type {Error} */ (err).message}`,
        );
      }
    };
    run().catch(window.reportError);
  };

  /** @param {number} value */
  const onBanDurationChange = value => {
    patch({ banDuration: value });
  };

  const onApplyBan = () => {
    const { attenuator, banDuration } = state;
    const run = async () => {
      try {
        await E(attenuator).temporaryBan(banDuration);
        window.alert(`Temporary ban applied for ${banDuration} seconds.`);
      } catch (err) {
        window.alert(
          `Failed to apply ban: ${/** @type {Error} */ (err).message}`,
        );
      }
    };
    run().catch(window.reportError);
  };

  const onAttenuatorCopyLink = () => {
    if (!powers || !channelPetName) return;
    const run = async () => {
      try {
        const locator = await resolveLocator(powers, channelPetName, viewMode);
        if (locator === null) {
          window.alert(
            'Could not generate a shareable link. The daemon may not have network addresses configured.',
          );
          return;
        }
        window.prompt('Share this invite link:', locator);
      } catch (err) {
        window.alert(
          `Failed to generate link: ${/** @type {Error} */ (err).message}`,
        );
      }
    };
    run().catch(window.reportError);
  };

  const onAttenuatorMenuButton = () => {
    disposeSim();
    patch({
      overlay: 'menu',
      attenuatorMember: null,
      attenuator: null,
    });
  };

  const closeAttenuator = () => {
    disposeSim();
    showMembers().catch(window.reportError);
  };

  // ---- View ----

  /**
   * The whole header: menu button plus the active overlay.
   */
  const Header = () => {
    const { overlay } = state;
    if (overlay === 'attenuator' && state.attenuatorMember) {
      return h(AttenuatorModal, {
        invitedAs: state.attenuatorMember,
        isActive: state.attenuatorActive,
        config: state.config,
        banDuration: state.banDuration,
        derivedText: state.derivedText,
        canCopyLink: Boolean(powers && channelPetName),
        onMenuButton: onAttenuatorMenuButton,
        onClose: closeAttenuator,
        onToggleValidity,
        onBurst,
        onSustained,
        onLockout,
        onPostLockout,
        onBanDurationChange,
        onApplyBan,
        onCopyLink: onAttenuatorCopyLink,
      });
    }

    return h(
      Fragment,
      null,
      h(MenuButton, { onClick: toggleMenu }),
      overlay === 'menu'
        ? h(DropdownMenu, { viewMode, onAction: onMenuAction })
        : null,
      overlay === 'invite' && state.inviteeName
        ? h(InviteDeliveryModal, {
            inviteeName: state.inviteeName,
            sending: state.sending,
            onLink: onInviteLink,
            onContact: onInviteContact,
            onClose: closeInvite,
          })
        : null,
      overlay === 'members'
        ? h(MembersPanel, {
            members: state.members,
            onClose: closeMembers,
            onManage: invitedAs => {
              showAttenuatorModal(invitedAs).catch(window.reportError);
            },
          })
        : null,
    );
  };

  /**
   * After each confined render, mount the heat simulation host node into its
   * anchor (once per attenuator open) and re-parent it back if Preact replaced
   * the anchor element.
   */
  const bridgeHeatSim = () => {
    const $anchor = /** @type {HTMLElement | null} */ (
      $mount.querySelector('[data-heat-sim-anchor]')
    );
    if (!$anchor) {
      // Anchor gone (overlay changed) — drop any live simulation.
      disposeSim();
      return;
    }
    if (!simInstance) {
      simInstance = createHeatSimulation($anchor, { ...state.config });
      // `createHeatSimulation` appends its wrapper into `$anchor`; capture it so
      // we can re-parent it after a confined re-render rebuilds the anchor.
      simWrapper = /** @type {HTMLElement | null} */ (
        $anchor.querySelector('.heat-sim-wrapper')
      );
    } else if (simWrapper && !$anchor.querySelector('.heat-sim-wrapper')) {
      // Anchor was re-created by Preact; re-parent the existing wrapper.
      $anchor.appendChild(simWrapper);
    }
  };

  /**
   * Open an outside-click handler that closes the dropdown menu, mirroring the
   * original `document.addEventListener('click', …, { once: true })`. The
   * listener is attached on the NEXT tick so the click that opened the menu —
   * which is still bubbling toward `document` — does not immediately close it
   * (the original relied on the menu button's `stopPropagation`; the confined
   * `SafeEvent` facade is a narrower contract, so deferring is more robust).
   */
  const armOutsideClickClose = () => {
    clearOutsideClick();
    /** @type {(() => void) | null} */
    let detach = null;
    const timer = setTimeout(() => {
      const closeMenu = () => {
        outsideClickRemover = null;
        if (state.overlay === 'menu') {
          patch({ overlay: 'none' });
        }
      };
      document.addEventListener('click', closeMenu, { once: true });
      detach = () => document.removeEventListener('click', closeMenu);
    }, 0);
    outsideClickRemover = () => {
      clearTimeout(timer);
      if (detach) detach();
    };
  };

  /**
   * Render the confined header, bridge the heat-simulation host node, then
   * arm/disarm the dropdown's outside-click close to match the overlay.
   * `renderConfined` is synchronous, so the anchor exists when bridging runs.
   */
  const rerender = () => {
    renderConfined(h(Header, null), $mount);
    bridgeHeatSim();
    if (state.overlay === 'menu' && !outsideClickRemover) {
      armOutsideClickClose();
    } else if (state.overlay !== 'menu') {
      clearOutsideClick();
    }
  };

  rerender();

  return harden({
    dispose: () => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      clearOutsideClick();
      disposeSim();
      $mount.remove();
    },
  });
};
harden(createChannelHeader);
