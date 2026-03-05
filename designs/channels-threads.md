# Chat Threading System Specification

## 1. Implicit Reply Chain

Each new message includes a `replyTo` field that, by default, references the previous message, forming a linked list.

## 2. Message Hover Actions

When hovering over a message in the channel view, icons appear on the right side of the message (similar to Slack or Signal):

- **React** - an outline of a smile emoji, allowing adding "eacts".
- **Reply** — an arrow swooping to the left.
- **More options (⋯)** — a three-dot menu containing additional author+admin-only actions, including "mark as new topic", or "set reply to".

## 3. Reactions

A reaction is similar to a reply but instead of appending a new message, it attaches an emoji to the message bubble.

- Hovering over a reaction emoji shows the names of users who reacted with it.
- A count is displayed on the emoji when more than one user has reacted. If only one user has reacted, no count is shown.

## 4. Reply Compose Flow

When a user clicks the reply button:

1. A small-font preview of the target message is pinned above the input bar to indicate the message being replied to.
2. An **X** button in the corner of this preview dismisses it, converting the draft back to a normal (non-reply) message.

## 5. Reply Display

A sent reply looks like a normal message but includes a small connector line leading up to a small-font preview of the message it replies to.

## 6. Thread View

Clicking the small-font reply preview opens a **thread view** that slides out from the right side of the screen.

### Thread Rendering Algorithm

1. Start from the message that was clicked (the reply target).
2. Display it as a regular message (since within the thread view, all messages are shown at full size).
3. Climb the linked list of replies to build the thread.

In a typical chat, this resembles the normal chat view. The thread view exists to isolate and clean up a single conversational thread.

## 7. Thread Curation Actions

When hovering over messages in the thread view, a special three-dot menu appears with:

- **Prune message from thread** — removes the message from the current thread by reassigning its `replyTo` field to the most recent message before itself that is *not* part of the current thread. This may incorrectly attach it to another thread, but it can be pruned again until it reaches the correct position.
- **Mark as new topic** — clears the message's `replyTo` field, making it the first message of the thread it belongs to (i.e., it is no longer considered a reply).

The goal is not to produce a perfect threading representation immediately, but to let a chat room *tend toward* coherent threads over time for the purpose of conserving context once meaningful subthreads emerge.

## 8. Saving a Thread as a Channel

At the top-right corner of the thread view is a **star button**.

1. Pressing the star prompts the user to assign a name to the thread.
2. The named thread is added to the user's channel list in the left-hand sidebar.
3. This thread now functions as a channel:
   - It is administered by the administrator of the parent channel.
   - Spam controls and moderation are inherited from the parent channel.
   - It can be selected and navigated to as if it were its own channel.
4. Messages added to this saved thread are implicitly replies to the messages in the thread view, which may not be the most recent messages in the parent channel. This enables interleaved, threaded discussions within a single channel, even as messages in that channel alternate between many topics.

### Snapshot Behavior

When a thread is saved, the virtual thread view is derived from the latest message in the thread *at the time the star was pressed*. Subsequent sub-threads that further bifurcate the conversation are not included, because it is unknown which branch the saving user intends to follow. Context is conserved only as it existed at the moment of saving.