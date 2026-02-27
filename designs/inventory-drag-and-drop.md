# Inventory Drag and Drop

| | |
|---|---|
| **Date** | 2026-02-14 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

Currently, sharing capabilities between agents or organizing them into
directories requires CLI commands (`endo send`, `endo copy`, `endo mv`) or
typing names into the chat input with `@` syntax. There's no direct manipulation
affordance for moving capabilities between directories, sending them to other
agents, or reorganizing the inventory. This makes routine capability management
tedious and error-prone.

## Description of the Design

Implement HTML5 drag-and-drop on inventory items in the chat UI.

### Drag Sources

Any inventory item (`.pet-item-row`) is draggable. The drag data payload
includes the pet name path as both `text/plain` and a custom
`application/x-endo-petname` MIME type.

### Drop Targets

| Target | Action | Daemon API Call |
|--------|--------|-----------------|
| Directory item (expandable) | Copy capability into directory | `E(agent).copy(sourcePath, [targetDir, itemName])` |
| Agent/guest handle | Send capability to agent | `E(agent).send(targetAgent, strings, edgeNames, petNames)` |
| PINS section (work item 003) | Pin the capability | `E(agent).pin(petName)` |
| Trash/dismiss zone | Remove from inventory | `E(agent).remove(petName)` |

### Interaction Details

- **Visual feedback**: Drag ghost shows the pet name; drop targets highlight on
  dragover; invalid targets show a "no-drop" cursor.
- **Copy vs. move**: Default is copy. Hold Alt/Option during drop to move
  (copies then removes the source name).
- **Send confirmation**: Dropping onto an agent handle shows a confirmation
  dialog before sending, to prevent accidental capability sharing.
- **Multi-select**: Consider supporting shift-click or ctrl-click to select
  multiple items for batch drag operations (stretch goal).

### Implementation Notes

The chat UI is vanilla JS/DOM (`packages/chat/src/chat.js`). Use the native
HTML5 Drag and Drop API (`draggable`, `dragstart`, `dragover`, `drop` events)
rather than introducing a library dependency.

All necessary daemon API methods already exist:
- `E(agent).copy(sourcePath, targetPath)` — `packages/cli/src/commands/copy.js`
- `E(agent).move(fromPath, toPath)` — `packages/cli/src/commands/move.js`
- `E(agent).send(agentName, strings, edgeNames, petNames)` — `packages/cli/src/commands/send.js`
- `E(agent).remove(name)` — `packages/cli/src/commands/remove.js`

### Affected Packages

- `packages/chat` — drag-and-drop UI implementation

## Security Considerations

- Drag-to-send must respect the same authority as `endo send`. No privilege
  escalation occurs since all operations go through the existing agent API.
- Accidental drops could share capabilities unintentionally. The confirmation
  dialog for send-to-agent drops mitigates this.
- Move operations (copy + remove) are not atomic; a failure after copy but
  before remove could leave a duplicate. This matches the existing CLI `endo mv`
  behavior.

## Scaling Considerations

- Drag and drop is a UI-only concern. No daemon scaling impact.
- Large inventories may need virtualized rendering for smooth drag performance;
  this is a separate concern from drag-and-drop itself.

## Test Plan

- Manual UI test: drag item to directory, verify copy appears. Drag to agent
  handle, verify send message appears in recipient's inbox.
- Manual UI test: Alt-drag performs move (source name removed).
- Manual UI test: drag to invalid target shows no-drop cursor, dropping has no
  effect.
- Automated test: simulate drag events with `DataTransfer`, verify correct
  daemon API calls.

## Compatibility Considerations

- Pure UI change. No daemon API changes needed — all operations use existing
  methods.
- HTML5 Drag and Drop is supported in all modern browsers.

## Upgrade Considerations

- None.
