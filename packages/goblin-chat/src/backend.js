// @ts-check

/**
 * JavaScript port of the Guile Goblins `(goblin-chat backend)` module.
 *
 * This is a test utility so an Endo OCapN peer can host a chatroom that a
 * Goblins peer (e.g. `spritely/goblin-chat`) can join, or join a chatroom
 * hosted by a Goblins peer. Method names are kebab-case to match the
 * selectors Goblins sends over CapTP; the Endo OCapN dispatcher coerces
 * incoming selector symbols to string method names.
 *
 * The aim of this port is to be observably **bit-for-bit equivalent** to
 * upstream `(goblin-chat backend)` over the wire. Where upstream has
 * documented quirks or outright bugs (e.g. `list-users` is a no-op, the
 * `unsubscribe` thunk dangles, the join backfill echoes the joiner back
 * to themselves), we mirror them rather than "fix" them — interop tests
 * are easier when both peers agree on how things misbehave. Each such
 * site is called out with a "Bit-for-bit with Guile" comment.
 *
 * Source compared against:
 *   https://codeberg.org/spritely/goblin-chat/raw/branch/main/goblin-chat/backend.scm
 *
 * Original copyright, carried over since this is a direct port:
 *   Copyright 2023 Jessica Tallon
 *   Copyright 2020-2022 Christine Lemmer-Webber
 *   Licensed under the Apache License, Version 2.0
 */

import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

/**
 * Sealer / unsealer / sealed? triplet. The sealed handles are plain Far
 * remotables; the WeakMap stores only the unsealed value, so a handle that
 * escapes to another peer carries no value and cannot be forged.
 */
const spawnSealerTriplet = () => {
  /** @type {WeakMap<object, any>} */
  const contents = new WeakMap();
  const sealer = Far('sealer', value => {
    const handle = Far('sealed', {});
    contents.set(handle, value);
    return handle;
  });
  const unsealer = Far('unsealer', handle => {
    if (!contents.has(handle)) {
      throw Error('unsealer: value was not sealed by the matching sealer');
    }
    return contents.get(handle);
  });
  const isSealed = Far('sealed?', handle => contents.has(handle));
  return { sealer, unsealer, isSealed };
};

/**
 * ^chatroom
 *
 * @param {string} selfProposedName
 */
export const makeChatroom = selfProposedName => {
  /** @type {Map<any, any>} user -> user-messaging-channel inbox */
  const subscribers = new Map();

  const sendToSubscribers = (selector, ...args) => {
    for (const inbox of subscribers.values()) {
      E.sendOnly(inbox)[selector](...args);
    }
  };

  /**
   * ^user-messaging-channel
   *
   * One of these is handed back to each user after their subscription is
   * finalized. It's the capability they use to speak in the room.
   *
   * Mirrors the Guile `^user-messaging-channel`: on `leave` the actor
   * `bcom`s into a `dead-beh` that returns the symbol `'CONNECTION-CLOSED`
   * for any subsequent invocation. We approximate that here by flipping
   * an `alive` flag and short-circuiting each known selector to the
   * string `'CONNECTION-CLOSED'`. (We can't intercept *unknown*
   * selectors short of using a Proxy, which Far doesn't compose with;
   * for the protocol's documented surface this is equivalent.)
   *
   * @param {any} associatedUser
   * @param {any} _userInbox
   */
  const makeUserMessagingChannel = (associatedUser, _userInbox) => {
    let alive = true;
    const dead = () => 'CONNECTION-CLOSED';
    return Far('user-messaging-channel', {
      leave: () => {
        if (!alive) return dead();
        subscribers.delete(associatedUser);
        sendToSubscribers('user-left', associatedUser);
        alive = false;
        // Guile's `(bcom dead-beh)` evaluates to unspecified; the leave
        // call itself returns nothing meaningful (only subsequent calls
        // see the dead behavior).
        return undefined;
      },
      'send-message': sealedMsg => {
        if (!alive) return dead();
        sendToSubscribers('new-message', associatedUser, sealedMsg);
        return 'OK';
      },
      'list-users': () => {
        if (!alive) return dead();
        // Bug-for-bug with upstream: Guile uses `ghash-for-each` here
        // (iteration-for-side-effect) with a TODO note "add 'keys to
        // ^ghash". The lambda body produces the user, but `for-each`
        // discards it, so the call resolves to unspecified. We mirror
        // that — walk the keys, return nothing.
        Array.from(subscribers.keys());
        return undefined;
      },
    });
  };

  /**
   * ^finalize-subscription
   *
   * Sealed by the user before being returned from `subscribe`. The
   * user-controller unseals it and calls it once with the user's inbox; it
   * then wires the subscription up and returns the messaging channel.
   *
   * @param {any} associatedUser
   */
  const makeFinalizeSubscription = associatedUser => {
    let finalized = false;
    return Far('finalize-subscription', userInbox => {
      if (finalized) {
        throw Error('Already finalized');
      }
      finalized = true;
      // notify other subscribers first
      sendToSubscribers('user-joined', associatedUser);
      // subscribe the new user
      subscribers.set(associatedUser, userInbox);
      // Backfill: tell the new user about everyone already present.
      //
      // Bit-for-bit with Guile: the iteration runs over `subscribers`
      // *after* the new user has been inserted, with no self-skip. So
      // the joiner receives a `user-joined` echo of themselves as the
      // last item in the backfill. The TUI handles the self-echo on
      // its end.
      for (const presentUser of subscribers.keys()) {
        E.sendOnly(userInbox)['user-joined'](presentUser);
      }
      return makeUserMessagingChannel(associatedUser, userInbox);
    });
  };

  return Far('chatroom', {
    'self-proposed-name': () => selfProposedName,
    subscribe: async user => {
      const subscriptionSealer = await E(user)['get-subscription-sealer']();
      const finalizeSub = makeFinalizeSubscription(user);
      // Ask the user's sealer to seal our finalizer; return the sealed
      // handle to the caller so only the owning controller can activate it.
      return E(subscriptionSealer)(finalizeSub);
    },
  });
};

