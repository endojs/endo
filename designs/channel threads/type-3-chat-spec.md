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

### Immutability and Edit Provenance

- At the **protocol level**, all posts are immutable.
- An "edit" is a message referencing a previous object, proposing a replacement. Example message types:
  - `add`: "I'm adding text to the channel."
  - `edit`: "I propose we change that node's text to this."
  - `move`: "I propose we reorder node X to position Y."
  - `hide`: "I propose we hide node X."
- By default in a Type 3 environment, all channel members with write access can perform all mutation types.

### Edit History and Avatar Lineage

- Each node displays a **visual array of partially overlapping circular avatars** in its corner.
- Avatars are ordered left-to-right by edit sequence: the original poster is leftmost (lowest z-index), subsequent editors overlap progressively to the right.
- Clicking this avatar array opens the **edit history**: a chronological list of mutations, each attributed to a user.
- From any edit in the history, the viewer can click the editor's identity to open their profile/administration panel.

### Viewer-Side Administration

- Blocking a user **excludes that user's edits** from the viewer's rendered state of the document.
- This is applied retroactively: blocking someone slices out their mutations from the viewer's entire history of that node's content.
- The block propagates: anyone the viewer subsequently invites to this channel inherits the block.
- This creates a **personalized, unique view** of any channel — each viewer's document state reflects their own trust decisions.

### Permissions Model

- Initial invitation endows either **read-only** or **read-write** access.
- Read-write is the default assumption within a Type 3 channel.
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

- Exact UI for the edit-history panel.
- How deep the avatar lineage array should display before truncating.
- Whether intermediate "thinking" or "loading" states from agents should be a distinct message type or a transient annotation.
- Conflict resolution when two users simultaneously reorder the same sibling set.
