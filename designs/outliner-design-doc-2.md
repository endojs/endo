Instead of the three icons on the right of each node for reply/edit/delete, let's see if we can make the interaction pattern feel more intuitive, like interacting with a traditional outliner like Roam Research, Obsidian, or Workflowy.

You can find some recommendations for how to achieve this in docs/OUTLINER_INTERACTION_PATTERNS.md

One key architectural feature we'll need to manage to minimize protocol noise is when to broadcast node creation.

If the cursor is in one node, then the user hits enter, it would create a peer, but we don't know that the user intends to keep it a peer, since they might then hit tab, or shift-tab to indent or dedent respectively, and so my current recommendation is that we postpone node creation until the user's cursor leaves a node, or some debounced timer expires, and then allow indent/dedent operations to be represented as types of edits later (which are presumably affecting the replyTo value and order of nodes).

I'm also not sure how we should go about recording the visible order of child nodes, since we are no longer assuming they are listed chronologically. It would be best if we can do this without modifying the message schema, so maybe we have an extra table within the outliner channel that allows storing this kind of information. The ability to mutate the placement of a node should require access to that node, like `channel.moveNodeToAfter(node, newPrecursor)` or something.f
