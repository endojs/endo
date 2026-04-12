# Outliner: Design Document

## Endo Petdaemon — Type 3 Chat System

### Summary

The Outliner is not a chat. It is a collaboratively editable, structured document — closest in spirit to Google Wave, built on the Endo Petdaemon's object-capability infrastructure. A text input at the bottom lets users append content, but any participant with write access can edit, reorder, or hide any node. All mutations carry provenance, viewers make subjective administrative decisions about whose edits they trust, and subtrees can be restricted to subsets of participants.

---

### Document Model

The document is a tree of nodes, structurally identical to Roam's graph notes. Each node contains rich content: text, formatted blocks, attachments, and Endo Petdaemon object references from the user's pet store. Nodes have parent-child relationships supporting progressive disclosure — children are expandable under their parent, and the tree can nest to arbitrary depth.

Any user with write access can edit any node's content, reorder sibling nodes, or delete/hide nodes. These actions are all expressed as typed replies at the protocol level.

---

### Input

A persistent input box at the bottom of the view, identical to the standard Endo Petdaemon chat input. Submitting appends a new Reply-type node at the bottom of the current scope. The input supports rich formatting, attachments, and pet store object references.

---

### Immutability and Reply Types

At the protocol level, all posts are immutable. Every action — including what the user experiences as an edit or deletion — is a **typed reply** referencing an existing node. The reply's type determines how the renderer treats it.

#### Built-in Reply Types

**Reply** — A standard conversational response, rendered as a child node.

**Edit** — Proposes replacement text for the target node. The renderer shows the latest accepted Edit's content in place of the original.

**Deletion** — Targets another message (often an Edit) and asks the renderer to disregard it. Deletions can target any reply type, including other Deletions.

**Move** — Proposes reordering the target node to a new position among its siblings.

**Pro** — A reply arguing in favor of the target node's claim, inspired by Kialo-style structured debate.

**Con** — A reply arguing against the target node's claim.

**Supporting Evidence** — Attaches evidence or references supporting the target node.

#### User-Defined Reply Types

A channel administrator can **add new reply type strings at runtime** (e.g., "Question", "Action Item", "Concern"). These appear in the reply-type picker for all participants. A reply type is just a string tag on a reply message — no protocol changes needed.

By default, all channel members with write access can post any reply type.

#### Concurrent Edit Policy

When two users submit Edit replies targeting the same node, **last write wins**. The earlier edit is not lost — it remains in the edit queue and can be reviewed, restored, or deleted like any other Edit. No locking or operational transformation is applied. The edit queue is the resolution mechanism.

---

### Private Reply Trees

Any reply (of any type) can be **restricted to a subset of the channel's participants** at creation time. The restricted reply and its entire subtree are visible only to the named participants. Other channel members cannot see the subtree at all — it does not exist in their view.

This is author-side access control, distinct from viewer-side blocking. It maps directly to Endo's capability model: the private subtree is a capability granted only to the specified participants. The restriction is set at reply creation via a participant picker in the reply UI.

Private subtrees can themselves contain further private subtrees with narrower participant sets, enabling layered confidentiality within a single document.

---

### Edit Rendering

When a node has been edited, the rendered text is the content from the **most recent accepted Edit reply** in the edit queue. Below the node text, the label **"Edited by [pet name]"** is displayed, where `[pet name]` is the author of the currently active edit.

Clicking "Edited by [pet name]" opens the **edit queue**.

---

### Edit Queue

The edit queue shows the full chain of Edit and Deletion replies targeting a node, most recent at top. Each entry shows the content of that edit, who authored it, and when.

A viewer can **"delete" an edit** from this queue. This posts a new Deletion-type reply targeting that Edit message. The renderer skips that edit when computing the current node text, falling back to the next most recent undeleted Edit (or the original content if all edits are deleted).

Deletions themselves appear in the queue and can in turn be deleted, restoring the edit they targeted.

From any entry in the edit queue, the viewer can click the author's name to open their **profile/administration panel**, where they can block the user, adjust their invitation permissions, or downgrade them to read-only.

---

### Avatar Lineage

Each node displays a **visual array of partially overlapping circular avatars** in its corner. Avatars are ordered left-to-right by edit sequence: the original poster is leftmost (lowest z-index), subsequent editors overlap progressively to the right.

Clicking this avatar array opens the edit queue.

---

### Global Playback

When a user visits a document they haven't viewed in a while, the system offers **Global Playback**: a chronological walk-through of every reply-type message (Reply, Edit, Deletion, Move, etc.) across all nodes since the user's last visit.

Playback steps through changes one at a time, visually highlighting where each change lands in the document tree. This gives the returning viewer the narrative of how the conversation evolved — not just the current state, but the sequence of contributions that produced it.

