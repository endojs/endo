// @ts-check

import harden from '@endo/harden';

/** @import { ERef } from '@endo/far' */

import { E } from '@endo/far';

import { formatDisplayName } from './display-name.js';
import { createHeatSimulation } from './heat-simulation.js';
import { deriveConstants, formatDuration } from './heat-engine.js';

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
 * @param {'chat' | 'forum' | 'outliner' | 'microblog'} [options.viewMode] - Current view mode
 * @param {(mode: 'chat' | 'forum' | 'outliner' | 'microblog') => void} [options.onViewModeChange] - Callback when view mode changes
 * @param {string} [options.proposedName] - The current user's display name in this channel (may be a proposal)
 * @param {boolean} [options.nameProposed] - True while `proposedName` is still awaiting confirmation from the user; when true the header shows a confirm banner and all UI renders the name in scare quotes
 * @param {(confirmedName: string) => void | Promise<void>} [options.onConfirmName] - Called when the user confirms their proposed name; the argument is the final name (possibly edited from the proposal)
 * @returns {ChannelHeaderAPI}
 */
export const createChannelHeader = ({
  $container,
  channel,
  powers,
  channelPetName,
  viewMode = 'chat',
  onViewModeChange,
  proposedName,
  nameProposed = false,
  onConfirmName,
}) => {
  /**
   * Local mirror of whether the name is still a proposal.  Flipped to
   * false by the confirm banner so the header re-renders without the
   * banner immediately, without waiting for a full re-mount.
   */
  let headerNameProposed = nameProposed;
  /**
   * Local mirror of the current proposed/confirmed name, so the user
   * can edit it inline from the banner before confirming.
   */
  let headerProposedName = proposedName || '';
  let menuVisible = false;
  let manageMembersVisible = false;
  /** @type {string | null} */
  let attenuatorModalMember = null;

  /**
   * Minimal HTML attribute escape for the proposal banner input.
   * Names are user-supplied and may contain characters that would
   * break out of the value attribute.
   * @param {string} s
   */
  const escapeAttr = s =>
    s
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const renderProposedNameBanner = () => {
    if (!headerNameProposed) return '';
    const quoted = formatDisplayName(headerProposedName || '', {
      proposed: true,
    });
    return `
      <div class="channel-name-proposal-banner" role="status">
        <span class="channel-name-proposal-label">Your name in this channel is proposed as</span>
        <input type="text" class="channel-name-proposal-input" value="${escapeAttr(headerProposedName)}" />
        <span class="channel-name-proposal-preview">${escapeAttr(quoted)}</span>
        <button type="button" class="channel-name-proposal-confirm">Confirm name</button>
      </div>
    `;
  };

  const render = () => {
    $container.innerHTML = `
      ${renderProposedNameBanner()}
      <button type="button" class="channel-menu-btn" title="Channel actions">\u22EE</button>
      ${menuVisible ? renderMenu() : ''}
    `;
    attachListeners();
  };

  const renderMenu = () => `
    <div class="channel-menu">
      <div class="channel-menu-section">
        <div class="channel-menu-label">View as</div>
        <button type="button" class="channel-menu-item view-mode-item ${viewMode === 'chat' ? 'active' : ''}" data-action="view-chat">
          Chat
        </button>
        <button type="button" class="channel-menu-item view-mode-item ${viewMode === 'forum' ? 'active' : ''}" data-action="view-forum">
          Forum
        </button>
        <button type="button" class="channel-menu-item view-mode-item ${viewMode === 'outliner' ? 'active' : ''}" data-action="view-outliner">
          Outliner
        </button>
        <button type="button" class="channel-menu-item view-mode-item ${viewMode === 'microblog' ? 'active' : ''}" data-action="view-microblog">
          Microblog
        </button>
      </div>
      <div class="channel-menu-divider"></div>
      <button type="button" class="channel-menu-item" data-action="invite">
        Create Invitation
      </button>
      <button type="button" class="channel-menu-item" data-action="members">
        Manage Members
      </button>
    </div>
  `;

  const attachListeners = () => {
    // Proposed-name confirm banner handlers — only present while the
    // invitee has not yet confirmed their display name.
    const $proposalInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('.channel-name-proposal-input')
    );
    if ($proposalInput) {
      $proposalInput.addEventListener('input', () => {
        headerProposedName = $proposalInput.value;
        const $preview = $container.querySelector(
          '.channel-name-proposal-preview',
        );
        if ($preview) {
          $preview.textContent = formatDisplayName(headerProposedName, {
            proposed: true,
          });
        }
      });
      $proposalInput.addEventListener('keydown', e => {
        const keyEvent = /** @type {KeyboardEvent} */ (e);
        if (keyEvent.key === 'Enter') {
          keyEvent.preventDefault();
          const $confirmBtn = $container.querySelector(
            '.channel-name-proposal-confirm',
          );
          if ($confirmBtn instanceof HTMLButtonElement) {
            $confirmBtn.click();
          }
        }
      });
    }
    const $proposalConfirm = $container.querySelector(
      '.channel-name-proposal-confirm',
    );
    if ($proposalConfirm) {
      $proposalConfirm.addEventListener('click', async () => {
        const finalName = (headerProposedName || '').trim();
        if (!finalName) return;
        headerNameProposed = false;
        headerProposedName = finalName;
        // If the user edited the proposal, push the new name to the
        // daemon so other members see it too.  setProposedName is only
        // available on member handles (joiners), not on the raw
        // channel (admin) — gracefully ignore failures.
        try {
          const typedMember =
            /** @type {{ setProposedName?: (name: string) => Promise<void> }} */ (
              channel
            );
          if (typedMember && typeof typedMember.setProposedName === 'function') {
            await E(typedMember).setProposedName(finalName);
          }
        } catch (err) {
          console.warn(
            '[ChannelHeader] setProposedName failed (non-fatal):',
            err,
          );
        }
        if (onConfirmName) {
          try {
            await onConfirmName(finalName);
          } catch (err) {
            console.warn('[ChannelHeader] onConfirmName failed:', err);
          }
        }
        render();
      });
    }

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
        } else if (
          action === 'view-chat' ||
          action === 'view-forum' ||
          action === 'view-outliner' ||
          action === 'view-microblog'
        ) {
          const newMode = /** @type {'chat' | 'forum' | 'outliner' | 'microblog'} */ (
            action.replace('view-', '')
          );
          if (newMode !== viewMode && onViewModeChange) {
            viewMode = newMode;
            onViewModeChange(newMode);
          }
          render();
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
    const inviteeName = window.prompt(
      'Enter a display name for the new member:',
    );
    if (!inviteeName) return;

    try {
      // Pass the current view mode as an invitation hint. Recipients that
      // have no stored preference for this channel will open it in the
      // inviter's recommended view on first join.
      await E(channel).createInvitation(inviteeName, {
        suggestedViewMode: viewMode,
      });

      // Ask how to deliver the invitation
      if (powers && channelPetName) {
        // Show delivery options modal.
        // NOTE: render() must NOT be called while the modal is open —
        // it replaces $container.innerHTML, which would destroy the modal.
        const $modal = document.createElement('div');
        $modal.className = 'invite-delivery-modal';
        $modal.innerHTML = `
          <div class="invite-delivery-content">
            <h3>Invitation created for \u201C${inviteeName}\u201D</h3>
            <p>How would you like to share it?</p>
            <div class="invite-delivery-actions">
              <button type="button" class="invite-delivery-btn" data-action="link">Copy Link</button>
              <button type="button" class="invite-delivery-btn" data-action="contact">Send to Contact</button>
            </div>
            <button type="button" class="invite-delivery-close">&times;</button>
          </div>
        `;
        $container.appendChild($modal);

        const $linkBtn = /** @type {HTMLButtonElement} */ (
          $modal.querySelector('[data-action="link"]')
        );
        const $contactBtn = /** @type {HTMLButtonElement} */ (
          $modal.querySelector('[data-action="contact"]')
        );
        const $closeBtn = /** @type {HTMLButtonElement} */ (
          $modal.querySelector('.invite-delivery-close')
        );

        const closeModal = () => {
          $modal.remove();
          render();
        };

        $closeBtn.addEventListener('click', closeModal);

        $linkBtn.addEventListener('click', async () => {
          $modal.remove();
          try {
            let rawLocator;
            try {
              rawLocator = await E(
                /** @type {{ locateForSharing: (...args: string[]) => Promise<string> }} */ (
                  powers
                ),
              ).locateForSharing(channelPetName);
            } catch {
              rawLocator = await E(
                /** @type {{ locate: (...args: string[]) => Promise<string> }} */ (
                  powers
                ),
              ).locate(channelPetName);
            }
            if (!rawLocator || !String(rawLocator).startsWith('endo://')) {
              window.alert(
                'Could not generate a shareable link. The daemon may not have network addresses configured.',
              );
              render();
              return;
            }
            let locator = /** @type {string} */ (rawLocator);
            if (viewMode && viewMode !== 'chat') {
              locator = `${locator}&view=${viewMode}`;
            }
            // Carry the inviter-suggested display name as an optional
            // `name` query param.  The invitee's join flow pre-populates
            // their display-name field with this value, but treats it
            // as a proposal they can accept or edit before confirming.
            if (inviteeName) {
              locator = `${locator}&name=${encodeURIComponent(inviteeName)}`;
            }
            window.prompt(
              'Share this locator with the invitee:',
              locator,
            );
          } catch {
            window.alert(
              `Invitation created for "${inviteeName}". Share the channel locator directly.`,
            );
          }
          render();
        });

        $contactBtn.addEventListener('click', async () => {
          const contactName = window.prompt(
            'Pet name of the contact to send invitation to:',
          );
          if (!contactName) {
            closeModal();
            return;
          }
          $contactBtn.disabled = true;
          $contactBtn.textContent = 'Sending\u2026';
          try {
            // Send channel reference to the contact's inbox
            const edgeName = channelPetName;
            await E(
              /** @type {{ send: (to: string, strings: string[], edgeNames: string[], petNames: string[]) => Promise<void> }} */ (
                powers
              ),
            ).send(
              contactName,
              [
                `You\u2019ve been invited to join `,
                `. Join the channel to participate.`,
              ],
              [edgeName],
              [channelPetName],
            );
            closeModal();
            window.alert(`Invitation sent to @${contactName}.`);
          } catch (err) {
            $contactBtn.disabled = false;
            $contactBtn.textContent = 'Send to Contact';
            window.alert(
              `Failed to send: ${/** @type {Error} */ (err).message}`,
            );
          }
        });
        // Return early — render() is deferred until the modal closes.
        return;
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
      const [attenuator, members] = await Promise.all([
        E(channel).getAttenuator(invitedAs),
        /** @type {Promise<MemberInfo[]>} */ (E(channel).getMembers()),
      ]);
      const memberInfo = members.find(m => m.invitedAs === invitedAs);
      const isActive = memberInfo ? memberInfo.active : true;
      await renderAttenuatorModal(invitedAs, attenuator, isActive);
    } catch (err) {
      window.alert(
        `Failed to get attenuator: ${/** @type {Error} */ (err).message}`,
      );
    }
  };

  /** @type {ReturnType<typeof createHeatSimulation> | null} */
  let simInstance = null;

  /**
   * Log-scale conversion for lockout duration slider.
   * Maps 0–100 slider → 2000ms–259200000ms (2s–72h).
   * @param {number} sliderVal - 0 to 100
   * @returns {number} ms
   */
  const sliderToLockoutMs = sliderVal => {
    const minLog = Math.log(2000);
    const maxLog = Math.log(259200000);
    return Math.round(Math.exp(minLog + (sliderVal / 100) * (maxLog - minLog)));
  };

  /**
   * @param {number} ms
   * @returns {number} slider 0–100
   */
  const lockoutMsToSlider = ms => {
    const minLog = Math.log(2000);
    const maxLog = Math.log(259200000);
    return Math.round(((Math.log(ms) - minLog) / (maxLog - minLog)) * 100);
  };

  /**
   * @param {string} invitedAs
   * @param {object} attenuator
   * @param {boolean} isActive
   */
  const renderAttenuatorModal = async (invitedAs, attenuator, isActive) => {
    // Fetch existing heat config
    let existingConfig = null;
    try {
      existingConfig = await E(attenuator).getHeatConfig();
    } catch {
      // No config yet
    }

    const burstLimit = existingConfig ? existingConfig.burstLimit : 10;
    const sustainedRate = existingConfig ? existingConfig.sustainedRate : 30;
    const lockoutDurationMs = existingConfig
      ? existingConfig.lockoutDurationMs
      : 10000;
    const postLockoutPct = existingConfig ? existingConfig.postLockoutPct : 40;
    const lockoutSlider = lockoutMsToSlider(lockoutDurationMs);

    $container.innerHTML = `
      <button type="button" class="channel-menu-btn" title="Channel actions">\u22EE</button>
      <div class="channel-attenuator-modal">
        <div class="channel-attenuator-header">
          <h3>Manage: \u201C${invitedAs}\u201D</h3>
          <button type="button" class="channel-attenuator-close" title="Close">&times;</button>
        </div>
        <div class="channel-attenuator-body">
          <label class="attenuator-field">
            <span>Enabled</span>
            <input type="checkbox" class="attenuator-valid" ${isActive ? 'checked' : ''} />
          </label>

          <div class="heat-slider-field">
            <label>Burst limit: <span class="heat-burst-val">${burstLimit}</span></label>
            <input type="range" class="heat-burst-slider" min="3" max="30" value="${burstLimit}" />
          </div>

          <div class="heat-slider-field">
            <label>Sustained rate: <span class="heat-sustained-val">${sustainedRate}</span> msg/min</label>
            <input type="range" class="heat-sustained-slider" min="1" max="60" value="${sustainedRate}" />
          </div>

          <div class="heat-slider-field">
            <label>Cooldown: <span class="heat-lockout-val">${formatDuration(lockoutDurationMs)}</span></label>
            <input type="range" class="heat-lockout-slider" min="0" max="100" value="${lockoutSlider}" />
          </div>

          <details class="heat-advanced">
            <summary>Advanced</summary>
            <div class="heat-slider-field">
              <label>Post-lockout heat: <span class="heat-postlockout-val">${postLockoutPct}%</span></label>
              <input type="range" class="heat-postlockout-slider" min="0" max="100" value="${postLockoutPct}" />
            </div>
            <div class="heat-derived-params">
              <!-- Filled by updateDerived -->
            </div>
          </details>

          <div class="heat-sim-container"></div>

          <div class="attenuator-field">
            <button type="button" class="attenuator-copy-link-btn">Copy Invite Link</button>
          </div>

          <div class="attenuator-field">
            <span>Emergency ban</span>
            <div class="attenuator-ban-row">
              <input type="number" class="attenuator-ban-duration" value="60" min="1" />
              <button type="button" class="attenuator-ban-btn">Apply Ban</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Current config state
    const config = {
      burstLimit,
      sustainedRate,
      lockoutDurationMs,
      postLockoutPct,
    };

    // Initialize simulation chart
    const $simContainer = $container.querySelector('.heat-sim-container');
    if ($simContainer) {
      simInstance = createHeatSimulation(
        /** @type {HTMLElement} */ ($simContainer),
        config,
      );
    }

    const updateDerived = () => {
      const { heatPerMessage, coolRate } = deriveConstants(config);
      const $derived = $container.querySelector('.heat-derived-params');
      if ($derived) {
        $derived.textContent = `Heat/msg: ${heatPerMessage.toFixed(1)} | Cool rate: ${coolRate.toFixed(2)}/s`;
      }
    };
    updateDerived();

    /** @type {ReturnType<typeof setTimeout> | null} */
    let debounceTimer = null;

    const debouncedSave = () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          await E(attenuator).setHeatConfig({ ...config });
        } catch (err) {
          console.error('[ChannelHeader] Failed to set heat config:', err);
        }
      }, 300);
    };

    // Slider listeners
    const $burstSlider = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('.heat-burst-slider')
    );
    const $burstVal = $container.querySelector('.heat-burst-val');
    if ($burstSlider) {
      $burstSlider.addEventListener('input', () => {
        config.burstLimit = Number($burstSlider.value);
        if ($burstVal) $burstVal.textContent = $burstSlider.value;
        updateDerived();
        if (simInstance) simInstance.updateParams(config);
        debouncedSave();
      });
    }

    const $sustainedSlider = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('.heat-sustained-slider')
    );
    const $sustainedVal = $container.querySelector('.heat-sustained-val');
    if ($sustainedSlider) {
      $sustainedSlider.addEventListener('input', () => {
        config.sustainedRate = Number($sustainedSlider.value);
        if ($sustainedVal) $sustainedVal.textContent = $sustainedSlider.value;
        updateDerived();
        if (simInstance) simInstance.updateParams(config);
        debouncedSave();
      });
    }

    const $lockoutSlider = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('.heat-lockout-slider')
    );
    const $lockoutVal = $container.querySelector('.heat-lockout-val');
    if ($lockoutSlider) {
      $lockoutSlider.addEventListener('input', () => {
        config.lockoutDurationMs = sliderToLockoutMs(
          Number($lockoutSlider.value),
        );
        if ($lockoutVal)
          $lockoutVal.textContent = formatDuration(config.lockoutDurationMs);
        updateDerived();
        if (simInstance) simInstance.updateParams(config);
        debouncedSave();
      });
    }

    const $postLockoutSlider = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('.heat-postlockout-slider')
    );
    const $postLockoutVal = $container.querySelector('.heat-postlockout-val');
    if ($postLockoutSlider) {
      $postLockoutSlider.addEventListener('input', () => {
        config.postLockoutPct = Number($postLockoutSlider.value);
        if ($postLockoutVal)
          $postLockoutVal.textContent = `${$postLockoutSlider.value}%`;
        updateDerived();
        if (simInstance) simInstance.updateParams(config);
        debouncedSave();
      });
    }

    // Re-attach menu button listener
    const $menuBtn = $container.querySelector('.channel-menu-btn');
    if ($menuBtn) {
      $menuBtn.addEventListener('click', e => {
        e.stopPropagation();
        attenuatorModalMember = null;
        manageMembersVisible = false;
        if (simInstance) {
          simInstance.dispose();
          simInstance = null;
        }
        menuVisible = !menuVisible;
        render();
      });
    }

    const $close = $container.querySelector('.channel-attenuator-close');
    if ($close) {
      $close.addEventListener('click', async () => {
        attenuatorModalMember = null;
        manageMembersVisible = true;
        if (simInstance) {
          simInstance.dispose();
          simInstance = null;
        }
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

    const $banBtn = $container.querySelector('.attenuator-ban-btn');
    const $banDuration = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('.attenuator-ban-duration')
    );
    if ($banBtn && $banDuration) {
      $banBtn.addEventListener('click', async () => {
        try {
          await E(attenuator).temporaryBan(Number($banDuration.value));
          window.alert(
            `Temporary ban applied for ${$banDuration.value} seconds.`,
          );
        } catch (err) {
          window.alert(
            `Failed to apply ban: ${/** @type {Error} */ (err).message}`,
          );
        }
      });
    }

    const $copyLinkBtn = $container.querySelector('.attenuator-copy-link-btn');
    if ($copyLinkBtn && powers && channelPetName) {
      $copyLinkBtn.addEventListener('click', async () => {
        try {
          // Try locateForSharing (host), fall back to locate (guest/directory)
          let rawLocator;
          try {
            rawLocator = await E(
              /** @type {{ locateForSharing: (...args: string[]) => Promise<string> }} */ (
                powers
              ),
            ).locateForSharing(channelPetName);
          } catch {
            rawLocator = await E(
              /** @type {{ locate: (...args: string[]) => Promise<string> }} */ (
                powers
              ),
            ).locate(channelPetName);
          }
          if (!rawLocator || !String(rawLocator).startsWith('endo://')) {
            window.alert(
              'Could not generate a shareable link. The daemon may not have network addresses configured.',
            );
            return;
          }
          let locator = /** @type {string} */ (rawLocator);
          if (viewMode && viewMode !== 'chat') {
            locator = `${locator}&view=${viewMode}`;
          }
          // Include the inviter-suggested name so the invitee's join
          // flow can pre-populate the field as a proposal.
          if (attenuatorModalMember) {
            locator = `${locator}&name=${encodeURIComponent(
              attenuatorModalMember,
            )}`;
          }
          window.prompt(
            'Share this invite link:',
            locator,
          );
        } catch (err) {
          window.alert(
            `Failed to generate link: ${/** @type {Error} */ (err).message}`,
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
        <span class="member-name">\u201C${m.proposedName}\u201D</span>
        <span class="member-pedigree">${
          m.pedigree.length > 0 ? m.pedigree.join(' \u2192 ') : 'Creator'
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

  render();

  return harden({
    dispose: () => {
      if (simInstance) {
        simInstance.dispose();
        simInstance = null;
      }
      $container.innerHTML = '';
    },
  });
};
harden(createChannelHeader);
