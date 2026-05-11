# Type 3 Chat: Collaborative Outliner

## Technical Specification — Endo Petdaemon

### Summary

Type 3 is not represented as a chat at all. It is a collaboratively editable, structured document — closest in spirit to Google Wave. A text input at the bottom lets users append content, but any participant can edit, reorder, or hide any node. All mutations carry provenance, and viewers make subjective administrative decisions about whose edits they trust.

### Document Model

- The document is a **tree of nodes** (like Muddle's graph notes).
- Each node contains rich content: text, formatted blocks, attachments, and Endo Petdaemon object references.
- Nodes have a parent-child structure supporting progressive disclosure and expandability.
- Any user with write access can edit any node's content, reorder sibling nodes, or delete/hide nodes.

### Input

- A persistent input box at the bottom of the view, identical to the standard Endo Petdaemon chat input.
- Submitting appends a new node at the bottom of the current scope.
- The input supports rich formatting, attachments, and pet store object references.

### Immutability and Reply Types

At the **protocol level**, all posts are immutable. Every action — including what appears to the user as an edit or deletion — is actually a **typed reply** to an existing node. The reply's type determines how the renderer treats it.

#### Built-in Reply Types

- **Reply** — a standard conversational response, rendered as a child node.
- **Edit** — proposes replacement text for the target node. The renderer shows the latest accepted edit's content in place of the original.
- **Deletion** — a reply targeting another message (often an Edit) that asks the renderer to disregard it. Deletions can target any reply type, including other deletions.
- **Move** — proposes reordering the target node to a new position among its siblings.
- **Pro** — a reply arguing in favor of the target node's claim. (Inspired by Kialo-style structured debate.)
- **Con** — a reply arguing against the target node's claim.
- **Supporting Evidence** — attaches evidence or references supporting the target node.

#### User-Defined Reply Types

Users can **add new reply type strings at runtime**. A channel administrator can define custom types (e.g., "Question", "Action Item", "Concern") that then appear in the reply-type picker for all participants. This keeps the system extensible without protocol changes — a reply type is just a string tag on a reply message.

By default in a Type 3 environment, all channel members with write access can post any reply type.

### Edit Rendering

- When a node has been edited, the rendered text is the content from the **most recent accepted Edit reply** in the edit queue.
- Below the node text, the label **"Edited by [pet name]"** is displayed, where `[pet name]` is the author of the currently active edit.
- Clicking "Edited by [pet name]" opens the **edit queue**: a chronological list of all Edit and Deletion replies targeting this node.

### Edit Queue

- The edit queue shows the full chain of Edit and Deletion replies, most recent at top.
- Each entry shows the content of that edit, who authored it, and when.
- A viewer can **"delete" an edit** from this queue. This does not destroy data — it posts a new Deletion-type reply targeting that Edit message. The renderer then skips that edit when computing the current node text, falling back to the next most recent undeleted edit (or the original content if all edits are deleted).
- Deletions themselves appear in the queue and can in turn be deleted (restoring the edit they targeted).
- From any entry in the edit queue, the viewer can click the author's name to open their **profile/administration panel**, where they can block the user, adjust their invitation permissions, or downgrade them to read-only.

### Avatar Lineage

- Each node displays a **visual array of partially overlapping circular avatars** in its corner.
- Avatars are ordered left-to-right by edit sequence: the original poster is leftmost (lowest z-index), subsequent editors overlap progressively to the right.
- Clicking this avatar array also opens the edit queue.

### Viewer-Side Administration

- Blocking a user **excludes that user's edits** from the viewer's rendered state of the document.
- This is applied retroactively: blocking someone slices out their mutations from the viewer's entire history of that node's content.
- The block propagates: anyone the viewer subsequently invites to this channel inherits the block.
- This creates a **personalized, unique view** of any channel — each viewer's document state reflects their own trust decisions.
- The profile/administration panel (reachable from the edit queue or any user mention) also allows the administrator to **downgrade a user's invitation from read-write to read-only**, or revoke it entirely. This is the same panel accessible when managing invitations directly.

### Permissions Model

- Initial invitation endows either **read-only** or **read-write** access.
- Read-write is the default assumption within a Type 3 channel.
- The channel administrator can **adjust any outstanding invitation** between read-only and read-write at any time, both from the invitation management UI and from the user's profile panel (reachable via the edit queue).
- Rate limiting on writes (including edits and moves) matches the rate limiting in Type 1 and Type 2.
- Future: custom attenuation code can be pasted into an invitation's attenuator field. This code runs in a secure ECMAScript compartment (Endo's SES/Compartment). Even untrusted attenuator code can at worst interrupt invitees' participation — it cannot escalate privileges.

### Sharing and Invitation

- A sharing modal describes the policies the content will be shared with: read-only, read-write, rate limits.
- A `+ Add Custom` option allows pasting attenuation code.
- Keyboard shortcut: `Meta+J` creates a new top-level node/channel.

### Navigation

- The left panel shows a list of bookmarked notes/channels (analogous to Muddle's favorites).
- A breadcrumb bar at the top shows the **user's navigation history** (how they arrived at the current node), not the node's hierarchical position.

### Reference Scoping

- Having a reference to a message does **not** grant reference to its parent.
- This follows the file-system principle: endowing a directory does not endow upward. Contained content is implied; non-contained content is not.
- "You can give the bag and know that nothing but what's in the bag is getting handed over."

### Agent Interaction

- Users can `@mention` an AI agent in a node.
- If the agent has channel access and an instruction like "if mentioned, reply," the mention acts as a **wake-up command**.
- The agent receives its current view of the chat, then decides how to act.
- Explicit mentions are important in multi-user real-time collaboration — users may brainstorm for a while before wanting to trigger an agent response.

### Relationship to Muddle

- Type 3 is effectively **Muddle implemented on Endo Petdaemon**.
- It replaces Automerge CRDTs with Endo's object-capability message-passing model.
- It gains: fine-grained permissions beyond read/write, edit provenance, viewer-side administration, programmable attenuation, and the Endo invitation system.
- It loses: real-time collaborative text editing within a single block (Automerge/NextGraph's CRDT strength). This is a known tradeoff.

### Open Questions

- How deep the avatar lineage array should display before truncating.
- Whether intermediate "thinking" or "loading" states from agents should be a distinct reply type or a transient annotation.
- Conflict resolution when two users simultaneously reorder the same sibling set.
- Governance for user-defined reply types: can any participant add them, or only the channel administrator?
- Should Pro/Con reply types trigger any special rendering (e.g., color-coded left/right columns, vote tallies)?
- Maximum nesting depth for deletions-of-deletions before the UI should simplify the presentation.
