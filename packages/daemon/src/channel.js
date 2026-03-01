// @ts-check

import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';
import { makeIteratorRef } from './reader-ref.js';
import { makeChangeTopic } from './pubsub.js';
import {
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
  invite: 'Create a new channel member with the given proposed name.',
  join: 'Join the channel as a member with the given proposed name.',
  revoke: 'Revoke a member (admin only).',
  getMembers: 'List all members with their proposed names and pedigree chains.',
  getProposedName: 'Get the proposed display name for this channel or member.',
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
};
harden(channelMemberHelp);

/**
 * @param {object} args
 * @param {Provide} args.provide
 */
export const makeChannelMaker = ({ provide }) => {
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
     * @property {string[]} pedigree - Invitation chain
     * @property {boolean} revoked
     */

    /**
     * Member registry: maps member Exo identity to metadata.
     * @type {Map<object, MemberEntry>}
     */
    const memberRegistry = new Map();

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
     * Create a member Exo. The member reads its current proposedName from the
     * registry so that `setProposedName` changes take effect on future posts.
     * @param {string} initialProposedName
     * @param {string[]} pedigree
     * @returns {{ memberExo: object, memberId: string }}
     */
    const makeMemberExo = (initialProposedName, pedigree) => {
      const memberId = allocateMemberId();
      const frozenPedigree = harden([...pedigree]);

      const memberExo = makeExo(
        'EndoChannelMember',
        ChannelMemberInterface,
        {
          help: makeHelp(channelMemberHelp),
          post: async (strings, edgeNames, petNamesOrPaths, replyTo) => {
            const entry = memberRegistry.get(memberExo);
            if (!entry || entry.revoked) {
              throw new Error(
                `Channel member ${q(initialProposedName)} has been revoked`,
              );
            }
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
            if (!entry || entry.revoked) {
              throw new Error(
                `Channel member ${q(initialProposedName)} has been revoked`,
              );
            }
            entry.proposedName = newName;
          },
          followMessages: async () => {
            const entry = memberRegistry.get(memberExo);
            if (!entry || entry.revoked) {
              throw new Error(
                `Channel member ${q(initialProposedName)} has been revoked`,
              );
            }
            const iterator = (async function* channelMessages() {
              yield* messages;
              yield* messagesTopic.subscribe();
            })();
            return makeIteratorRef(iterator);
          },
          listMessages: async () => harden([...messages]),
          invite: async subMemberName => {
            const entry = memberRegistry.get(memberExo);
            if (!entry || entry.revoked) {
              throw new Error(
                `Channel member ${q(initialProposedName)} has been revoked`,
              );
            }
            const subPedigree = [...frozenPedigree, entry.proposedName];
            const { memberExo: subMember, memberId: subMemberId } =
              makeMemberExo(subMemberName, subPedigree);
            memberRegistry.set(subMember, {
              proposedName: subMemberName,
              invitedAs: subMemberName,
              memberId: subMemberId,
              pedigree: subPedigree,
              revoked: false,
            });
            return subMember;
          },
          getMembers: async () => {
            const result = [];
            // Include the admin
            result.unshift(
              harden({
                proposedName,
                memberId: adminMemberId,
                pedigree: [],
                active: true,
              }),
            );
            for (const [, entry] of memberRegistry) {
              result.push(
                harden({
                  proposedName: entry.proposedName,
                  invitedAs: entry.invitedAs,
                  memberId: entry.memberId,
                  pedigree: [...entry.pedigree],
                  active: !entry.revoked,
                }),
              );
            }
            return harden(result);
          },
          getProposedName: () => {
            const entry = memberRegistry.get(memberExo);
            return entry ? entry.proposedName : initialProposedName;
          },
        },
      );

      return { memberExo, memberId };
    };

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
        const pedigree = [proposedName];
        const { memberExo: member, memberId } = makeMemberExo(
          memberProposedName,
          pedigree,
        );
        memberRegistry.set(member, {
          proposedName: memberProposedName,
          invitedAs: memberProposedName,
          memberId,
          pedigree,
          revoked: false,
        });
        return member;
      },
      join: async memberProposedName => {
        const pedigree = [proposedName];
        const { memberExo: member, memberId } = makeMemberExo(
          memberProposedName,
          pedigree,
        );
        memberRegistry.set(member, {
          proposedName: memberProposedName,
          invitedAs: memberProposedName,
          memberId,
          pedigree,
          revoked: false,
        });
        return member;
      },
      revoke: async member => {
        const entry = memberRegistry.get(member);
        if (!entry) {
          throw new Error('Unknown member');
        }
        entry.revoked = true;
      },
      revokeByName: async memberName => {
        for (const [, entry] of memberRegistry) {
          if (entry.proposedName === memberName && !entry.revoked) {
            entry.revoked = true;
            return;
          }
        }
        throw new Error(`No active member named ${q(memberName)}`);
      },
      getMembers: async () => {
        const result = [];
        // Include the admin (creator)
        result.push(
          harden({
            proposedName,
            memberId: adminMemberId,
            pedigree: [],
            active: true,
          }),
        );
        for (const [, entry] of memberRegistry) {
          result.push(
            harden({
              proposedName: entry.proposedName,
              invitedAs: entry.invitedAs,
              memberId: entry.memberId,
              pedigree: [...entry.pedigree],
              active: !entry.revoked,
            }),
          );
        }
        return harden(result);
      },
      getProposedName: () => proposedName,
    });

    return channelExo;
  };

  return makeChannel;
};
harden(makeChannelMaker);
