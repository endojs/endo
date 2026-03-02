// @ts-check

import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';
import { makeIteratorRef } from './reader-ref.js';
import { makeChangeTopic } from './pubsub.js';
import {
  AsyncIteratorInterface,
  AttenuatorInterface,
  ChannelInterface,
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
  invite: 'Create a new channel member; returns [attenuator, proxyMember].',
  join: 'Join the channel as a member with the given proposed name.',
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
  invite: 'Create a new sub-member with the given proposed name.',
  getMembers: 'List all members with their proposed names and pedigree chains.',
  getProposedName: 'Get your proposed display name.',
  getMemberId: 'Get your stable member ID in the channel.',
  getAttenuator: 'Get an attenuator for a previously invited member by name.',
};
harden(channelMemberHelp);

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
     * @property {boolean} viaJoin - True if created via join() rather than invite()
     */

    /**
     * Member registry: maps member Exo identity to metadata.
     * @type {Map<object, MemberEntry>}
     */
    const memberRegistry = new Map();

    /**
     * Joined members by proposed name: ensures join() is idempotent.
     * When a user calls join() with the same name multiple times (e.g. on
     * each space visit), they get the same member exo with the same memberId.
     * @type {Map<string, object>}
     */
    const joinedExosByName = new Map();

    /**
     * Maps real member exos to their checkAccess function, used
     * to chain access checks in the delegation hierarchy.
     * @type {Map<object, () => void>}
     */
    const memberCheckAccessMap = new Map();

    /**
     * Maps real member exos to their checkPostRate function, used
     * to chain rate-limit checks in the delegation hierarchy.
     * The function receives both `now` and `lastPostTime` so that
     * the parent's rate limit is checked against the child's cadence.
     * @type {Map<object, (now: number, lastPostTime: number) => void>}
     */
    const memberPostRateCheckMap = new Map();

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
        viaJoin: entry.viaJoin,
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
     * Check whether a member entry is blocked by attenuator controls.
     * For viaJoin members, also checks if a matching invite entry has been
     * disabled — this ensures that disabling an invitation also blocks
     * join-created members with the same name.
     * @param {MemberEntry} entry
     */
    const checkEntryAccess = entry => {
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
      // For join-created members, also check the matching invite entry
      if (entry.viaJoin) {
        for (const [, inviteEntry] of memberRegistry) {
          if (
            inviteEntry.invitedAs === entry.invitedAs &&
            inviteEntry.inviterMemberId === entry.inviterMemberId &&
            !inviteEntry.viaJoin
          ) {
            if (!inviteEntry.valid) {
              throw new Error(
                `Channel member ${q(entry.invitedAs)} has been disabled`,
              );
            }
            if (
              inviteEntry.temporaryBanUntil > 0 &&
              Date.now() < inviteEntry.temporaryBanUntil
            ) {
              throw new Error(
                `Channel member ${q(entry.invitedAs)} is temporarily banned`,
              );
            }
            break;
          }
        }
      }
    };

    /**
     * Create a member Exo. The member reads its current proposedName from the
     * registry so that `setProposedName` changes take effect on future posts.
     * @param {string} initialProposedName
     * @param {string[]} pedigree
     * @param {string} [existingMemberId]
     * @returns {{ memberExo: object, memberId: string }}
     */
    const makeMemberExo = (initialProposedName, pedigree, existingMemberId) => {
      const memberId = existingMemberId || allocateMemberId();
      const frozenPedigree = harden([...pedigree]);

      const memberExo = makeExo(
        'EndoChannelMember',
        ChannelMemberInterface,
        {
          help: makeHelp(channelMemberHelp),
          post: async (strings, edgeNames, petNamesOrPaths, replyTo) => {
            const entry = memberRegistry.get(memberExo);
            if (!entry) {
              throw new Error(
                `Channel member ${q(initialProposedName)} is not registered`,
              );
            }
            checkEntryAccess(entry);
            const ids = /** @type {FormulaIdentifier[]} */ ([]);
            await postInternal(
              entry.proposedName,
              frozenPedigree,
              entry.memberId,
              strings,
              edgeNames,
              ids,
              replyTo,
            );
          },
          setProposedName: async newName => {
            const entry = memberRegistry.get(memberExo);
            if (!entry) {
              throw new Error(
                `Channel member ${q(initialProposedName)} is not registered`,
              );
            }
            checkEntryAccess(entry);
            entry.proposedName = newName;
          },
          followMessages: async () => {
            const entry = memberRegistry.get(memberExo);
            if (!entry) {
              throw new Error(
                `Channel member ${q(initialProposedName)} is not registered`,
              );
            }
            checkEntryAccess(entry);
            const iterator = (async function* channelMessages() {
              yield* messages;
              yield* messagesTopic.subscribe();
            })();
            const rawIterRef = makeIteratorRef(iterator);
            // Gate each next() call so that disabling mid-stream stops delivery.
            return makeExo(
              'GatedAsyncIterator',
              AsyncIteratorInterface,
              {
                async next() {
                  const currentEntry = memberRegistry.get(memberExo);
                  if (currentEntry) {
                    checkEntryAccess(currentEntry);
                  }
                  const result = await rawIterRef.next();
                  // Re-check after the await: the member may have been
                  // disabled while we were waiting for the next message.
                  const updatedEntry = memberRegistry.get(memberExo);
                  if (updatedEntry) {
                    checkEntryAccess(updatedEntry);
                  }
                  return result;
                },
                async return(value) {
                  return rawIterRef.return(value);
                },
                async throw(error) {
                  return rawIterRef.throw(error);
                },
              },
            );
          },
          listMessages: async () => harden([...messages]),
          invite: async subMemberName => {
            const entry = memberRegistry.get(memberExo);
            if (!entry) {
              throw new Error(
                `Channel member ${q(initialProposedName)} is not registered`,
              );
            }
            checkEntryAccess(entry);
            // Enforce unique invitation names per inviter
            for (const [, existingEntry] of memberRegistry) {
              if (
                existingEntry.invitedAs === subMemberName &&
                existingEntry.inviterMemberId === entry.memberId &&
                !existingEntry.viaJoin
              ) {
                throw new Error(
                  `An invitation named ${q(subMemberName)} already exists from this member`,
                );
              }
            }
            const subPedigree = [...frozenPedigree, entry.proposedName];
            const { memberExo: subMember, memberId: subMemberId } =
              makeMemberExo(subMemberName, subPedigree);
            const newEntry = {
              proposedName: subMemberName,
              invitedAs: subMemberName,
              memberId: subMemberId,
              inviterMemberId: entry.memberId,
              pedigree: subPedigree,
              valid: true,
              rateLimitPerSecond: 0,
              temporaryBanUntil: 0,
              viaJoin: false,
            };
            memberRegistry.set(subMember, newEntry);
            const parentCheckAccess =
              memberCheckAccessMap.get(memberExo) || (() => {});
            const parentCheckPostRate =
              memberPostRateCheckMap.get(memberExo) ||
              (/** @param {number} _now @param {number} _lpt */ (_now, _lpt) => {});
            const { proxyExo, attenuator, checkAccess, checkPostRate } =
              makeAttenuatedProxy(
                subMember,
                parentCheckAccess,
                parentCheckPostRate,
                newEntry,
              );
            memberCheckAccessMap.set(subMember, checkAccess);
            memberPostRateCheckMap.set(subMember, checkPostRate);
            await persistMemberEntry(newEntry);
            return harden([attenuator, proxyExo]);
          },
          getMembers: async () => {
            const callerEntry = memberRegistry.get(memberExo);
            if (!callerEntry) {
              return harden([]);
            }
            const callerId = callerEntry.memberId;
            const result = [];
            for (const [, entry] of memberRegistry) {
              if (entry.inviterMemberId === callerId && !entry.viaJoin) {
                result.push(
                  harden({
                    proposedName: entry.proposedName,
                    invitedAs: entry.invitedAs,
                    memberId: entry.memberId,
                    pedigree: [...entry.pedigree],
                    active: entry.valid,
                  }),
                );
              }
            }
            return harden(result);
          },
          getProposedName: () => {
            const entry = memberRegistry.get(memberExo);
            return entry ? entry.proposedName : initialProposedName;
          },
          getMemberId: () => memberId,
          getAttenuator: async invitedAs => {
            const callerEntry = memberRegistry.get(memberExo);
            if (!callerEntry) {
              throw new Error('Caller is not a registered member');
            }
            return makeAttenuatorForEntry(
              callerEntry.memberId,
              invitedAs,
            );
          },
        },
      );

      return { memberExo, memberId };
    };

    /**
     * Find a member entry by inviterMemberId and invitedAs, then create
     * a fresh attenuator exo for it.
     * @param {string} inviterMemberId
     * @param {string} invitedAs
     * @returns {object}
     */
    const makeAttenuatorForEntry = (inviterMemberId, invitedAs) => {
      for (const [, entry] of memberRegistry) {
        if (
          entry.invitedAs === invitedAs &&
          entry.inviterMemberId === inviterMemberId &&
          !entry.viaJoin
        ) {
          return makeExo(
            'EndoChannelAttenuator',
            AttenuatorInterface,
            {
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
            },
          );
        }
      }
      throw new Error(
        `No invitation named ${q(invitedAs)} found from this member`,
      );
    };

    /**
     * Create an attenuated proxy around a real member exo.
     * The proxy delegates every call through a `checkAccess` gate that
     * is chained from the parent's gate, enabling cascading disabling.
     * The `checkPostRate` gate additionally enforces rate limits on post().
     *
     * @param {object} realMember - The real member exo
     * @param {() => void} parentCheckAccess - Parent's access check (throws if parent disabled)
     * @param {(now: number, lastPostTime: number) => void} parentCheckPostRate - Parent's rate check
     * @param {MemberEntry} entry - The member entry (mutated by attenuator)
     * @returns {{ proxyExo: object, attenuator: object, checkAccess: () => void, checkPostRate: (now: number, lastPostTime: number) => void }}
     */
    const makeAttenuatedProxy = (
      realMember,
      parentCheckAccess,
      parentCheckPostRate,
      entry,
    ) => {
      let lastPostTime = 0;

      const checkAccess = () => {
        parentCheckAccess();
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
       * @param {number} now
       * @param {number} childLastPostTime - The child's last post time, used
       *   to enforce the parent's rate limit against the child's cadence.
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

      const proxyExo = makeExo(
        'EndoChannelMember',
        ChannelMemberInterface,
        {
          help: (...args) => {
            checkAccess();
            return realMember.help(...args);
          },
          post: async (...args) => {
            checkAccess();
            const now = Date.now();
            checkPostRate(now, lastPostTime);
            const result = await realMember.post(...args);
            lastPostTime = now;
            return result;
          },
          setProposedName: async (...args) => {
            checkAccess();
            return realMember.setProposedName(...args);
          },
          followMessages: async () => {
            checkAccess();
            const realIterRef = await realMember.followMessages();
            return makeExo(
              'GatedAsyncIterator',
              AsyncIteratorInterface,
              {
                async next() {
                  checkAccess();
                  const result = await realIterRef.next();
                  // Re-check after the await: the member may have been
                  // disabled while we were waiting for the next message.
                  checkAccess();
                  return result;
                },
                async return(value) {
                  return realIterRef.return(value);
                },
                async throw(error) {
                  return realIterRef.throw(error);
                },
              },
            );
          },
          listMessages: async () => {
            checkAccess();
            return realMember.listMessages();
          },
          invite: async name => {
            checkAccess();
            return realMember.invite(name);
          },
          getMembers: async () => {
            checkAccess();
            return realMember.getMembers();
          },
          getProposedName: () => {
            checkAccess();
            return realMember.getProposedName();
          },
          getMemberId: () => {
            checkAccess();
            return realMember.getMemberId();
          },
          getAttenuator: async invitedAs => {
            checkAccess();
            return realMember.getAttenuator(invitedAs);
          },
        },
      );

      const attenuator = makeExo(
        'EndoChannelAttenuator',
        AttenuatorInterface,
        {
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
        },
      );

      return { proxyExo, attenuator, checkAccess, checkPostRate };
    };

    // Rehydrate members from memberStore
    const memberStoreNames = memberStore.list();
    for (const storeName of memberStoreNames) {
      if (storeName.startsWith('member-')) {
        const id = memberStore.identifyLocal(storeName);
        if (id !== undefined) {
          const value = await provide(id);
          if (value && typeof value === 'object') {
            const data = /** @type {MemberEntry} */ (value);
            const { memberExo, memberId } = makeMemberExo(
              data.proposedName,
              data.pedigree,
              data.memberId,
            );
            memberRegistry.set(memberExo, {
              proposedName: data.proposedName,
              invitedAs: data.invitedAs,
              memberId,
              inviterMemberId: data.inviterMemberId,
              pedigree: [...data.pedigree],
              valid: data.valid,
              rateLimitPerSecond: data.rateLimitPerSecond,
              temporaryBanUntil: data.temporaryBanUntil,
              viaJoin: data.viaJoin,
            });
            const num = Number(memberId);
            if (num >= nextMemberIdNum) {
              nextMemberIdNum = num + 1;
            }
          }
        }
      }
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
      invite: async memberProposedName => {
        // Enforce unique invitation names per inviter (admin)
        for (const [, existingEntry] of memberRegistry) {
          if (
            existingEntry.invitedAs === memberProposedName &&
            existingEntry.inviterMemberId === adminMemberId &&
            !existingEntry.viaJoin
          ) {
            throw new Error(
              `An invitation named ${q(memberProposedName)} already exists from this member`,
            );
          }
        }
        const pedigree = [proposedName];
        const { memberExo: member, memberId } = makeMemberExo(
          memberProposedName,
          pedigree,
        );
        const newEntry = {
          proposedName: memberProposedName,
          invitedAs: memberProposedName,
          memberId,
          inviterMemberId: adminMemberId,
          pedigree,
          valid: true,
          rateLimitPerSecond: 0,
          temporaryBanUntil: 0,
          viaJoin: false,
        };
        memberRegistry.set(member, newEntry);
        const noopCheck = () => {};
        /**
         * @param {number} _now
         * @param {number} _lastPostTime
         */
        const noopRateCheck = (_now, _lastPostTime) => {};
        const { proxyExo, attenuator, checkAccess, checkPostRate } =
          makeAttenuatedProxy(member, noopCheck, noopRateCheck, newEntry);
        memberCheckAccessMap.set(member, checkAccess);
        memberPostRateCheckMap.set(member, checkPostRate);
        await persistMemberEntry(newEntry);
        return harden([attenuator, proxyExo]);
      },
      join: async memberProposedName => {
        // Idempotent: return existing member if already joined with this name
        const existing = joinedExosByName.get(memberProposedName);
        if (existing) {
          const entry = memberRegistry.get(existing);
          if (entry && entry.valid) {
            return existing;
          }
        }
        const pedigree = [proposedName];
        const { memberExo: member, memberId } = makeMemberExo(
          memberProposedName,
          pedigree,
        );
        memberRegistry.set(member, {
          proposedName: memberProposedName,
          invitedAs: memberProposedName,
          memberId,
          inviterMemberId: adminMemberId,
          pedigree,
          valid: true,
          rateLimitPerSecond: 0,
          temporaryBanUntil: 0,
          viaJoin: true,
        });
        joinedExosByName.set(memberProposedName, member);
        return member;
      },
      getMembers: async () => {
        const result = [];
        for (const [, entry] of memberRegistry) {
          if (entry.inviterMemberId === adminMemberId && !entry.viaJoin) {
            result.push(
              harden({
                proposedName: entry.proposedName,
                invitedAs: entry.invitedAs,
                memberId: entry.memberId,
                pedigree: [...entry.pedigree],
                active: entry.valid,
              }),
            );
          }
        }
        return harden(result);
      },
      getProposedName: () => proposedName,
      getMemberId: () => adminMemberId,
      getAttenuator: async invitedAs => {
        return makeAttenuatorForEntry(adminMemberId, invitedAs);
      },
    });

    return channelExo;
  };

  return makeChannel;
};
harden(makeChannelMaker);
