// @ts-check

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

/** @import { Context, EndoChannel, EndoChannelMember, ChannelMessage, FormulaIdentifier, Provide } from './types.js' */

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
 */
export const makeChannelMaker = ({ provide, persistValue }) => {
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

    const messageStore = await provide(messageStoreId, 'pet-store');
    const memberStore = await provide(memberStoreId, 'pet-store');

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
        const value = await provide(id);
        if (value && typeof value === 'object') {
          const msg = /** @type {ChannelMessage} */ (value);
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
     * @typedef {object} MemberEntry
     * @property {string} proposedName - Current display name (may be changed by the member)
     * @property {string} invitedAs - Original name given by the inviter
     * @property {string} memberId - Stable identifier for this member
     * @property {string} inviterMemberId - memberId of the member who created this invitation
     * @property {string[]} pedigree - Invitation chain
     * @property {boolean} valid - true = active, false = disabled
     * @property {number} rateLimitPerSecond - 0 = unrestricted
     * @property {number} temporaryBanUntil - epoch ms, 0 = no ban
     */

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
        rateLimitPerSecond: entry.rateLimitPerSecond,
        temporaryBanUntil: entry.temporaryBanUntil,
      });
      const formulaId = await persistValue(persistable);
      await memberStore.write(`member-${entry.memberId}`, formulaId);
    };

    /**
     * Internal: post a message from an identified author.
     * @param {string} author
     * @param {string[]} pedigree
     * @param {string} memberId
     * @param {string[]} strings
     * @param {string[]} edgeNames
     * @param {FormulaIdentifier[]} ids
     * @param {string} [replyTo]
     */
    const postInternal = async (
      author,
      pedigree,
      memberId,
      strings,
      edgeNames,
      ids,
      replyTo,
    ) => {
      const messageNumber = nextMessageNumber;
      nextMessageNumber += 1n;

      /** @type {ChannelMessage} */
      const message = harden({
        number: messageNumber,
        date: new Date().toISOString(),
        author,
        memberId,
        pedigree: [...pedigree],
        strings,
        edgeNames,
        ids,
        replyTo,
      });

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
      const rawIterRef = makeIteratorRef(iterator);
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
        setRateLimit: async messagesPerSecond => {
          entry.rateLimitPerSecond = messagesPerSecond;
          await persistMemberEntry(entry);
        },
        temporaryBan: async seconds => {
          entry.temporaryBanUntil = Date.now() + seconds * 1000;
          await persistMemberEntry(entry);
        },
      });
    };

    /**
     * Create a channel invitation exo. The invitation's join() method creates
     * an attenuated channel handle with properly chained access closures.
     *
     * @param {MemberEntry} entry - The entry for the invited member
     * @param {() => void} parentCheckAccess - The inviter's checkAccess closure
     * @param {(now: number, lastPostTime: number) => void} parentCheckPostRate - The inviter's rate check
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

            const checkAccess = () => {
              parentCheckAccess();
              checkEntryValidity(entry);
            };

            /**
             * @param {number} now
             * @param {number} childLastPostTime
             */
            const checkPostRate = (now, childLastPostTime) => {
              parentCheckPostRate(now, childLastPostTime);
              if (entry.rateLimitPerSecond > 0) {
                const minInterval = 1000 / entry.rateLimitPerSecond;
                if (now - childLastPostTime < minInterval) {
                  throw new Error(
                    `Rate limit exceeded for ${q(entry.invitedAs)}`,
                  );
                }
              }
            };

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
     * @param {(now: number, lastPostTime: number) => void} checkPostRate - Chained rate check closure
     * @returns {object} member handle exo
     */
    const makeChannelMemberHandle = (entry, checkAccess, checkPostRate) => {
      let lastPostTime = 0;

      /**
       * Local invitations created by this handle.
       * @type {Map<string, { invitation: object, attenuator: object, entry: MemberEntry }>}
       */
      const localInvitations = new Map();

      return makeExo('EndoChannelMember', ChannelMemberInterface, {
        help: makeHelp(channelMemberHelp),
        post: async (strings, edgeNames, petNamesOrPaths, replyTo) => {
          checkAccess();
          const now = Date.now();
          checkPostRate(now, lastPostTime);
          const ids = /** @type {FormulaIdentifier[]} */ ([]);
          await postInternal(
            entry.proposedName,
            entry.pedigree,
            entry.memberId,
            strings,
            edgeNames,
            ids,
            replyTo,
          );
          lastPostTime = now;
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
            rateLimitPerSecond: 0,
            temporaryBanUntil: 0,
          };
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
      rateLimitPerSecond: 0,
      temporaryBanUntil: 0,
    };

    // Admin's access closures — always pass (admin is never gated)
    const adminCheckAccess = () => {};
    /**
     * @param {number} _now
     * @param {number} _lastPostTime
     */
    const adminCheckPostRate = (_now, _lastPostTime) => {};

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
          const value = await provide(id);
          if (value && typeof value === 'object') {
            const data = /** @type {MemberEntry} */ (value);
            rehydratedEntries.push({
              proposedName: data.proposedName,
              invitedAs: data.invitedAs,
              memberId: data.memberId,
              inviterMemberId: data.inviterMemberId,
              pedigree: [...data.pedigree],
              valid: data.valid,
              rateLimitPerSecond: data.rateLimitPerSecond,
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
     * @type {Map<string, { checkAccess: () => void, checkPostRate: (now: number, lastPostTime: number) => void, invitations: Map<string, { invitation: object, attenuator: object, entry: MemberEntry }> }>}
     */
    const memberHandleInfo = new Map();
    memberHandleInfo.set(adminMemberId, {
      checkAccess: adminCheckAccess,
      checkPostRate: adminCheckPostRate,
      invitations: adminInvitations,
    });

    for (const entry of rehydratedEntries) {
      const parentInfo = memberHandleInfo.get(entry.inviterMemberId);
      if (!parentInfo) {
        // Parent not found — skip (orphaned entry)
        continue;
      }

      const parentCheckAccess = parentInfo.checkAccess;
      const parentCheckPostRate = parentInfo.checkPostRate;

      const checkAccess = () => {
        parentCheckAccess();
        checkEntryValidity(entry);
      };

      /**
       * @param {number} now
       * @param {number} childLastPostTime
       */
      const checkPostRate = (now, childLastPostTime) => {
        parentCheckPostRate(now, childLastPostTime);
        if (entry.rateLimitPerSecond > 0) {
          const minInterval = 1000 / entry.rateLimitPerSecond;
          if (now - childLastPostTime < minInterval) {
            throw new Error(
              `Rate limit exceeded for ${q(entry.invitedAs)}`,
            );
          }
        }
      };

      const attenuator = makeAttenuator(entry);
      const invitation = makeInvitation(entry, parentCheckAccess, parentCheckPostRate);

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

    /** @type {EndoChannel} */
    const channelExo = makeExo('EndoChannel', ChannelInterface, {
      help: makeHelp(channelHelp),
      post: async (strings, edgeNames, petNamesOrPaths, replyTo) => {
        const ids = /** @type {FormulaIdentifier[]} */ ([]);
        await postInternal(
          proposedName,
          [],
          adminMemberId,
          strings,
          edgeNames,
          ids,
          replyTo,
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
          rateLimitPerSecond: 0,
          temporaryBanUntil: 0,
        };
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
        /**
         * @param {number} now
         * @param {number} childLastPostTime
         */
        const checkPostRate = (now, childLastPostTime) => {
          if (newEntry.rateLimitPerSecond > 0) {
            const minInterval = 1000 / newEntry.rateLimitPerSecond;
            if (now - childLastPostTime < minInterval) {
              throw new Error(
                `Rate limit exceeded for ${q(newEntry.invitedAs)}`,
              );
            }
          }
        };
        memberHandleInfo.set(memberId, {
          checkAccess,
          checkPostRate,
          invitations: childInvitations,
        });

        await persistMemberEntry(newEntry);
        return harden([invitation, attenuator]);
      },
      join: async memberProposedName => {
        // First check admin-level invitations
        const adminKey = `${adminMemberId}:${memberProposedName}`;
        const adminRec = invitationRegistry.get(adminKey);
        if (adminRec) {
          return adminRec.invitation.join(memberProposedName);
        }
        // Search all invitations (member may have been invited by a non-admin)
        for (const [, rec] of invitationRegistry) {
          if (rec.entry.invitedAs === memberProposedName) {
            return rec.invitation.join(memberProposedName);
          }
        }
        throw new Error(
          `No invitation named ${q(memberProposedName)} exists — call createInvitation first`,
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
      getAttenuator: async invitedAs => {
        const rec = adminInvitations.get(invitedAs);
        if (!rec) {
          throw new Error(
            `No invitation named ${q(invitedAs)} found from this member`,
          );
        }
        return rec.attenuator;
      },
    });

    return channelExo;
  };

  return makeChannel;
};
harden(makeChannelMaker);
