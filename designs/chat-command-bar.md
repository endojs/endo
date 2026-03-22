# Chat Command Bar

| | |
|---|---|
| **Created** | 2026-03-02 |
| **Updated** | 2026-03-02 |
| **Author** | Kris Kowal (prompted) |
| **Status** | **Complete** |
| **Source** | Extracted from `packages/chat/DESIGN.md` |

## Command Bar States and Modeline

The command bar is the primary input area.
It transitions between distinct modes, each with specific keyboard behaviors
documented in the modeline.

### State: Empty (Send Mode)

**Visual**: Empty input field, placeholder text visible

**Modeline**:
- `@ inspect or message` - Type @ to start token entry
- `/ commands` - Type / to open command menu
- `Space continue with @{lastRecipient}` - (only if previous recipient exists)

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| `@` | Begin token autocomplete | Click token button (if exists) |
| `/` | Open command menu | Click menu button |
| `Space` | Insert last recipient (if any) | N/A - convenience shortcut |

### State: Token Autocomplete Visible

**Visual**: Autocomplete menu showing matching pet names

**Modeline**:
- `select reference` - Currently selecting a reference
- `Space chat` - Complete token and continue typing message
- `Enter inspect` - Complete token and inspect the value
- `↑↓ navigate` - Arrow keys to select different match

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| `↑` / `↓` | Navigate suggestions | Click on suggestion |
| `Space` / `Tab` | Complete token, add space, continue typing | Click suggestion |
| `Enter` | Complete token and inspect value | Double-click suggestion |
| `:` | Enter edge name mode | N/A - keyboard shortcut |
| `Escape` | Close menu | Click outside menu |
| `Backspace` | Delete character / close if at trigger | N/A |

### State: Token Only (Chip Present, No Message)

**Visual**: Single token chip in input, cursor after it

**Modeline**:
- `Enter inspect or write message` - Dual purpose based on content
- `⌫ delete chip` - Backspace removes the chip

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| `Enter` | Inspect the referenced value | Click chip |
| `Backspace` | Delete the chip | Click × on chip (if visible) |
| Any text | Begin composing message | Type directly |

### State: Token + Message Text

**Visual**: Token chip followed by message text

**Modeline**:
- `Enter send` - Send message to recipient
- `@ embed reference` - Add another token
- `⌫ delete chip` - Backspace at chip boundary deletes it

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| `Enter` | Send message | Click Send button |
| `@` | Begin another token | N/A - keyboard shortcut |
| `Backspace` (at chip) | Delete chip | Click × on chip |

### State: Text Only (No Token)

**Visual**: Text in input but no token chip

**Modeline**:
- `@ add recipient to send` - Need recipient to send

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| `@` | Begin token autocomplete | N/A |

### State: Command Selecting (After `/`)

**Visual**: Command menu visible with filtered options

**Modeline**:
- `type command name` - Filter by typing
- `Enter select` - Select highlighted command
- `Esc cancel` - Return to send mode

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| Type | Filter commands | N/A |
| `↑` / `↓` | Navigate commands | Hover over command |
| `Enter` / `Tab` / `Space` | Select command | Click command |
| `Escape` | Cancel, return to send | Click outside menu |

### State: Inline Command Form

**Visual**: Command form with labeled fields

**Modeline** (varies by command, example for general):
- `Enter submit` - Execute the command
- `Tab next field` - Move to next field
- `Esc cancel` - Return to send mode

**Keyboard Actions**:

| Key | Action | Manual Equivalent |
|-----|--------|-------------------|
| `Tab` | Next field | Click field |
| `Shift+Tab` | Previous field | Click field |
| `Enter` | Submit form | Click Execute button |
| `Escape` | Cancel command | Click × button |

### State: Eval Command (Inline)

**Modeline**:
- `@ add endowment` - Add a binding
- `Enter evaluate` - Run the code
- `⌘Enter expand to editor` - Open modal editor
- `Esc cancel` - Return to send mode

## Value Modal