/**
 * spawn-user-controller-pair
 *
 * @param {string} selfProposedName
 */
export const makeUserControllerPair = selfProposedName => {
  const chatMsg = spawnSealerTriplet();
  const subscription = spawnSealerTriplet();

  /** @type {Map<any, any>} room -> authenticated channel */
  const roomsToChannels = new Map();
  /** @type {Set<any>} */
  const clientSubscribers = new Set();

  const user = Far('user', {
    'self-proposed-name': () => selfProposedName,
    'get-chat-sealed?': () => chatMsg.isSealed,
    'get-chat-unsealer': () => chatMsg.unsealer,
    'get-subscription-sealer': () => subscription.sealer,
  });

  const sendToClients = (selector, ...args) => {
    for (const client of clientSubscribers) {
      E.sendOnly(client)[selector](...args);
    }
  };

  /**
   * ^user-inbox
   *
   * The Guile version wards the controller-only methods (`revoke`,
   * `subscribe`) behind an incanter so only the local controller can
   * reach them. We keep the same controller-only surface (and only
   * those two methods, matching upstream) as a closed-over plain
   * object, and expose only the public surface to the wire. Same
   * access gate, no warden dance.
   *
   * @param {any} context
   */
  const makeUserInbox = context => {
    const roomUsers = new Set();
    /** @type {Set<any>} subscribers receiving 'user-joined'/'user-left'/'new-message'. */
    const inboxSubscribers = new Set();
    let revoked = false;

    const publish = (selector, ...args) => {
      for (const sub of inboxSubscribers) {
        E.sendOnly(sub)[selector](...args);
      }
    };

    // Public surface: what the chatroom calls on us. Kebab-case to match
    // Goblins selectors.
    const publicInbox = Far('user-inbox', {
      'new-message': async (fromUser, sealedMsg) => {
        if (revoked) throw Error('Revoked!');
        const chatUnsealer = await E(fromUser)['get-chat-unsealer']();
        const message = await E(chatUnsealer)(sealedMsg);
        publish('new-message', context, fromUser, message);
      },
      'user-joined': joiningUser => {
        if (revoked) throw Error('Revoked!');
        roomUsers.add(joiningUser);
        publish('user-joined', joiningUser);
      },
      'user-left': leavingUser => {
        if (revoked) throw Error('Revoked!');
        roomUsers.delete(leavingUser);
        publish('user-left', leavingUser);
      },
      context: () => context,
    });

    // Bit-for-bit with Guile `controller-methods`: only `revoke` and
    // `subscribe` exist on the controller surface. Upstream's
    // `^unsubscribe` thunk reaches in for an `'unsubscribe` selector
    // that has no implementation, so it errors at call time — we
    // mirror that by leaving `unsubscribe` off the controller. The
    // `^authenticated-channel.subscribe` path below still hands back
    // the unsubscribe thunk so the on-the-wire shape matches; calling
    // it just rejects, exactly as in Guile.
    const controller = Object.freeze({
      revoke: () => {
        revoked = true;
      },
      subscribe: subscriber => {
        inboxSubscribers.add(subscriber);
        for (const u of roomUsers) {
          E.sendOnly(subscriber)['user-joined'](u);
        }
        return true;
      },
    });

    return { publicInbox, controller };
  };

  /**
   * ^authenticated-channel
   *
   * Wraps the room-channel returned by the chatroom so clients can hand off
   * a plain message; we seal it on the way out and forward subscribe
   * through the inbox controller.
   *
   * @param {any} roomChannel
   * @param {any} inboxController
   */
  const makeAuthenticatedChannel = (roomChannel, inboxController) =>
    Far('authenticated-channel', {
      'send-message': async contents => {
        const sealedMsg = await E(chatMsg.sealer)(contents);
        return E(roomChannel)['send-message'](sealedMsg);
      },
      subscribe: subscriber => {
        inboxController.subscribe(subscriber);
        return [
          'OK',
          // Bit-for-bit with Guile: the thunk reaches for an
          // `'unsubscribe` method on the inbox controller that the
          // controller-methods table doesn't define. Calling it
          // therefore rejects with "no such method", same as upstream.
          Far('unsubscribe', () =>
            /** @type {any} */ (inboxController).unsubscribe(subscriber),
          ),
        ];
      },
      leave: () => E(roomChannel).leave(),
      'list-users': () => E(roomChannel)['list-users'](),
    });

  const userController = Far('user-controller', {
    whoami: () => user,
    'connect-client': client => {
      clientSubscribers.add(client);
      return ['OK', new Map(roomsToChannels)];
    },
    'join-room': async room => {
      if (roomsToChannels.has(room)) {
        throw Error('Already subscribed to the room');
      }
      const { publicInbox, controller } = makeUserInbox(room);
      const sealedFinalizer = await E(room).subscribe(user);
      const finalizer = await E(subscription.unsealer)(sealedFinalizer);
      const roomChannel = await E(finalizer)(publicInbox);
      const authenticated = makeAuthenticatedChannel(roomChannel, controller);
      roomsToChannels.set(room, authenticated);
      sendToClients('we-joined-room', room, authenticated);
      return authenticated;
    },
  });

  return { user, userController };
};
