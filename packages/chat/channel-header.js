// @ts-check
/* global document, window */

/** @import { ERef } from '@endo/far' */

import { E } from '@endo/far';

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
 * Create the channel header actions component (menu button + dropdown).
 * Renders into a sub-container within the conversation header bar,
 * without replacing the header's title or back button.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the actions
 * @param {unknown} options.channel - Channel or ChannelMember reference
 * @param {unknown} options.powers - Host powers for locator generation
 * @param {string} [options.channelPetName] - Pet name of the channel
 * @returns {ChannelHeaderAPI}
 */
export const createChannelHeader = ({
  $container,
  channel,
  powers,
  channelPetName,
}) => {
  let menuVisible = false;
  let manageMembersVisible = false;
  /** @type {string | null} */
  let attenuatorModalMember = null;

  const render = () => {
    $container.innerHTML = `
      <button type="button" class="channel-menu-btn" title="Channel actions">\u22EE</button>
      ${menuVisible ? renderMenu() : ''}
    `;
    attachListeners();
  };

  const renderMenu = () => `
    <div class="channel-menu">
      <button type="button" class="channel-menu-item" data-action="invite">
        Create Invitation
      </button>
      <button type="button" class="channel-menu-item" data-action="members">
        Manage Members
      </button>
    </div>
  `;

  const attachListeners = () => {
    const $menuBtn = $container.querySelector('.channel-menu-btn');
    if ($menuBtn) {
      $menuBtn.addEventListener('click', e => {
        e.stopPropagation();
        menuVisible = !menuVisible;
        manageMembersVisible = false;
        render();
      });
    }

    const $menuItems = $container.querySelectorAll('.channel-menu-item');
    for (const $item of $menuItems) {
      $item.addEventListener('click', async e => {
        e.stopPropagation();
        const action = /** @type {HTMLElement} */ ($item).dataset.action;
        menuVisible = false;

        if (action === 'invite') {
          await handleInvite();
        } else if (action === 'members') {
          manageMembersVisible = !manageMembersVisible;
          if (manageMembersVisible) {
            await showMembers();
          } else {
            render();
          }
        }
      });
    }

    // Close menu on outside click
    if (menuVisible) {
      const closeMenu = () => {
        if (menuVisible) {
          menuVisible = false;
          render();
        }
      };
      document.addEventListener('click', closeMenu, { once: true });
    }
  };

  const handleInvite = async () => {
    const inviteeName = window.prompt('Enter a display name for the new member:');
    if (!inviteeName) return;

    try {
      await E(channel).invite(inviteeName);

      // Generate a locator for sharing
      if (powers && channelPetName) {
        try {
          const locator = await E(
            /** @type {{ locate: (...args: string[]) => Promise<string> }} */ (
              powers
            ),
          ).locate(channelPetName);
          window.prompt(
            'Share this locator with the invitee:',
            /** @type {string} */ (locator),
          );
        } catch {
          // Locator generation optional
          window.alert(
            `Invitation created for "${inviteeName}". Share the channel locator directly.`,
          );
        }
      }
    } catch (err) {
      window.alert(
        `Failed to create invitation: ${/** @type {Error} */ (err).message}`,
      );
    }
    render();
  };

  const showMembers = async () => {
    try {
      const members = /** @type {MemberInfo[]} */ (
        await E(channel).getMembers()
      );
      renderMemberList(members);
    } catch (err) {
      console.error('[ChannelHeader] Failed to get members:', err);
      render();
    }
  };

  /**
   * Show attenuator modal for a given invitation name.
   * @param {string} invitedAs
   */
  const showAttenuatorModal = async invitedAs => {
    attenuatorModalMember = invitedAs;
    try {
      const attenuator = await E(channel).getAttenuator(invitedAs);
      renderAttenuatorModal(invitedAs, attenuator);
    } catch (err) {
      window.alert(
        `Failed to get attenuator: ${/** @type {Error} */ (err).message}`,
      );
    }
  };

  /**
   * @param {string} invitedAs
   * @param {object} attenuator
   */
  const renderAttenuatorModal = (invitedAs, attenuator) => {
    $container.innerHTML = `
      <button type="button" class="channel-menu-btn" title="Channel actions">\u22EE</button>
      <div class="channel-attenuator-modal">
        <div class="channel-attenuator-header">
          <h3>Manage: "${invitedAs}"</h3>
          <button type="button" class="channel-attenuator-close" title="Close">&times;</button>
        </div>
        <div class="channel-attenuator-body">
          <label class="attenuator-field">
            <span>Enabled</span>
            <input type="checkbox" class="attenuator-valid" checked />
          </label>
          <label class="attenuator-field">
            <span>Rate limit (msg/sec, 0=unlimited)</span>
            <input type="number" class="attenuator-rate" value="0" min="0" step="0.1" />
          </label>
          <div class="attenuator-field">
            <span>Temporary ban (seconds)</span>
            <div class="attenuator-ban-row">
              <input type="number" class="attenuator-ban-duration" value="60" min="1" />
              <button type="button" class="attenuator-ban-btn">Apply Ban</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Re-attach menu button listener
    const $menuBtn = $container.querySelector('.channel-menu-btn');
    if ($menuBtn) {
      $menuBtn.addEventListener('click', e => {
        e.stopPropagation();
        attenuatorModalMember = null;
        manageMembersVisible = false;
        menuVisible = !menuVisible;
        render();
      });
    }

    const $close = $container.querySelector('.channel-attenuator-close');
    if ($close) {
      $close.addEventListener('click', async () => {
        attenuatorModalMember = null;
        manageMembersVisible = true;
        await showMembers();
      });
    }

    const $validCheckbox = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('.attenuator-valid')
    );
    if ($validCheckbox) {
      $validCheckbox.addEventListener('change', async () => {
        try {
          await E(attenuator).setInvitationValidity($validCheckbox.checked);
        } catch (err) {
          window.alert(
            `Failed to set validity: ${/** @type {Error} */ (err).message}`,
          );
        }
      });
    }

    const $rateInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('.attenuator-rate')
    );
    if ($rateInput) {
      $rateInput.addEventListener('change', async () => {
        try {
          await E(attenuator).setRateLimit(Number($rateInput.value));
        } catch (err) {
          window.alert(
            `Failed to set rate limit: ${/** @type {Error} */ (err).message}`,
          );
        }
      });
    }

    const $banBtn = $container.querySelector('.attenuator-ban-btn');
    const $banDuration = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('.attenuator-ban-duration')
    );
    if ($banBtn && $banDuration) {
      $banBtn.addEventListener('click', async () => {
        try {
          await E(attenuator).temporaryBan(Number($banDuration.value));
          window.alert(`Temporary ban applied for ${$banDuration.value} seconds.`);
        } catch (err) {
          window.alert(
            `Failed to apply ban: ${/** @type {Error} */ (err).message}`,
          );
        }
      });
    }
  };

  /**
   * @param {MemberInfo[]} members
   */
  const renderMemberList = members => {
    const memberHtml = members
      .map(
        m => `
      <div class="channel-member-entry ${m.active ? '' : 'disabled'}">
        <span class="member-name">${m.active ? '' : '<s>'}\u201C${m.proposedName}\u201D${m.active ? '' : '</s>'}</span>
        <span class="member-pedigree">${
          m.pedigree.length > 0
            ? m.pedigree.join(' \u2192 ')
            : 'Creator'
        }</span>
        <button type="button" class="member-manage-btn" data-invited-as="${m.invitedAs}">Manage</button>
      </div>
    `,
      )
      .join('');

    $container.innerHTML = `
      <button type="button" class="channel-menu-btn" title="Channel actions">\u22EE</button>
      <div class="channel-members-panel">
        <div class="channel-members-panel-header">
          <h3>Your Invitations</h3>
          <button type="button" class="channel-members-close" title="Close">&times;</button>
        </div>
        ${memberHtml || '<p class="channel-members-empty">No invitations yet.</p>'}
      </div>
    `;

    // Re-attach menu button listener
    const $menuBtn = $container.querySelector('.channel-menu-btn');
    if ($menuBtn) {
      $menuBtn.addEventListener('click', e => {
        e.stopPropagation();
        manageMembersVisible = false;
        menuVisible = !menuVisible;
        render();
      });
    }

    const $close = $container.querySelector('.channel-members-close');
    if ($close) {
      $close.addEventListener('click', () => {
        manageMembersVisible = false;
        render();
      });
    }

    const $manageButtons = $container.querySelectorAll('.member-manage-btn');
    for (const $btn of $manageButtons) {
      $btn.addEventListener('click', async () => {
        const invitedAs = /** @type {HTMLElement} */ ($btn).dataset.invitedAs;
        if (!invitedAs) return;
        await showAttenuatorModal(invitedAs);
      });
    }
  };

  // Suppress unused variable warning
  void attenuatorModalMember;

  render();

  return harden({
    dispose: () => {
      $container.innerHTML = '';
    },
  });
};
harden(createChannelHeader);
