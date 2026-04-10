# Type 1 Chat: Threaded Channel Chat

## Technical Specification — Endo Petdaemon

### Summary

Type 1 is a Slack/Discord-inspired threaded chat system built on the Endo Petdaemon platform. It takes opinionated positions from both models and diverges where neither goes far enough — notably, threads are not limited to a fixed depth of one.

### Core Behavior

- Messages live in **channels**.
- Any message can be **replied to**, producing a thread.
- A reply within a thread is, by default, treated as a reply to the **thread's parent post** (keeping the thread flat in the common case).
- However, users **can** reply to a specific reply, creating nested sub-threads. There is no enforced maximum depth.
- This mirrors outliner-style note-taking, where any idea can have multiple peer replies branching from it.

### Threading Model

- Threads are trees, not flat lists.
- The default reply target is the root of the current thread, but the user may override this to reply to any node.
- When providing context to an LLM agent, the system can extract a **single line of thinking** (a path from root to leaf) rather than the entire thread tree — useful for focused AI responses.

### Channel Administration

- Each channel has an owner with administration rights.
- Rate limiting applies to writes (messages, edits, moves) per user.
- Standard Endo Petdaemon invitation and attenuation mechanisms apply.

### Message Properties

- Messages are treated as **immutable objects** at the protocol level.
- Edits are new messages referencing the original, with policy determining what the viewer sees.
- Messages can reference Endo Petdaemon objects from the user's pet store.

### Current Status

Type 1 is **functionally complete**. Minor polish remains possible but is not blocking. The decision is to move forward to Type 2.