The value modal displays inspected values and allows saving them with pet
names.

### Value States

| State | Title Display | Description |
|-------|---------------|-------------|
| Has ID + pet names | `@foo @bar` (blue chips) | Value retained in store with names |
| Has ID + no pet names | `(unnamed)` | Value retained but not named |
| Has message context | `#42:attachment` (gray chip) | Value from inbox message |
| Ephemeral (no ID) | `Ephemeral Value` | Transient value (e.g., from `/list`) |

A value can show BOTH message context chip AND pet name chips if applicable.

### Modal Actions

| Action | Keyboard | Manual |
|--------|----------|--------|
| Close | `Escape` | Click × or backdrop |
| Save | `Enter` (in name field) | Click Save button |
| Enter Profile | N/A | Click "Enter Profile" (for host types) |

## Field Types

The command system supports several field types, each with specialized
rendering and behavior:

| Type | Description | UI Component |
|------|-------------|--------------|
| `petNamePath` | Single hierarchical path (e.g., `dir.subdir.name`) | Text input with autocomplete |
| `petNamePaths` | Multiple paths | Chip container with autocomplete |
| `messageNumber` | Reference to a message | Number input with message picker |
| `text` | Free-form text | Plain text input |
| `edgeName` | Edge name from a message | Text input with autocomplete |
| `locator` | Endo locator URL | Text input |
| `source` | JavaScript source code | Monaco editor (inline or modal) |
| `endowments` | Pet name to identifier bindings | Specialized chip + binding UI |

### Pet Name Path Autocomplete

For single-path fields (`petNamePath`):

- Type to filter suggestions from current level
- `.` accepts selection and drills into it
- Tab/Enter accepts selection
- Escape closes menu

### Multi-Path Chip Input

For multi-value fields (`petNamePaths`), completed paths become visual chips:

```
┌─────────────────────────────────────────────────────────────┐
│ [path.to.first ×] [second-name ×] [third.path| ]            │
└─────────────────────────────────────────────────────────────┘
```

Keyboard behavior:
- `.` accepts current suggestion, creates chip, continues drilling into it
- Space accepts current suggestion, creates chip, starts fresh path
- Enter accepts current input and submits the form
- Backspace (on empty input) removes the last chip
- Arrow keys navigate suggestions

## Command Categories

| Category | Commands | Description |
|----------|----------|-------------|
| Messaging | request, dismiss, adopt, resolve, reject | Peer communication |
| Execution | js (eval) | JavaScript evaluation |
| Storage | list (ls), show, remove (rm), move (mv), copy (cp), mkdir | Inventory management |
| Connections | invite, accept | Peer connections |
| Workers | spawn | Worker management |
| Agents | mkhost (host), mkguest (guest) | Profile creation |
| Profile | enter, exit | Profile navigation |
| Bundles | mkbundle, mkplugin | Module instantiation |
| System | cancel, help | System operations |

Parentheses indicate aliases.

## Known Gaps and TODOs

### Modeline Implementation Notes

The modeline at the bottom of the chat bar shows the overall command bar state.
Additionally, autocomplete dropdown menus contain their own inline hints
specific to menu navigation:

- **Token autocomplete**: `↑↓ navigate · Tab/Enter select · : add label ·
  Esc cancel`
- **Pet name path autocomplete**: `↑↓ navigate · Tab select · . drill down ·
  Esc cancel`
- **Pet name paths autocomplete**: `↑↓ navigate · . drill down · Space add ·
  Enter submit · Esc cancel`

These inline hints complement, rather than duplicate, the modeline.

### Modeline Gaps
- [ ] Verify all inline command forms show appropriate modeline hints
- [ ] Verify eval form modeline is complete

### Keyboard-Manual Parity Gaps
- [ ] Space to insert last recipient has no manual equivalent (acceptable
  convenience)
- [ ] Edge name entry (`:`) has no manual equivalent

### Other
- [ ] Command history (up/down arrow) not yet implemented
- [ ] Chip × button not always visible for deletion
