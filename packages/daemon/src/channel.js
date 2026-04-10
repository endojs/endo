// @ts-check
/* eslint-disable no-await-in-loop */

import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';
import { makeIteratorRef } from './reader-ref.js';
import { makeChangeTopic } from './pubsub.js';
import {
  AsyncIteratorInterface,
  AttenuatorInterface,
  ChannelInterface,
  ChannelInvitationInterface,
  ChannelMemberInterface,
} from './interfaces.js';
import { makeHelp } from './help-text.js';

/** @import { Context, EndoChannel, EndoChannelMember, ChannelMessage, FormulaIdentifier, FormulaNumber, PetName, Provide, StoreController, Topic } from './types.js' */

/**
 * Minimal async iterator interface matching the AsyncIteratorInterface
 * exo guard (next takes 0 arguments).
 *
 * @template T
 * @typedef {object} IterRef
 * @property {() => Promise<IteratorResult<T>>} next
 * @property {(value: any) => Promise<IteratorResult<T>>} return
 * @property {(error: any) => Promise<IteratorResult<T>>} throw
 */

/**
 * @type {Record<string, string>}
 */
const channelHelp = {
  '': `\
EndoChannel - A multi-party chat room with capability-secure invitations.

Members can post messages, follow the message stream, and invite new members.
Each member has a proposed name and a pedigree chain showing their invitation path.`,
  post: 'Post a message to the channel.',
  followMessages: 'Subscribe to all messages (existing and future).',
  listMessages: 'List all messages posted so far.',
  createInvitation:
    'Create a new channel invitation; returns [invitation, attenuator].',
  join: 'Join the channel as a member with the given proposed name (requires a prior invitation).',
  getMembers: 'List all members with their proposed names and pedigree chains.',
  getProposedName: 'Get the proposed display name for this channel or member.',
  getMemberId: 'Get the stable member ID for this channel admin.',
  getAttenuator: 'Get an attenuator for a previously invited member by name.',
};
harden(channelHelp);

const channelMemberHelp = {
  '': `\
EndoChannelMember - A member handle for a multi-party channel.

Use this to post messages, follow the stream, and invite others.`,
  post: 'Post a message to the channel.',
  setProposedName: 'Change your display name in the channel.',
  followMessages: 'Subscribe to all messages (existing and future).',
  listMessages: 'List all messages posted so far.',
  createInvitation:
    'Create a new sub-member invitation with the given proposed name.',
  getMembers: 'List all members with their proposed names and pedigree chains.',
  getProposedName: 'Get your proposed display name.',
  getMemberId: 'Get your stable member ID in the channel.',
  getAttenuator: 'Get an attenuator for a previously invited member by name.',
};
harden(channelMemberHelp);

const channelInvitationHelp = {
  '': `\
EndoChannelInvitation - An invitation to join a channel.

Call join(proposedName) to accept the invitation and get a channel handle.`,
  join: 'Accept this invitation and join the channel with the given proposed name.',
};
harden(channelInvitationHelp);

/**
 * @param {object} args
 * @param {Provide} args.provide
 * @param {(value: import('@endo/pass-style').Passable) => Promise<FormulaIdentifier>} args.persistValue
 * @param {() => Promise<string>} args.randomHex256
 */
/**
 * @param {object} args
 * @param {Provide} args.provide
 * @param {(storeId: FormulaIdentifier) => Promise<StoreController>} args.provideStoreController
 * @param {(value: import('@endo/pass-style').Passable) => Promise<FormulaIdentifier>} args.persistValue
 * @param {() => Promise<string>} args.randomHex256
 */
