# @endo/space-file-explorer

The **File Explorer Space** for the Endo chat client: a browsable, editable view
over Endo filesystem, mount, and [`@endo/exo-git`](../exo-git) capabilities.

It classifies a capability (filesystem, mount, or git worktree), presents its
contents as a tree, and supports opening files in a Monaco editor (via
[`@endo/monaco-wrapper`](../monaco-wrapper)), creating/renaming/removing
entries, layered edits with a unified diff, and browsing git revisions.

## Exports

- `fileExplorerComponent(...)` — mount the explorer into a host element.

## Styling

The explorer currently relies on the host chat application's stylesheet for its
class names. Extracting a self-contained `./space-file-explorer.css` export is a
follow-up.
