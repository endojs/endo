# Type 2 Chat: Real-Time Forum Chat

## Technical Specification — Endo Petdaemon

### Summary

Type 2 is a hybrid between a chat and a threaded forum. Think of a Reddit post's comment tree, but inverted and live — the most recent active subtree floats to the bottom of the screen, as in a chat. This is the intermediate step between the Slack-like Type 1 and the fully collaborative outliner of Type 3.

### Layout and Navigation

- The chat view displays messages in a **tree structure rendered upside-down** relative to Reddit.
- The **latest message** is at the bottom of the viewport.
- Above it is the message it replies to, and above that is the message *that* replies to, and so on — the current active chain reads bottom-up.
- When a subtree is expanded, it dominates the channel view.
- Users can **collapse threads inline**, hiding branches they aren't currently interested in.

### Thread Promotion

- Any thread can be **bookmarked into the sidebar**.
- A bookmarked thread becomes visitable as if it were its own channel — "view replies" opens the thread as a first-class navigable space.
- Clicking into a thread is analogous to clicking into a subreddit post's comment section, but within the real-time chat context.

### Subtree Ordering

- The most recently active subtree pops to the bottom of the channel view.
- Siblings are ordered by recency of their most recent descendant activity (most recent last / lowest on screen).

### Node Ownership and Editability

- The author of a post has administration rights over **that node's content**.
- Each node is effectively a micro-channel for purposes of its own editability.
- Whether an author can curate (reorder, hide, remove) replies to their node is a separate, deferred concern. For now, reply curation is not part of Type 2 scope.

### Reply Visibility

- Replies to a node are messages in a channel that reference that node.
- It is up to **the channel viewer** to decide whether to exclude a participant — this is a viewer-side administrative decision, not an author-side one.

### Rate Limiting

- Same write rate limiting as Type 1 (messages, edits, moves).

### Relationship to Type 1

- Type 1 is essentially the degenerate case of Type 2 where threads are rarely promoted and the view stays mostly flat.
- Type 2's renderer must handle arbitrary-depth trees with collapsibility and sidebar promotion.

### Open Questions

- Exact UX for collapsing/expanding inline threads.
- Whether thread promotion to sidebar is automatic (based on depth/activity) or always manual.
- Transition animations when the active subtree changes.