Playback is also available on demand at any time, with the option to play back from the beginning of the document's history or from any point in time.

For nodes the viewer has already seen, edits made since their last visit are displayed with diff-style markup (additions highlighted, deletions struck through). For nodes the viewer is seeing for the first time, only the current content is shown — no diff markup — with the avatar lineage and "Edited by" attribution indicating multiple contributors. The viewer can always use Playback to inspect the full history.

---

### Viewer-Side Administration

Blocking a user **excludes that user's edits** from the viewer's rendered state of the document. This is applied retroactively: blocking someone slices out their mutations from the viewer's entire history of that node's content.

The block propagates: anyone the viewer subsequently invites to this channel inherits the block. This creates a **personalized, unique view** of any channel — each viewer's document state reflects their own trust decisions.

The profile/administration panel (reachable from the edit queue, avatar lineage, or any user mention) allows the administrator to downgrade a user's invitation from read-write to read-only, or revoke it entirely.

---

### Permissions Model

Initial invitation endows either **read-only** or **read-write** access. Read-write is the default within a Type 3 channel.

The channel administrator can **adjust any outstanding invitation** between read-only and read-write at any time, from the invitation management UI, from the user's profile panel (reachable via the edit queue), or from the user's profile panel accessed through the avatar lineage.

Rate limiting on writes (including edits and moves) matches the rate limiting in Type 1 (Chat) and Type 2 (Forum).

Custom attenuation code can be pasted into an invitation's attenuator field. This code runs in a secure ECMAScript compartment (Endo's SES/Compartment). Even untrusted attenuator code can at worst interrupt invitees' participation — it cannot escalate privileges.

---

### Sharing and Invitation

A sharing modal describes the policies the content will be shared with: read-only, read-write, rate limits. A `+ Add Custom` option allows pasting attenuation code.

Keyboard shortcut: `Meta+J` creates a new top-level node/channel.

---

### Navigation

The left panel shows a list of bookmarked notes/channels (analogous to Roam's favorites). A breadcrumb bar at the top shows the **user's navigation history** (how they arrived at the current node), not the node's hierarchical position.

---

### Reference Scoping

Having a reference to a message does **not** grant reference to its parent. This follows the file-system principle: endowing a directory does not endow upward. Contained content is implied; non-contained content is not. You can give the bag and know that nothing but what's in the bag is getting handed over.

This applies equally to private reply trees: having access to a private subtree does not grant access to its parent node's other private subtrees or to the broader document beyond what the viewer's invitation already covers.

---

### Agent Participation

In Endo, the Agent interface describes both human personas and automated participants (robots/bots). Any Agent holding a channel capability can participate in the Outliner — reading nodes, posting reply-type messages, and receiving events.

Users can `@mention` an Agent in a node. If the Agent has channel access and an instruction like "if mentioned, reply," the mention acts as a **wake-up command**. The Agent receives its current view of the document and decides how to act.

Explicit mentions are important in multi-user real-time collaboration — users may brainstorm for a while before wanting to trigger an Agent response.

Because Agents are first-class participants, they can post any reply type: Replies, Edits, Pro/Con arguments, Supporting Evidence, or user-defined types. Their contributions carry the same provenance as human contributions — they appear in avatar lineages, edit queues, and Playback. Viewers can block an Agent's edits or downgrade its permissions just as they would for a human participant.

---

### Relationship to Roam

The Outliner is effectively **Roam implemented on Endo Petdaemon**. It replaces Automerge CRDTs with Endo's object-capability message-passing model.

It gains: fine-grained permissions beyond read/write, edit provenance, viewer-side administration, private reply trees, programmable attenuation, global playback, and the Endo invitation system.

It loses: real-time collaborative text editing within a single block (Automerge/NextGraph's CRDT strength). This is a known tradeoff. The concurrent edit policy (last write wins, review via edit queue) is the pragmatic substitute.

---

### Open Questions

- How deep the avatar lineage array should display before truncating.
- Whether intermediate "thinking" or "loading" states from Agents should be a distinct reply type or a transient annotation.
- Conflict resolution when two users simultaneously Move the same sibling set (last-write-wins applies to Edits, but concurrent Moves may need special handling).
- Governance for user-defined reply types: can any participant add them, or only the channel administrator?
- Should Pro/Con reply types trigger special rendering (e.g., color-coded columns, vote tallies)?
- Maximum nesting depth for deletions-of-deletions before the UI should simplify the presentation.
- Whether private reply tree visibility can be expanded after creation (adding participants to an existing private subtree).
- At what threshold of unseen changes Global Playback should be offered automatically vs. available on demand.
