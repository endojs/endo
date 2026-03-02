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
 * @property {string[]} pedigree
 * @property {boolean} active
 */

/**
 * Create the channel header component with invite and member management.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the header
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

  const render = () => {
    $container.innerHTML = `
      <div class="channel-header">
        <span class="channel-header-title">#${channelPetName || 'channel'}</span>
        <div class="channel-header-actions">
          <button type="button" class="channel-menu-btn" title="Channel actions">\u22EE</button>
          ${menuVisible ? renderMenu() : ''}
        </div>
      </div>
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
    const closeMenu = () => {
      if (menuVisible) {
        menuVisible = false;
        render();
      }
    };
    document.addEventListener('click', closeMenu, { once: true });
  };

  const handleInvite = async () => {
    const inviteeName = window.prompt('Enter a display name for the new member:');
    if (!inviteeName) return;

    try {
      const memberExo = await E(channel).invite(inviteeName);

      // Store the member in the host's pet store
      const memberPetName = window.prompt(
        'Enter a pet name to store this invitation under:',
        `member-${inviteeName.toLowerCase().replace(/\s+/g, '-')}`,
      );
      if (!memberPetName) return;

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
            `Invitation created for "${inviteeName}" and stored as "${memberPetName}". Share the member capability directly.`,
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
   * @param {MemberInfo[]} members
   */
  const renderMemberList = members => {
    const memberHtml = members
      .map(
        (m, i) => `
      <div class="channel-member-entry ${m.active ? '' : 'revoked'}">
        <span class="member-name">${m.active ? '' : '<s>'}\u201C${m.proposedName}\u201D${m.active ? '' : '</s>'}</span>
        <span class="member-pedigree">${
          m.pedigree.length > 0
            ? m.pedigree.join(' \u2192 ')
            : 'Creator'
        }</span>
        ${
          m.active
            ? `<button type="button" class="member-revoke-btn" data-name="${m.proposedName}">Revoke</button>`
            : ''
        }
      </div>
    `,
      )
      .join('');

    $container.innerHTML = `
      <div class="channel-header">
        <span class="channel-header-title">#${channelPetName || 'channel'}</span>
        <button type="button" class="channel-members-close" title="Close">&times;</button>
      </div>
      <div class="channel-members-panel">
        <h3>Your Invitations</h3>
        ${memberHtml}
      </div>
    `;

    const $close = $container.querySelector('.channel-members-close');
    if ($close) {
      $close.addEventListener('click', () => {
        manageMembersVisible = false;
        render();
      });
    }

    const $revokeButtons = $container.querySelectorAll('.member-revoke-btn');
    for (const $btn of $revokeButtons) {
      $btn.addEventListener('click', async () => {
        const memberName = /** @type {HTMLElement} */ ($btn).dataset.name;
        if (!memberName) return;
        try {
          await E(channel).revokeByName(memberName);
          // Refresh member list
          await showMembers();
        } catch (err) {
          window.alert(
            `Failed to revoke: ${/** @type {Error} */ (err).message}`,
          );
        }
      });
    }
  };

  render();

  return harden({
    dispose: () => {
      $container.innerHTML = '';
    },
  });
};
harden(createChannelHeader);