export const makeChannelMaker = ({
  provide,
  provideStoreController,
  persistValue,
  randomHex256,
}) => {
  /**
   * @param {FormulaIdentifier} channelId
   * @param {FormulaIdentifier} handleId
   * @param {FormulaIdentifier} creatorAgentId
   * @param {FormulaIdentifier} messageStoreId
   * @param {FormulaIdentifier} memberStoreId
   * @param {string} proposedName
   * @param {Context} context
   */
  const makeChannel = async (
    channelId,
    handleId,
    creatorAgentId,
    messageStoreId,
    memberStoreId,
    proposedName,
    context,
  ) => {
    context.thisDiesIfThatDies(handleId);
    context.thisDiesIfThatDies(messageStoreId);
    context.thisDiesIfThatDies(memberStoreId);

    const messageStore = await provideStoreController(messageStoreId);
    const memberStore = await provideStoreController(memberStoreId);

    /** @type {ChannelMessage[]} */
    const messages = [];

    /** @type {Topic<ChannelMessage>} */
    const messagesTopic = makeChangeTopic();

    let nextMessageNumber = 0n;

    // Rehydrate messages from store on incarnation
    const existingNames = messageStore.list();
    for (const name of existingNames) {
      const id = messageStore.identifyLocal(name);
      if (id !== undefined) {
        const value = await provide(/** @type {FormulaIdentifier} */ (id));
        if (value && typeof value === 'object') {
          const raw = /** @type {any} */ (value);
          // Migrate old-format messages: rename edgeNames->names, add type/messageId
          /** @type {ChannelMessage} */
          const msg =
            raw.type === 'package'
              ? raw
              : harden({
                  type: 'package',
                  messageId: /** @type {FormulaNumber} */ (
                    raw.messageId || '0'
                  ),
                  number: raw.number,
                  date: raw.date,
                  memberId: raw.memberId || '0',
                  strings: raw.strings,
                  names: raw.edgeNames || raw.names || [],
                  ids: raw.ids || [],
                  replyTo: raw.replyTo,
                  replyType: raw.replyType,
                });
          messages.push(msg);
          if (msg.number >= nextMessageNumber) {
            nextMessageNumber = msg.number + 1n;
          }
        }
      }
    }
    // Sort by message number
    messages.sort((a, b) => {
      if (a.number < b.number) return -1;
      if (a.number > b.number) return 1;
      return 0;
    });

    // Stable member ID counter. Admin is '0'.
    const adminMemberId = '0';
    let nextMemberIdNum = 1;

    /**
     * @typedef {object} HeatConfig
     * @property {number} burstLimit - Max messages in a burst (3–30)
     * @property {number} sustainedRate - Messages per minute sustained (1–60)
     * @property {number} lockoutDurationMs - Lockout duration in ms
     * @property {number} postLockoutPct - Heat percentage after lockout ends (0–100)
     */

    /**
     * @typedef {object} MemberEntry
     * @property {string} proposedName - Current display name (may be changed by the member)
     * @property {string} invitedAs - Original name given by the inviter (bookkeeping only)
     * @property {string} memberId - Stable identifier for this member
     * @property {string} inviterMemberId - memberId of the member who created this invitation
     * @property {string[]} pedigree - Invitation chain
     * @property {boolean} valid - true = active, false = disabled
     * @property {boolean} joined - true = invitation has been claimed via join()
     * @property {HeatConfig | null} heatConfig - Heat-based rate limiting config, null = unrestricted
     * @property {number} temporaryBanUntil - epoch ms, 0 = no ban
     */

    const HEAT_LOCKOUT_THRESHOLD = 90;

    /**
     * Shared heat state per member. Maps memberId to live heat state,
     * enabling getHopInfo() to read any member's heat externally.
     * @type {Map<string, { heat: number, locked: boolean, lockEndTime: number, lastHeatUpdateTime: number }>}
     */
    const heatStates = new Map();

    /**
     * All member entries by memberId, for ancestor chain traversal.
     * @type {Map<string, MemberEntry>}
     */
    const memberEntries = new Map();

    /** @type {Topic<{ type: string, hopMemberId: string, heat: number, locked: boolean, lockEndTime: number, timestamp: number }>} */
    const heatEventsTopic = makeChangeTopic();

    /**
     * Invitation registry: maps `${inviterMemberId}:${invitedAs}` to
     * the invitation record, enabling channel.join() to find the right
     * invitation and delegate.
     * @type {Map<string, { invitation: object, entry: MemberEntry, attenuator: object }>}
     */
    const invitationRegistry = new Map();

    /**
     * Persist a member entry to the memberStore.
     * @param {MemberEntry} entry
     */
    const persistMemberEntry = async entry => {
      const persistable = harden({
        proposedName: entry.proposedName,
        invitedAs: entry.invitedAs,
        memberId: entry.memberId,
        inviterMemberId: entry.inviterMemberId,
        pedigree: [...entry.pedigree],
        valid: entry.valid,
        joined: entry.joined,
        heatConfig: entry.heatConfig,
        temporaryBanUntil: entry.temporaryBanUntil,
      });
      const formulaId = await persistValue(persistable);
      await memberStore.storeIdentifier(
        /** @type {PetName} */ (`member-${entry.memberId}`),
        formulaId,
      );
    };

    /**
     * Build an array of member IDs corresponding to the pedigree chain,
     * by walking up the inviterMemberId chain from the given entry.
     * Returns IDs in the same order as the pedigree array (oldest ancestor first).
     * @param {MemberEntry} entry
     * @returns {string[]}
     */
    const buildPedigreeMemberIds = entry => {
      const ids = [];
      let currentId = entry.inviterMemberId;
      while (currentId && memberEntries.has(currentId)) {
        ids.unshift(currentId);
        const parent = /** @type {MemberEntry} */ (
          memberEntries.get(currentId)
        );
        currentId = parent.inviterMemberId;
      }
      return ids;
    };

    /**
     * Internal: post a message from an identified member.
     * @param {string} memberId
     * @param {string[]} strings
     * @param {string[]} names
     * @param {FormulaIdentifier[]} ids
     * @param {string} [replyTo]
     * @param {string} [replyType]
     */
    const postInternal = async (
      memberId,
      strings,
      names,
      ids,
      replyTo,
      replyType,
    ) => {
      const messageNumber = nextMessageNumber;
      nextMessageNumber += 1n;

      const messageId = /** @type {FormulaNumber} */ (await randomHex256());

      const message = /** @type {ChannelMessage} */ (
        harden({
          type: /** @type {'package'} */ ('package'),
          messageId,
          number: messageNumber,
          date: new Date().toISOString(),
          memberId,
          strings,
          names,
          ids,
          ...(replyTo !== undefined ? { replyTo } : {}),
          ...(replyType !== undefined ? { replyType } : {}),
        })
      );

      // Persist message to store for rehydration on restart
      const formulaId = await persistValue(message);
      await messageStore.storeIdentifier(
        /** @type {PetName} */ (`msg-${String(messageNumber)}`),
        formulaId,
      );

      messages.push(message);
      messagesTopic.publisher.next(message);
    };

    /**
     * Allocate a new unique member ID.
     * @returns {string}
     */
    const allocateMemberId = () => {
      const id = String(nextMemberIdNum);
      nextMemberIdNum += 1;
      return id;
    };

    /**
     * Check whether a member entry is currently blocked.
     * @param {MemberEntry} entry
     */
    const checkEntryValidity = entry => {
      if (!entry.valid) {
        throw new Error(
          `Channel member ${q(entry.invitedAs)} has been disabled`,
        );
      }
      if (entry.temporaryBanUntil > 0 && Date.now() < entry.temporaryBanUntil) {
        throw new Error(
          `Channel member ${q(entry.invitedAs)} is temporarily banned`,
        );
      }
    };

    /**
     * Create a gated async iterator that checks access before and after
     * each yield.
     * @param {() => void} checkAccess
     * @returns {object}
     */
    const makeGatedFollowMessages = checkAccess => {
      checkAccess();
      const iterator = (async function* channelMessages() {
        yield* messages;
        yield* messagesTopic.subscribe();
      })();
      const rawIterRef = /** @type {IterRef<ChannelMessage>} */ (
        /** @type {unknown} */ (makeIteratorRef(iterator))
      );
      return makeExo('GatedAsyncIterator', AsyncIteratorInterface, {
        async next() {
          checkAccess();
          const result = await rawIterRef.next();
          checkAccess();
          return result;
        },
        async return(value) {
          return rawIterRef.return(value);
        },
        async throw(error) {
          return rawIterRef.throw(error);
        },
      });
    };

    /**
     * Create an attenuator exo for a member entry.
     * @param {MemberEntry} entry
     * @returns {object}
     */
    const makeAttenuator = entry => {
      return makeExo('EndoChannelAttenuator', AttenuatorInterface, {
        setInvitationValidity: async valid => {
          entry.valid = valid;
          await persistMemberEntry(entry);
        },
        setHeatConfig: async config => {
          entry.heatConfig = config
            ? harden({
                burstLimit: config.burstLimit,
                sustainedRate: config.sustainedRate,
                lockoutDurationMs: config.lockoutDurationMs,
                postLockoutPct: config.postLockoutPct,
              })
            : null;
          await persistMemberEntry(entry);
        },
        getHeatConfig: async () => {
          return entry.heatConfig;
        },
        temporaryBan: async seconds => {
          entry.temporaryBanUntil = Date.now() + seconds * 1000;
          await persistMemberEntry(entry);
        },
      });
    };

    /**
     * Create a heat-based checkPostRate closure for a member entry.
     * Uses the shared heatStates map and publishes events to heatEventsTopic.
     * Parent rate check is called first.
     *
     * @param {MemberEntry} entry
     * @param {(now: number) => void} parentCheckPostRate
     * @returns {(now: number) => void}
     */
    const makeHeatCheckPostRate = (entry, parentCheckPostRate) => {
      // Initialize shared state for this member
      if (!heatStates.has(entry.memberId)) {
        heatStates.set(entry.memberId, {
          heat: 0,
          locked: false,
          lockEndTime: 0,
          lastHeatUpdateTime: 0,
        });
      }

      return now => {
        parentCheckPostRate(now);

        const config = entry.heatConfig;
        if (!config) return;

        const stateObj =
          /** @type {{ heat: number, locked: boolean, lockEndTime: number, lastHeatUpdateTime: number }} */ (
            heatStates.get(entry.memberId)
          );

        const heatPerMessage = HEAT_LOCKOUT_THRESHOLD / config.burstLimit;
        const coolRate = heatPerMessage * (config.sustainedRate / 60);

        // Check if locked
        if (stateObj.lockEndTime > 0) {
          if (now < stateObj.lockEndTime) {
            const remaining = Math.ceil((stateObj.lockEndTime - now) / 1000);
            throw new Error(
              `Rate limit lockout for ${q(entry.invitedAs)} (${remaining}s remaining)`,
            );
          }
          // Lockout expired — reset heat
          stateObj.heat = config.postLockoutPct;
          stateObj.locked = false;
          stateObj.lockEndTime = 0;
          stateObj.lastHeatUpdateTime = now;
        }

        // Apply cooling (skip on first call when lastHeatUpdateTime is 0)
        if (stateObj.lastHeatUpdateTime > 0) {
          const dt = (now - stateObj.lastHeatUpdateTime) / 1000;
          stateObj.heat = Math.max(0, stateObj.heat - coolRate * dt);
        }

        // Add heat for this message
        stateObj.heat += heatPerMessage;
        stateObj.lastHeatUpdateTime = now;

        // Publish heat event
        heatEventsTopic.publisher.next(
          harden({
            type: 'heat',
            hopMemberId: entry.memberId,
            heat: stateObj.heat,
            locked: false,
            lockEndTime: 0,
            timestamp: now,
          }),
        );

        // Check threshold
        if (stateObj.heat >= HEAT_LOCKOUT_THRESHOLD) {
          stateObj.lockEndTime = now + config.lockoutDurationMs;
          stateObj.locked = true;
          const remaining = Math.ceil(config.lockoutDurationMs / 1000);

          // Publish lockout event
          heatEventsTopic.publisher.next(
            harden({
              type: 'heat',
              hopMemberId: entry.memberId,
              heat: stateObj.heat,
              locked: true,
              lockEndTime: stateObj.lockEndTime,
              timestamp: now,
            }),
          );

          throw new Error(
            `Rate limit lockout for ${q(entry.invitedAs)} (${remaining}s remaining)`,
          );
        }
      };
    };

    /**
     * Walk the ancestor chain from a member entry up to the admin,
     * returning entries in root-first order.
     * @param {MemberEntry} entry
     * @returns {MemberEntry[]}
     */
    const getAncestorChain = entry => {
      /** @type {MemberEntry[]} */
      const chain = [];
      let current = entry;
      while (current) {
        chain.push(current);
        if (
          current.inviterMemberId === '' ||
          current.inviterMemberId === current.memberId
        ) {
          break;
        }
        const parent = memberEntries.get(current.inviterMemberId);
        if (!parent) break;
        current = parent;
      }
      chain.reverse(); // root-first order
      return chain;
    };

    /**
     * Build hop info (policies and states) for a member's ancestor chain.
     * Only includes hops that have a non-null heatConfig.
     * @param {MemberEntry} entry
     * @returns {{ policies: Array<{ hopIndex: number, label: string, memberId: string, burstLimit: number, sustainedRate: number, lockoutDurationMs: number, postLockoutPct: number }>, states: Array<{ hopIndex: number, heat: number, locked: boolean, lockRemaining: number }> }}
     */
    const buildHopInfo = entry => {
      const chain = getAncestorChain(entry);
      /** @type {Array<{ hopIndex: number, label: string, memberId: string, burstLimit: number, sustainedRate: number, lockoutDurationMs: number, postLockoutPct: number }>} */
      const policies = [];
      /** @type {Array<{ hopIndex: number, heat: number, locked: boolean, lockRemaining: number }>} */
      const states = [];
      let hopIndex = 0;
      const now = Date.now();
      for (const hop of chain) {
        if (hop.heatConfig) {
          const stateObj = heatStates.get(hop.memberId);
          let heat = 0;
          let locked = false;
          let lockEndTime = 0;

          if (stateObj) {
            // Apply cooling to get an accurate snapshot — the server only
            // cools heat during checkPostRate calls, so stateObj.heat may
            // be stale if no posts have occurred recently.
            const config = hop.heatConfig;
            const heatPerMessage = HEAT_LOCKOUT_THRESHOLD / config.burstLimit;
            const coolRate = heatPerMessage * (config.sustainedRate / 60);

            if (stateObj.lockEndTime > 0 && now >= stateObj.lockEndTime) {
              // Lockout has expired
              heat = config.postLockoutPct;
              locked = false;
              lockEndTime = 0;
            } else if (stateObj.lockEndTime > 0 && now < stateObj.lockEndTime) {
              // Still locked
              heat = stateObj.heat;
              locked = true;
              lockEndTime = stateObj.lockEndTime;
            } else if (stateObj.lastHeatUpdateTime > 0) {
              // Not locked — apply passive cooling since last update
              const dt = (now - stateObj.lastHeatUpdateTime) / 1000;
              heat = Math.max(0, stateObj.heat - coolRate * dt);
              locked = false;
              lockEndTime = 0;
            }
          }

          const lockRemaining = locked ? Math.max(0, lockEndTime - now) : 0;
          policies.push(
            harden({
              hopIndex,
              label: hop.proposedName,
              memberId: hop.memberId,
              burstLimit: hop.heatConfig.burstLimit,
              sustainedRate: hop.heatConfig.sustainedRate,
              lockoutDurationMs: hop.heatConfig.lockoutDurationMs,
              postLockoutPct: hop.heatConfig.postLockoutPct,
            }),
          );
          states.push(
            harden({
              hopIndex,
              heat,
              locked,
              lockRemaining,
            }),
          );
          hopIndex += 1;
        }
      }
      return { policies, states };
    };

    /**
     * Get the set of ancestor member IDs for a member entry.
     * @param {MemberEntry} entry
     * @returns {Set<string>}
     */
    const getAncestorMemberIds = entry => {
      const chain = getAncestorChain(entry);
      const ids = new Set();
      for (const hop of chain) {
        if (hop.heatConfig) {
          ids.add(hop.memberId);
        }
      }
      return ids;
    };

    /**
     * Create a gated async iterator for heat events filtered to a member's
     * ancestor chain. Periodically injects snapshot events for drift correction.
     * @param {MemberEntry} entry
     * @param {() => void} checkAccess
     * @returns {object}
     */
    const makeGatedFollowHeatEvents = (entry, checkAccess) => {
      checkAccess();
      const ancestorIds = getAncestorMemberIds(entry);
      const subscription = heatEventsTopic.subscribe();

      const iterator = (async function* heatEvents() {
        let lastSnapshotTime = Date.now();
        for await (const event of subscription) {
          // Filter to only ancestor hops
          if (ancestorIds.has(event.hopMemberId)) {
            yield event;

            // Inject periodic snapshots every ~5s
            const now = Date.now();
            if (now - lastSnapshotTime > 5000) {
              lastSnapshotTime = now;
              // Use buildHopInfo which applies passive cooling
              const snapInfo = buildHopInfo(entry);
              const snapChain = getAncestorChain(entry);
              const configuredHops = snapChain.filter(h => h.heatConfig);
              for (let si = 0; si < snapInfo.states.length; si += 1) {
                const snapState = snapInfo.states[si];
                const hop = configuredHops[si];
                if (hop) {
                  yield harden({
                    type: 'snapshot',
                    hopMemberId: hop.memberId,
                    heat: snapState.heat,
                    locked: snapState.locked,
                    lockEndTime: snapState.locked
                      ? now + snapState.lockRemaining
                      : 0,
                    timestamp: now,
                  });
                }
              }
            }
          }
        }
      })();

      const rawIterRef = /** @type {IterRef<unknown>} */ (
        /** @type {unknown} */ (makeIteratorRef(iterator))
      );
      return makeExo('GatedHeatEventIterator', AsyncIteratorInterface, {
        async next() {
          checkAccess();
          const result = await rawIterRef.next();
          checkAccess();
          return result;
        },
        async return(value) {
          return rawIterRef.return(value);
        },
        async throw(error) {
          return rawIterRef.throw(error);
        },
      });
    };

    /**
     * Create a channel invitation exo. The invitation's join() method creates
     * an attenuated channel handle with properly chained access closures.
     *
     * @param {MemberEntry} entry - The entry for the invited member
     * @param {() => void} parentCheckAccess - The inviter's checkAccess closure
     * @param {(now: number) => void} parentCheckPostRate - The inviter's rate check
     * @returns {object} invitation exo
     */
    const makeInvitation = (entry, parentCheckAccess, parentCheckPostRate) => {
      /** @type {object | undefined} */
      let joinedHandle;

      const invitation = makeExo(
        'EndoChannelInvitation',
        ChannelInvitationInterface,
        {
          help: makeHelp(channelInvitationHelp),
          join: async memberProposedName => {
            // Idempotent
            if (joinedHandle) {
              return joinedHandle;
            }
            entry.proposedName = memberProposedName;
            entry.joined = true;
            await persistMemberEntry(entry);

            const checkAccess = () => {
              parentCheckAccess();
              checkEntryValidity(entry);
            };

            const checkPostRate = makeHeatCheckPostRate(
              entry,
              parentCheckPostRate,
            );

            joinedHandle = makeChannelMemberHandle(
              entry,
              checkAccess,
              checkPostRate,
            );
            return joinedHandle;
          },
        },
      );
      return invitation;
    };

    /**
     * Create a channel member handle — the unified object that replaces
     * both the old makeMemberExo and makeAttenuatedProxy. Each handle
     * is a closure over its parent's access checks, so cascading is automatic.
     *
     * @param {MemberEntry} entry - The member entry for this handle
     * @param {() => void} checkAccess - Chained access check closure
     * @param {(now: number) => void} checkPostRate - Chained rate check closure
     * @returns {object} member handle exo
     */
    const makeChannelMemberHandle = (entry, checkAccess, checkPostRate) => {
      /**
       * Local invitations created by this handle.
       * @type {Map<string, { invitation: object, attenuator: object, entry: MemberEntry }>}
       */
      const localInvitations = new Map();

      return makeExo('EndoChannelMember', ChannelMemberInterface, {
        help: makeHelp(channelMemberHelp),
        post: async (
          strings,
          names,
          petNamesOrPaths,
          replyTo,
          resolvedIds,
          replyType,
        ) => {
          checkAccess();
          const now = Date.now();
          checkPostRate(now);
          const ids = /** @type {FormulaIdentifier[]} */ (resolvedIds || []);
          await postInternal(
            entry.memberId,
            strings,
            names,
            ids,
            replyTo,
            replyType,
          );
        },
        setProposedName: async newName => {
          checkAccess();
          entry.proposedName = newName;
        },
        followMessages: async () => {
          return makeGatedFollowMessages(checkAccess);
        },
        listMessages: async () => {
          checkAccess();
          return harden([...messages]);
        },
        createInvitation: async subMemberName => {
          checkAccess();
          // Enforce unique invitation names per inviter
          if (localInvitations.has(subMemberName)) {
            throw new Error(
              `An invitation named ${q(subMemberName)} already exists from this member`,
            );
          }
          const subPedigree = [...entry.pedigree, entry.proposedName];
          const subMemberId = allocateMemberId();
          const subEntry = {
            proposedName: subMemberName,
            invitedAs: subMemberName,
            memberId: subMemberId,
            inviterMemberId: entry.memberId,
            pedigree: subPedigree,
            valid: true,
            joined: false,
            heatConfig: /** @type {HeatConfig | null} */ (null),
            temporaryBanUntil: 0,
          };
          memberEntries.set(subMemberId, subEntry);
          const attenuator = makeAttenuator(subEntry);
          const invitation = makeInvitation(
            subEntry,
            checkAccess,
            checkPostRate,
          );
          localInvitations.set(subMemberName, {
            invitation,
            attenuator,
            entry: subEntry,
          });
          // Register in the global invitation registry for channel.join() resolution
          const regKey = `${entry.memberId}:${subMemberName}`;
          invitationRegistry.set(regKey, {
            invitation,
            entry: subEntry,
            attenuator,
          });
          await persistMemberEntry(subEntry);
          return harden([invitation, attenuator]);
        },
        getMembers: async () => {
          checkAccess();
          const result = [];
          for (const [, rec] of localInvitations) {
            result.push(
              harden({
                proposedName: rec.entry.proposedName,
                invitedAs: rec.entry.invitedAs,
                memberId: rec.entry.memberId,
                pedigree: [...rec.entry.pedigree],
                active: rec.entry.valid,
              }),
            );
          }
          return harden(result);
        },
        getProposedName: () => {
          checkAccess();
          return entry.proposedName;
        },
        getMemberId: () => {
          checkAccess();
          return entry.memberId;
        },
        getMember: async targetMemberId => {
          checkAccess();
          const targetEntry = memberEntries.get(targetMemberId);
          if (!targetEntry) {
            return undefined;
          }
          const pedigreeMemberIds = buildPedigreeMemberIds(targetEntry);
          return harden({
            proposedName: targetEntry.proposedName,
            invitedAs: targetEntry.invitedAs,
            memberId: targetEntry.memberId,
            pedigree: [...targetEntry.pedigree],
            pedigreeMemberIds,
          });
        },
        getAttenuator: async invitedAs => {
          checkAccess();
          const rec = localInvitations.get(invitedAs);
          if (!rec) {
            throw new Error(
              `No invitation named ${q(invitedAs)} found from this member`,
            );
          }
          return rec.attenuator;
        },
        getHeatConfig: async () => {
          checkAccess();
          return entry.heatConfig;
        },
        getHopInfo: async () => {
          checkAccess();
          const info = buildHopInfo(entry);
          return harden({
            policies: harden(info.policies),
            states: harden(info.states),
          });
        },
        followHeatEvents: async () => {
          return makeGatedFollowHeatEvents(entry, checkAccess);
        },
      });
    };

    // --- Admin entry ---
    const adminEntry = {
      proposedName,
      invitedAs: proposedName,
      memberId: adminMemberId,
      inviterMemberId: '',
      pedigree: /** @type {string[]} */ ([]),
      valid: true,
      joined: true,
      heatConfig: /** @type {HeatConfig | null} */ (null),
      temporaryBanUntil: 0,
    };

    // Register admin in memberEntries
    memberEntries.set(adminMemberId, adminEntry);

    // Admin's access closures — always pass (admin is never gated)
    const adminCheckAccess = () => {};
    /**
     * @param {number} _now
     */
    const adminCheckPostRate = _now => {};

    /**
     * Admin-level local invitations map, shared with the channel exo.
     * @type {Map<string, { invitation: object, attenuator: object, entry: MemberEntry }>}
     */
    const adminInvitations = new Map();

    // Rehydrate members from memberStore, sorted by pedigree depth
    // to ensure parents are rebuilt before children.
    const memberStoreNames = memberStore.list();
    /** @type {MemberEntry[]} */
    const rehydratedEntries = [];
    for (const storeName of memberStoreNames) {
      if (storeName.startsWith('member-')) {
        const id = memberStore.identifyLocal(storeName);
        if (id !== undefined) {
          const value = await provide(/** @type {FormulaIdentifier} */ (id));
          if (value && typeof value === 'object') {
            const data = /** @type {any} */ (value);
            // Migration: convert old rateLimitPerSecond to heatConfig
            let heatConfig = data.heatConfig || null;
            if (
              !heatConfig &&
              data.rateLimitPerSecond &&
              data.rateLimitPerSecond !== 0
            ) {
              heatConfig = harden({
                burstLimit: 5,
                sustainedRate: Math.round(data.rateLimitPerSecond * 60),
                lockoutDurationMs: 10000,
                postLockoutPct: 40,
              });
            }
            rehydratedEntries.push({
              proposedName: data.proposedName,
              invitedAs: data.invitedAs,
              memberId: data.memberId,
              inviterMemberId: data.inviterMemberId,
              pedigree: [...data.pedigree],
              valid: data.valid,
              // Default to true for backward compat: old entries without
              // this field were likely already claimed.
              joined: data.joined !== undefined ? data.joined : true,
              heatConfig,
              temporaryBanUntil: data.temporaryBanUntil,
            });
            const num = Number(data.memberId);
            if (num >= nextMemberIdNum) {
              nextMemberIdNum = num + 1;
            }
          }
        }
      }
    }

    // Sort by pedigree depth so parents are processed before children
    rehydratedEntries.sort((a, b) => a.pedigree.length - b.pedigree.length);

    /**
     * Map from memberId to { checkAccess, checkPostRate, invitations }
     * for reconstructing the closure chain during rehydration.
     * @type {Map<string, { checkAccess: () => void, checkPostRate: (now: number) => void, invitations: Map<string, { invitation: object, attenuator: object, entry: MemberEntry }> }>}
     */
    const memberHandleInfo = new Map();
    memberHandleInfo.set(adminMemberId, {
      checkAccess: adminCheckAccess,
      checkPostRate: adminCheckPostRate,
      invitations: adminInvitations,
    });

    for (const entry of rehydratedEntries) {
      memberEntries.set(entry.memberId, entry);
      const parentInfo = memberHandleInfo.get(entry.inviterMemberId);
      if (!parentInfo) {
        // Parent not found — skip (orphaned entry)
      } else {
        const parentCheckAccess = parentInfo.checkAccess;
        const parentCheckPostRate = parentInfo.checkPostRate;

        const checkAccess = () => {
          parentCheckAccess();
          checkEntryValidity(entry);
        };

        const checkPostRate = makeHeatCheckPostRate(entry, parentCheckPostRate);

        const attenuator = makeAttenuator(entry);
        const invitation = makeInvitation(
          entry,
          parentCheckAccess,
          parentCheckPostRate,
        );

        const rec = { invitation, attenuator, entry };
        parentInfo.invitations.set(entry.invitedAs, rec);

        const regKey = `${entry.inviterMemberId}:${entry.invitedAs}`;
        invitationRegistry.set(regKey, rec);

        // Register this member's handle info for potential children
        /** @type {Map<string, { invitation: object, attenuator: object, entry: MemberEntry }>} */
        const childInvitations = new Map();
        memberHandleInfo.set(entry.memberId, {
          checkAccess,
          checkPostRate,
          invitations: childInvitations,
        });
      }
    }

    const channelExo = /** @type {EndoChannel} */ (
      /** @type {unknown} */
      (
        makeExo('EndoChannel', ChannelInterface, {
          help: makeHelp(channelHelp),
          post: async (
            strings,
            names,
            petNamesOrPaths,
            replyTo,
            resolvedIds,
            replyType,
          ) => {
            const ids = /** @type {FormulaIdentifier[]} */ (resolvedIds || []);
            await postInternal(
              adminMemberId,
              strings,
              names,
              ids,
              replyTo,
              replyType,
            );
          },
          followMessages: async () => {
            const iterator = (async function* channelMessages() {
              yield* messages;
              yield* messagesTopic.subscribe();
            })();
            return makeIteratorRef(iterator);
          },
          listMessages: async () => harden([...messages]),
          createInvitation: async memberProposedName => {
            // Enforce unique invitation names per inviter (admin)
            if (adminInvitations.has(memberProposedName)) {
              throw new Error(
                `An invitation named ${q(memberProposedName)} already exists from this member`,
              );
            }
            const pedigree = [proposedName];
            const memberId = allocateMemberId();
            const newEntry = {
              proposedName: memberProposedName,
              invitedAs: memberProposedName,
              memberId,
              inviterMemberId: adminMemberId,
              pedigree,
              valid: true,
              joined: false,
              heatConfig: /** @type {HeatConfig | null} */ (null),
              temporaryBanUntil: 0,
            };
            memberEntries.set(memberId, newEntry);
            const attenuator = makeAttenuator(newEntry);
            const invitation = makeInvitation(
              newEntry,
              adminCheckAccess,
              adminCheckPostRate,
            );
            const rec = { invitation, attenuator, entry: newEntry };
            adminInvitations.set(memberProposedName, rec);
            const regKey = `${adminMemberId}:${memberProposedName}`;
            invitationRegistry.set(regKey, rec);

            // Register handle info for this member so its children can chain
            /** @type {Map<string, { invitation: object, attenuator: object, entry: MemberEntry }>} */
            const childInvitations = new Map();

            const checkAccess = () => {
              checkEntryValidity(newEntry);
            };
            const checkPostRate = makeHeatCheckPostRate(
              newEntry,
              adminCheckPostRate,
            );
            memberHandleInfo.set(memberId, {
              checkAccess,
              checkPostRate,
              invitations: childInvitations,
            });

            await persistMemberEntry(newEntry);
            return harden([invitation, attenuator]);
          },
          join: async memberProposedName => {
            // Try exact name match first (invitedAs matches proposed name)
            const adminKey = `${adminMemberId}:${memberProposedName}`;
            const adminRec = invitationRegistry.get(adminKey);
            if (adminRec) {
              return adminRec.invitation.join(memberProposedName);
            }
            for (const [, rec] of invitationRegistry) {
              if (rec.entry.invitedAs === memberProposedName) {
                return rec.invitation.join(memberProposedName);
              }
            }
            // Fallback: claim the first unclaimed invitation.
            // The inviter's name for the invitation is just bookkeeping —
            // the joiner chooses their own display name.
            for (const [, rec] of invitationRegistry) {
              if (!rec.entry.joined) {
                return rec.invitation.join(memberProposedName);
              }
            }
            throw new Error(
              `No unclaimed invitation exists — ask the channel admin to create one`,
            );
          },
          getMembers: async () => {
            const result = [];
            for (const [, rec] of adminInvitations) {
              result.push(
                harden({
                  proposedName: rec.entry.proposedName,
                  invitedAs: rec.entry.invitedAs,
                  memberId: rec.entry.memberId,
                  pedigree: [...rec.entry.pedigree],
                  active: rec.entry.valid,
                }),
              );
            }
            return harden(result);
          },
          getProposedName: () => proposedName,
          getMemberId: () => adminMemberId,
          getMember: async targetMemberId => {
            const targetEntry = memberEntries.get(targetMemberId);
            if (!targetEntry) {
              return undefined;
            }
            const pedigreeMemberIds = buildPedigreeMemberIds(targetEntry);
            return harden({
              proposedName: targetEntry.proposedName,
              invitedAs: targetEntry.invitedAs,
              memberId: targetEntry.memberId,
              pedigree: [...targetEntry.pedigree],
              pedigreeMemberIds,
            });
          },
          getAttenuator: async invitedAs => {
            const rec = adminInvitations.get(invitedAs);
            if (!rec) {
              throw new Error(
                `No invitation named ${q(invitedAs)} found from this member`,
              );
            }
            return rec.attenuator;
          },
          getHeatConfig: async () => {
            // Admin has no heat config (unrestricted)
            return null;
          },
          getHopInfo: async () => {
            // Admin has no ancestor chain — return empty
            return harden({ policies: harden([]), states: harden([]) });
          },
          followHeatEvents: async () => {
            // Admin gets an empty iterator (no hops to monitor)
            // eslint-disable-next-line no-empty-function, require-yield
            const iterator = (async function* emptyHeatEvents() {})();
            return makeIteratorRef(iterator);
          },
        })
      )
    );

    return channelExo;
  };

  return makeChannel;
};
harden(makeChannelMaker);
