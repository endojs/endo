# Endor Terminal User Interface

| | |
|---|---|
| **Created** | 2026-04-23 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

`endor` is the forward-looking Rust re-implementation of the Endo daemon.
The existing daemon ships with two user-facing surfaces: the `endo` CLI
(one-shot verbs over the Unix socket) and the `packages/chat/` web UI
(an interactive DOM application served into Familiar or a browser).
Neither is appropriate for the environments where a Rust daemon will
most often be operated:

- **Headless servers** reached over SSH, where opening a browser is
  either impossible or an operational hassle.
- **Developer workstations** where the daemon hosts coding agents that
  drive Moddable XS workers, and the developer wants to observe, pause,
  step, and inspect those workers without leaving the terminal.
- **Containerized deployments** (see `daemon-docker-selfhost`) where a
  `docker exec -it endor tui` is the natural diagnostic entry point.

This design defines `endor tui`, a Rust terminal user interface bundled
with the `endor` binary.
It has two co-equal halves:

1. **Chat** — a keyboard-driven analogue of `packages/chat/` covering
   space switching, the inbox transcript, the inventory, the command
   bar, pending commands, value inspection, and reply-chain focus.
2. **Debugger** — an interactive stepping debugger for Moddable XS
   workers, layered over the XS debugger protocol that `xsbug` already
   speaks, and surfaced through the daemon bus so that workers running
   inside `endor`-supervised processes can be attached, paused, stepped,
   and inspected from the TUI.

The TUI is **not** a mere rendering of the web Chat.
It is a fresh interaction model, matching terminal conventions (modal
keybindings, line-oriented rendering, status-bar modelines) while
preserving the capability-oriented concepts that make the Chat useful
(spaces, inventory, focus mode, pending commands, value modals).

The bus/verb surface required to carry TUI traffic — including the
debugger protocol frames — is a sibling design,
[endor-bus-tui](endor-bus-tui.md).
This document references that surface rather than duplicating it.

## Why a TUI Now?

Three motivations converge on the need for a TUI rather than a
CLI-plus-browser:

1. **Chat is becoming the debugger of last resort.**
   As agents gain tool capabilities (`daemon-agent-tools`), a developer
   debugging a misbehaving agent wants to see inbound messages, tool
   call replies, pending commands, and worker state in one place.
   The web Chat does this well in a windowed environment.
   It does not exist over SSH.

2. **`xsbug` is not a viable dependency.**
   The stock Moddable `xsbug` tool is a macOS-only Xojo application.
   Reusing its protocol is sensible; reusing its UI is not.
   A TUI debugger lets us adopt the XS protocol on our own terms and
   integrate it with the capability system rather than the Moddable
   developer workflow.

3. **Rust crates make TUI cheap.**
   `ratatui` and `crossterm` (and friends) have matured to the point
   where a responsive, styled, multi-panel TUI is a few thousand lines
   of Rust, not the tens of thousands it would have been a decade ago.
   Building it now is within the budget of the `endor` project.

## TUI Framing

### Candidate Rust crates

The ecosystem has consolidated around three choices:

| Crate | Role | Tradeoffs |
|-------|------|-----------|
| [`ratatui`](https://ratatui.rs/) | Immediate-mode rendering and layout | De-facto successor to `tui-rs`. Active, well-documented, permissive license. Good widget library (Paragraph, List, Table, Chart, Tabs). |
| [`crossterm`](https://docs.rs/crossterm/) | Backend — input, cursor, raw mode | Portable (Linux, macOS, Windows, WSL). Required for `endor` because we must not assume termios-only behavior. |
| [`cursive`](https://docs.rs/cursive/) | Retained-mode widget toolkit | Higher-level but more opinionated. Harder to integrate async daemon streams. |

**Choice:** `ratatui` over `crossterm`, with `tokio` as the async
runtime (already required by the `endor` daemon).
This matches the shape of `ratatui`'s `EventStream` and the async bus
reader in `endor`.

Immediate-mode rendering fits the data shape well.
The transcript, inventory, and pending-commands region are all
derivations of async streams from the daemon; on each tick we re-derive
the visible slice and re-render.
There is no retained widget tree to keep in sync with daemon state.

### Rendering model

The TUI uses a **full-screen alternate buffer** with a **redraw on
change** strategy, not a scrolling line log:

- On startup: enter alternate screen, raw mode, hidden cursor (except
  in input focus), mouse capture (optional — see **Mouse support**
  below).
- On every relevant event (keypress, bus frame, resize), compute the
  next visible frame and call `terminal.draw()`.
- No direct writes to stdout; `ratatui` manages the diff against the
  previous frame.

This is the opposite of a REPL-style tool like `endo log --follow`,
which writes growing output to the bottom and lets the terminal handle
scrollback.
The Chat TUI needs random access to the transcript (focus mode
navigation, scroll to anchor, jump to message N), which is not
expressible in line-oriented output.

Users who want line-oriented tailing retain `endo log` and `endo
follow` as separate CLI surfaces.
The TUI is a distinct tool, much as `htop` is to `ps`.

### Mouse support

Optional.
Mouse capture in a terminal breaks native selection and copy, which is a
common reason developers avoid TUIs.
`endor tui` starts with mouse capture **off** (keyboard only, native
selection works).
A keybinding (`Ctrl+M`) toggles mouse capture for users who want to
click spaces in the gutter, drag the inventory split, or scroll with
the wheel.

### Terminal capabilities

- Require Unicode (UTF-8 locale).
  The Chat web UI uses emoji liberally for space icons, spinners, and
  status; the TUI preserves these.
  `ratatui` handles East Asian and grapheme width via `unicode-width`.
- Require 256-color or truecolor.
  The existing `chat-color-schemes` design defines light, dark, and
  high-contrast palettes; the TUI mirrors these via `ratatui::style`.
  Degrade gracefully to 16 colors on dumb terminals (e.g., `screen` with
  old `TERM`).
- **Do not** require an xterm-compatible title bar, bracketed paste, or
  focus reporting as hard requirements; prefer them when available.

### Process model

`endor tui` is a separate subcommand of the `endor` binary.
It opens a bus connection (same socket and framing used by
`endor`-CLI) and runs entirely in the foreground of its own process.
It does **not** embed the daemon; multiple TUI clients can attach to a
running daemon simultaneously, as many CLI clients already can.

Exit conditions:

- `q` or `Ctrl+C` from any panel — clean shutdown; leave alternate
  screen; close bus connection; restore cursor.
- SIGWINCH — re-layout and redraw.
- Bus connection lost — display a sticky banner, attempt reconnect with
  backoff, keep the last known state visible so the user can see what
  they were looking at when the daemon disappeared.

## Chat TUI

### Concepts to adapt

The web Chat's feature surface, enumerated from `packages/chat/`:

| Web concept | File(s) | TUI analogue |
|-------------|---------|-------------|
| Spaces gutter | `spaces-gutter.js` | Left rail (single character column) with per-space icon glyph and Alt+digit keybinds |
| Per-space color scheme | `scheme-picker.js`, `chat-per-space-color-scheme.md` | Palette switch on space activation; same scheme names |
| Inventory (pet list) | `inventory-component.js` | Collapsible tree panel, left side |
| Profile breadcrumbs | `chat.js` `renderProfileBar` | Line under the inventory, `Home › child › grandchild` |
| Conversation header | `channel-header.js` | Top status line of the transcript panel |
| Inbox transcript | `inbox-component.js` | Scrollable transcript panel, keyed by message number |
| Focus message mode | `chat-focus-message.md` | Modal `focus` state with arrow-key navigation over rendered lines |
| Command bar | `chat-bar-component.js`, `chat-command-bar.md` | Bottom multi-line input with modeline; same state machine |
| Pending commands region | `chat-pending-commands.md` | Mini-panel between transcript and command bar |
| Value modal | `value-component.js`, `chat.js` | Full-screen overlay; `Esc` to dismiss |
| Token autocomplete (`@`) | `token-autocomplete.js` | Popup list under the cursor, same `↑/↓/Enter/Esc` controls |
| Command menu (`/`) | `command-selector.js` | Popup list with fuzzy filter |
| Inline command forms | `inline-command-form.js`, `form-builder.js` | Form mode takes over the command bar region with labeled fields |
| Eval form / editor | `eval-form.js`, `inline-eval.js` | `⌘Enter` opens a fullscreen editor buffer (see **Source editing** below) |
| Blob viewer | `blob-viewer.js` | Full-screen pager (like `less`) |
| Markdown render | `markdown-render.js` | Terminal Markdown via `termimad` or bespoke renderer |
| Chime (audio) | `chime.js` | Terminal bell (toggleable) |
| Share / invite modals | `share-modal.js`, etc. | Form-style overlays |

### Panel layout

The default layout on an 80×24 minimum terminal:

```
┌─┬───────────────┬────────────────────────────────────────────┐
│S│ Inventory     │ @alice                             ● live  │
│p│ ▸ friends/    ├────────────────────────────────────────────┤
│a│   alice       │ #42 2026-04-22 14:03  @alice               │
│c│   bob         │   Can you take a look at this snippet?     │
│e│ ▸ workers/    │ #43 2026-04-22 14:04  @self → @alice       │
│s│ ▾ apps/       │   Sure, paste it.                          │
│ │   calc        │ #44 2026-04-22 14:05  @alice (value)       │
│ │ @self (home)  │   [code:js 42 lines] — ⏎ inspect           │
│ │ ───────────── ├────── Pending ─────────────────────────────┤
│ │ Home › …      │ ◐ dismiss #42                    3s        │
│ │               │ ✓ eval … → @snippet42            just now  │
│ │               ├────── Command ─────────────────────────────┤
│ │               │ @alice thanks, trying it now.|             │
│ │               │ ─ send · @ inspect · / commands · Esc ─ ── │
└─┴───────────────┴────────────────────────────────────────────┘
```

Widths:

- Spaces rail: 2 columns (1 for icon, 1 for separator).
- Inventory: 15–30 columns; resizable with `Alt+←` / `Alt+→`.
- Transcript + command bar: remainder.
- Pending and command-bar heights are dynamic; the transcript fills the
  remaining vertical space.

Below 60 columns the inventory hides automatically (`Alt+I` to toggle).
Below 20 rows the pending region hides when empty.

### Keybinding scheme

Modal, inspired by `tmux`/`htop`/`vim` but defaulting to emacs-friendly
bindings so first-time users are not punished for not knowing modes.
Modes are a small closed set:

| Mode | Entered by | Exited by | Role |
|------|-----------|-----------|------|
| `normal` | startup, `Esc` from input | n/a | Keys are commands; no text entry |
| `insert` | `i`, or typing any printable char in input | `Esc` | Command-bar text entry |
| `focus` | `Ctrl+↑` from `insert` on empty input; or `f` from `normal` | `Esc`, `↓` past last | Navigate messages; dispatch against focus |
| `modal` | any modal-opening action | `Esc` | Value inspection, form, blob viewer, etc. |

Primary keybindings (global — except where noted):

| Chord | Mode | Action |
|-------|------|--------|
| `Alt+1` … `Alt+9`, `Alt+0` | any | Switch to space N (home = 0) |
| `Alt+s` | any | Open spaces picker (for >10 spaces) |
| `Alt+i` | any | Toggle inventory |
| `Alt+p` | any | Toggle pending commands panel (keeps recent even when empty) |
| `Ctrl+L` | any | Redraw (also recovers from terminal corruption) |
| `q` | normal | Quit |
| `:` | normal | Ex-style command prompt (`:quit`, `:scheme dark`, `:reconnect`) |
| `/` | insert | Open command menu in the command bar |
| `@` | insert | Begin token autocomplete |
| `Tab` | insert | Accept autocomplete suggestion |
| `Enter` | insert | Send message or execute command |
| `Ctrl+Enter` | insert (eval) | Expand to full-screen editor |
| `Ctrl+↑` | insert (empty) | Enter focus mode |
| `↑` / `↓` | focus | Move focused message |
| `Enter` | focus | Inspect focused message / open value modal |
| `d` | focus | Pre-fill `/dismiss N` in command bar |
| `a` | focus | Pre-fill `/adopt N` |
| `r` | focus | Pre-fill `/resolve N` / `/reply N` |
| `g` / `G` | focus | Jump to first / last message |
| `Esc` | any modal | Close modal |

All keybindings are loaded from `${ENDOR_CONFIG}/tui-keys.toml` at
startup, with a frozen default.
Users can rebind but cannot unbind `Esc` or `Ctrl+C`.

### Modeline

The command bar's bottom row is a modeline, replicating `chat-command-bar.md`
literally: it shows the current state (e.g. `send`, `token-select`,
`command-select`, `form-field: recipient`) and the keys available from
that state.
Terminal users will see the same guidance web users already see; only
the rendering medium differs.

Example modelines:

| State | Modeline |
|-------|----------|
| Empty send | `─ @ inspect or message · / commands · Space @lastRecipient ─` |
| Token autocomplete | `─ ↑↓ nav · Tab select · : edge name · Esc cancel ─` |
| Command menu | `─ type to filter · ↑↓ nav · Enter select · Esc cancel ─` |
| Eval form | `─ @ endowment · Enter run · Ctrl+Enter editor · Esc cancel ─` |
| Focus mode | `─ ↑↓ nav · Enter inspect · d dismiss · a adopt · r reply · Esc exit ─` |

### Transcript rendering

Each message renders as one or more lines with a fixed header line and
zero or more body lines:

```
#42 14:03 @alice
  Can you take a look at this snippet?
```

For value-type messages (see `daemon-value-message`), the body line
renders a typed glyph plus a one-line summary:

```
#44 14:05 @alice (value)
  [code:js 42 lines]  ⏎ inspect
```

For form requests:

```
#45 14:06 @alice (form: "Confirm deploy")
  fields: env, branch        ⏎ fill
```

Markdown bodies are rendered inline with a simple TUI Markdown pass
(`termimad` is a reasonable starting point, but the user's experience
of `chat-markdown-render.md` suggests a bespoke renderer will be
needed for code blocks and links).

**Redraw strategy:** the transcript maintains a virtual list of
`MessageEntry { number, header, lines: Vec<StyledLine> }` in a
`VecDeque`.
On each frame, compute the visible window based on scroll offset, map
each entry to `ratatui::text::Line`s, and hand them to a `Paragraph`
widget with a bounded scroll state.
Only when messages arrive, dismiss, or change (e.g., pending → settled)
do we rebuild the affected entries.

### Focus mode

Implemented exactly as `chat-focus-message.md` describes:
arrow keys move a highlighted entry, `PgUp`/`PgDn` move by half a
viewport, `g`/`G` jump to ends, `Enter` inspects the focused message,
letter keys `d`/`a`/`r` pre-populate commands with the focus's message
number.

In TUI, the focus highlight is a reversed-video background line on the
header (`#NN timestamp @sender`) plus a color-shifted gutter stripe.
Reply-chain indentation is rendered using Unicode box-drawing
characters (`│`, `├`, `└`) rather than margin pixels.

### Pending commands region

Follows `chat-pending-commands.md` — a panel between the transcript and
the command bar that holds cards for outstanding commands.
In TUI each card is a single line:

```
◐ dismiss #42                              3s
◐ eval @snippet42 …                       just submitted
✓ adopt #3:VALUE → myval                  done
✗ send @bob "oops"                        error: no such name
```

The spinner glyph cycles (`◐◓◑◒`) on a 100ms timer when any card is
pending.
The panel collapses to zero height when empty (and the transcript grows
to fill the space).
The user can press `Alt+p` to keep the panel pinned showing recent
history even when empty.

### Source editing

For the `/eval` command (and eventually `/view` and `/edit`, per
`chat-view-edit-commands.md`), the TUI needs an in-TUI code editor.
Three options:

1. **Shell out to `$EDITOR`** (vim, nano, helix, etc.) — simplest,
   familiar, zero UI code.
   Tradeoffs: cannot stream the eval result into the same buffer;
   launch latency; the user loses our keybinding context while editing.

2. **Embed `helix-core` or a `ropey`-backed minimal editor** — richer,
   stays in the TUI session, reuses our theme.
   Tradeoffs: a large additional scope.

3. **Single-line mode with `Ctrl+Enter` expanding to a multi-line
   buffer with basic controls** — middle ground; primitive but
   sufficient for the small snippets the Chat `/eval` targets.

**Chosen:** option 3 for v1, with option 1 (`Ctrl+E` shells out to
`$EDITOR`) as an escape valve for larger buffers.
This defers option 2 to a later phase where the need is demonstrated.

### Value modal

The TUI value modal is a centered overlay (`ratatui::widgets::Clear` +
`Block`) that renders the typed value using the same classification
lattice as the web modal:

- Primitive scalars (string, number, bigint, boolean, null, undefined,
  symbol): one-line rendered form.
- Arrays, records: hierarchical expandable tree, `→` to expand,
  `←` to collapse.
- Errors: message + stack, with `s` to step into the stack frame
  in the XS debugger (see below) when the error originated in a
  worker we can attach to.
- Remotables: interface summary via `E(ref).__getMethodNames__()`,
  per CLAUDE.md guidance.
- Readable blobs and code: paged view.
- Host / guest / directory: an "Enter Profile" affordance that opens a
  new space in the gutter rather than navigating the current space.

Keys:

| Key | Action |
|-----|--------|
| `Esc` / `q` | Close |
| `Tab` | Cycle title chips (pet names, message context) |
| `n` | Name this value — opens a single-line prompt like `/adopt` |
| `p` | Pin to inventory |
| `s` | Step-into (only when value is an error or a worker handle) |

### Inventory

A collapsible tree rooted at the current profile (`['.'] `),
implemented with `ratatui::widgets::List` and a hand-rolled tree model.
Entries use glyphs to distinguish type:

- `▸` / `▾` — collapsed / expanded directory or host
- `@` — handle, peer, remote (a conversable)
- `⚙` — worker
- `𝑒` — eval result
- `▦` — readable blob / code
- `◎` — channel

Selection follows web conventions: `Enter` inspects the value;
`Shift+Enter` selects as conversation partner (if conversable);
`c` copies the pet name to clipboard (via `arboard` crate).

### Spaces

One space = one color scheme + one profile + one view mode + one
in-flight conversation.
When switching spaces, the TUI swaps the theme, the transcript
iterator, and the inventory root.
Switching is instantaneous from the user's perspective because all
bus subscriptions for non-active spaces continue in the background;
only the rendering is swapped.

`Alt+s` opens a space picker listing icons + names + shortcuts + last
activity timestamp, with fuzzy search.

### Inbox vs. channel vs. forum modes

The web Chat supports multiple view modes per space (`chat`, `forum`,
`outliner`, `microblog`, `whylip`, `graph`, `peers`).
The TUI v1 supports only two:

- `inbox` — chronological transcript of messages addressed to `@self`
  in the active profile (the default for home).
- `channel` — conversation with a specific peer or channel (a filtered
  transcript).

Other view modes are deferred; a `:view forum` ex-command could open
the web Chat at the same space if a browser is available.
The TUI is not intended to replace the web Chat for rich visualization
features like `whylip` or `graph`.

## XS Debugger

### What XS actually provides

Moddable XS is the JavaScript engine behind `endor`'s workers.
It ships a built-in **debugger protocol** that the `xsbug` tool uses.
Key facts grounding this section:

- XS sources the `debugger;` statement from ECMA-262.
  Hitting a `debugger;` statement, or an active breakpoint, causes the
  VM to **pause** and emit an XML-framed packet describing the stop:
  source URL, line, local variables, `this`, call stack, and a
  view of VM state (modules, globals).
- The VM communicates over a **TCP-like byte stream** (historically
  Moddable's `mxDebug`): line-delimited XML packets roughly of the form
  `<xsbug><break …/><frames/><locals/></xsbug>` and
  `<xsbug><set-breakpoint …/></xsbug>`.
  The protocol is undocumented in any formal sense but is stable and
  implemented in `xs/tools/xsbug.js` and `xs/platforms/*_xs.c`.
- Verbs the VM accepts (from `xsbug` observation):
  - `set-breakpoint` — path + line, with optional condition.
  - `clear-breakpoint` — matching an earlier set.
  - `clear-all-breakpoints`.
  - `go` (continue), `step` (step in), `step-over`, `step-out`.
  - `select` — select a frame in the current stack for locals and eval.
  - `toggle` — toggle "stop on exception", "stop on throw", etc.
  - `abort` — force the VM to exit.
  - `script` / `binary` — request the current source to be transmitted.
- **No debugger attach without build flag.**
  By default, release builds of XS strip the debugger code.
  `endor`'s worker binary must be compiled with `mxDebug` enabled, and
  the daemon must be able to toggle per-worker whether the debugger is
  attached at startup.
  On workers with debugging off, every `debugger;` statement is a
  no-op, and `setBreakpoint` returns an error.

The XS debugger is not a protocol we invent; it is a protocol we adopt.
The TUI does not speak XML to the worker directly.
Instead it speaks bus verbs (see `endor-bus-tui.md`) to the daemon,
which translates them into XS packets on the worker's debugger channel
and streams stop events back.

### Debugger panel layout

```
┌── Workers ──┬── Source: src/agent.js:42 ──────────────────────┐
│ ⏸ worker-7  │  40  const plan = await planner.run(input);     │
│ ▶ worker-9  │  41  if (!plan.ok) throw Error('nope');         │
│ ▶ worker-3  │ ▶42  const result = await tool(plan.action);    │
│             │  43  return result;                             │
│             │  44                                             │
│             ├── Call stack ─────────────────────────────────── │
│             │  ▶ runStep      src/agent.js:42                 │
│             │    loopBody     src/agent.js:18                 │
│             │    main         src/agent.js:3                  │
│             │    (top-level)  src/agent.js:—                  │
│             ├── Locals ─────────────────────────────────────── │
│             │  plan     ▸ { ok: true, action: "fetch" }       │
│             │  input    "do the thing"                        │
│             │  this     ▸ [Agent]                             │
│             ├── Breakpoints ────────────────────────────────── │
│             │  src/agent.js:42   (unconditional)              │
│             │  src/agent.js:63   when count > 10              │
│             ├── Eval / Watch ───────────────────────────────── │
│             │ > plan.action                                   │
│             │ "fetch"                                         │
│             │ >|                                              │
└─────────────┴─────────────────────────────────────────────────┘
```

The debugger is a distinct top-level "view" alongside Chat.
`Alt+d` toggles into the debugger view.
Within the debugger, panels are arranged as:

- **Worker list** (left, 1-column wide list).
  Shows every worker the daemon knows about; a run/pause glyph shows
  whether the VM is running, paused at a stop, or has debugging
  disabled (`○` greyed).
- **Source viewer** (top-right).
  Shows the current source of the selected worker, scrolled to the
  current line.
  `▶` in the gutter marks the current frame; `●` marks breakpoints.
- **Stack** (right, below source).
  `▶` marks the selected frame.
- **Locals** (right, below stack).
  Tree of variables in the selected frame, expandable.
- **Breakpoints** (right).
  List of active breakpoints across all sources for this worker.
- **Eval / watch** (bottom-right).
  A REPL that evaluates expressions in the selected frame via the
  XS `select` + `eval` verb and prints results.

### Keybindings

Debugger-specific bindings override Chat bindings while the debugger
view is focused:

| Key | Action |
|-----|--------|
| `F5` / `c` | Continue (XS `go`) |
| `F10` / `n` | Step over (XS `step-over`) |
| `F11` / `s` | Step into (XS `step`) |
| `Shift+F11` / `S` | Step out (XS `step-out`) |
| `F9` | Toggle breakpoint on the current source line |
| `p` | Pause — inject a `debugger;`-equivalent via `endor-bus-tui` `pause` verb |
| `b` | Add conditional breakpoint (opens form) |
| `↑` / `↓` | Move within the focused sub-panel |
| `Tab` | Cycle focus: source → stack → locals → breakpoints → eval |
| `Enter` (on locals row) | Expand / collapse |
| `Enter` (on eval) | Evaluate in selected frame |
| `k` / `x` | Kill selected worker (asks for confirmation) |
| `a` | Attach / detach debugger on the selected worker |
| `Esc` / `Alt+d` | Return to Chat view |

The debugger view is also reachable from Chat by inspecting a worker
value (`Enter` on a `⚙` inventory item) and pressing `d` in the value
modal.

### Attach semantics

Attachment is **opt-in** per worker.
The daemon keeps the debugger channel closed by default because XS
pauses aggressively when a debugger is attached and `debugger;`
statements are encountered (which the SES bootstrap, perhaps
surprisingly, does not currently contain but may in hand-written guest
code).

Attach flow:

1. TUI sends `endor-bus-tui` `debug.attach { worker: <handle> }`.
2. Daemon opens the XS debugger socket on that worker, if the worker
   was launched with debugging enabled; otherwise returns a typed
   error and the TUI shows `○ worker-N (debugging disabled)`.
3. Daemon streams the initial `<xsbug>` handshake up to the TUI as a
   typed frame.
4. TUI now subscribes to stop events, breakpoint events, and console
   output for this worker.

Detach flow:

1. TUI sends `debug.detach { worker }`.
2. Daemon issues a `clear-all-breakpoints` followed by a `go` to ensure
   the worker is not left suspended, then closes the socket.

Multiple TUI clients can view the same worker's stack and locals; only
one at a time is the "controller" (holds the write lock on verbs like
`step`).
Controller is explicitly claimed (`debug.claim`) and released
automatically on disconnect.

### Source display

XS transmits source either by URL (a path the engine knows) or by
blob (if the source has been held in the VM's script table).
The TUI needs to display source at stop time.
Strategies:

1. **Daemon serves source** — when the worker was built from a bundle
   or mount, the daemon knows the source path and can read it.
   Prefer this; it avoids a protocol round-trip per stop.
2. **XS `script` verb** — for eval'd code or generated sources, request
   the text from XS itself.
3. **Hex fallback** — for opaque XSB binaries, display a message
   ("source not available"); disable line stepping, enable opcode
   stepping if/when we add it.

The TUI caches sources by URL with the ETag-style content hash that the
daemon already computes for readable blobs.

### Breakpoints

Breakpoints are **daemon-durable**, not TUI-durable.
When the user sets a breakpoint, the daemon stores it in a
per-worker-formula `breakpoints` list, re-applies on every attach, and
survives daemon restarts.
This means a developer can `endor tui`, set breakpoints, quit, and
reattach later and find them still set.

A breakpoint has:

```
{ path: "src/agent.js", line: 42, condition?: "count > 10",
  hitCount: 0, enabled: true }
```

Conditions are evaluated by XS itself; the protocol carries them with
`set-breakpoint`.

### Stop, step, continue

On any stop event, the daemon multiplexes the frame and locals to all
attached TUIs.
The controller can issue `step`, `step-over`, `step-out`, `go` verbs;
each verb returns a success ack, and a new stop event (or a
`resumed` event if the worker runs to completion/forever) follows.

### Eval in frame

Expression eval is a privileged operation — it runs code inside the
worker with full access to the current lexical scope.
The TUI surfaces it as a prompt; the daemon translates it to an XS
eval verb targeting the currently selected frame.

Because eval may produce large values, the results are rendered with
the same value renderer used in the Chat value modal (for consistency
with how inventory values are shown).

### Console output

While a worker is attached, its `console.log`/`console.error` output
is mirrored into a fourth sub-panel (optional, toggled with `Alt+o`).
This is a line-buffered, auto-scrolling log view; stopping on a
`debugger;` statement pins the log so the user can see the output
immediately preceding the break.

## Relationship to the Daemon Bus

The verbs the TUI speaks are defined in
[endor-bus-tui](endor-bus-tui.md).
This section summarizes only what the TUI needs from that surface:

| Verb (TUI → daemon) | Purpose |
|---------------------|---------|
| `space.list`, `space.watch` | Enumerate and observe spaces |
| `profile.enter`, `profile.exit` | Space activation |
| `inbox.follow` | Stream the active profile's messages |
| `inventory.follow` | Stream name changes for the active profile |
| `send` | Send a message (existing bus verb; TUI mirrors Chat) |
| `command.submit` | Submit a slash command; result surfaces as a reply event |
| `value.inspect` | Open a capability; returns type + rendering payload |
| `worker.list`, `worker.watch` | Enumerate workers and their debug state |
| `debug.attach`, `debug.detach`, `debug.claim` | Debug session control |
| `debug.breakpoint.set`, `debug.breakpoint.clear` | Breakpoint management |
| `debug.go`, `debug.step`, `debug.step-over`, `debug.step-out` | Execution control |
| `debug.eval` | Evaluate an expression in the selected frame |

| Event (daemon → TUI) | Purpose |
|----------------------|---------|
| `message.added`, `message.dismissed`, `message.resolved` | Inbox events |
| `inventory.added`, `inventory.removed` | Name events |
| `command.pending`, `command.settled` | Pending-commands events |
| `debug.stopped { worker, reason, frame, stack, locals }` | Worker paused |
| `debug.resumed { worker }` | Worker running |
| `debug.output { worker, stream, text }` | Console output |
| `worker.state { handle, phase }` | Worker lifecycle changes |

All TUI-bus traffic runs over the existing CBOR-envelope protocol
already present in `go/engo/daemon/codec.go` and inherited by `endor`.
The TUI carries no persistent state the daemon does not also hold.

## Phased Implementation

### Phase 1: Skeleton and Chat transcript — foundational

1. `endor tui` subcommand with `ratatui` + `crossterm` wiring.
2. Bus client (async, `tokio`), reconnect logic.
3. Single-space view: inbox transcript, inventory, command bar.
4. Basic send + `/dismiss` + `/adopt` via `command.submit`.
5. Modeline and mode state machine.
6. Exit, redraw, SIGWINCH handling.

### Phase 2: Spaces and focus mode

1. Spaces rail, `Alt+0`..`Alt+9` keybinds.
2. Per-space color schemes (mirror `chat-color-schemes`).
3. Focus mode (`chat-focus-message`): arrow nav, `d`/`a`/`r`
   pre-population.
4. Pending commands region.

### Phase 3: Value inspection and forms

1. Value modal with type-dispatched rendering.
2. Inline command forms (form-builder parity).
3. Token autocomplete and command menu popups.
4. Blob viewer (fullscreen pager).

### Phase 4: XS debugger baseline

1. `debug.attach` / `debug.detach` verbs on the bus.
2. Worker list panel with state glyphs.
3. Stop events, frame + stack + locals rendering.
4. `go`, `step`, `step-over`, `step-out` control.
5. Unconditional breakpoints (`F9` toggle, persisted via daemon).

### Phase 5: Debugger richness

1. Conditional breakpoints.
2. Eval-in-frame REPL.
3. Console output mirror (`Alt+o` panel).
4. Stop-on-exception and stop-on-throw toggles.
5. Multi-client observer mode with controller claim/release.

### Phase 6: Polish and escape valves

1. Mouse support (opt-in).
2. `$EDITOR` escape for long eval buffers.
3. Configurable keybindings via TOML.
4. High-contrast and degraded-color fallbacks.
5. Integration tests with a headless terminal (e.g. `vt100`).

## Design Decisions

1. **`ratatui` + `crossterm` over `cursive` or a bespoke framework.**
   Immediate-mode rendering is a better fit for the streaming bus data
   model than retained widget trees, and the crates are the community
   consensus choice.
   `cursive` would force us to synchronize widget state with async
   daemon state, creating a second source of truth.

2. **Alternate-screen, full redraw on events rather than line log.**
   The TUI needs random access (scroll to message N, focus mode) that
   line-scrolling terminals cannot provide.
   `endo log --follow` covers the streaming-log use case as a separate
   tool.

3. **Modal input.**
   Terminal users expect modal interaction for anything more than a
   REPL.
   The mode set is small (`normal`, `insert`, `focus`, `modal`) and
   mirrors the web Chat's implicit states rather than inventing new
   ones.

4. **Adopt XS's native debugger protocol rather than inventing one.**
   XS workers already speak the `mxDebug` protocol; `xsbug` is an
   existence proof that it is sufficient for production debugging.
   Inventing a new protocol would require modifying XS builds and
   maintaining a patchset.

5. **Daemon mediates debugger traffic; TUI speaks only bus verbs.**
   Keeps the debugger multi-client, multi-TUI, and reconnectable.
   The daemon can also enforce capability-based access control
   (a guest cannot attach to another guest's worker).
   Direct TUI-to-worker debugger sockets would bypass this.

6. **Breakpoints are daemon-durable.**
   A developer's mental model of "I set a breakpoint here" should
   survive TUI restarts, and a long-running agent should stop at
   configured breakpoints even with no TUI attached (the agent simply
   blocks until a TUI attaches and continues it).

7. **Debugger opt-in per worker.**
   Workers launched without the debug build flag, or with debugging
   explicitly disabled, show a greyed-out state in the worker list.
   This prevents surprise pauses in production deployments.

8. **`endor tui` is a separate process, not embedded in the daemon.**
   Multiple TUIs can attach at once.
   A TUI crash cannot take down the daemon.
   Remote operation over SSH works without proxying (the daemon's bus
   is accessible; the TUI runs locally on the SSH endpoint).

9. **No `xsbug` compatibility mode.**
   The XS debugger protocol is an implementation detail we consume;
   we do not commit to being a drop-in `xsbug` replacement (which
   would require supporting Moddable's device-specific features).
   If a developer wants `xsbug`, they can disable `endor`'s debugger
   attach and run `xsbug` directly.

10. **Chat and debugger share one bus connection.**
    Both views multiplex over the same socket.
    Separating them would complicate reconnect logic and duplicate
    authentication handshakes.

11. **Mouse capture off by default.**
    Native terminal selection is a workflow developers care about.
    Making mouse a toggle rather than a default respects that.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [endor-bus-tui](endor-bus-tui.md) | Defines bus verbs and events this TUI consumes; this design references that surface without duplicating it |
| [chat-command-bar](chat-command-bar.md) | TUI command bar state machine mirrors the web command bar exactly |
| [chat-focus-message](chat-focus-message.md) | TUI focus mode mirrors the web focus mode |
| [chat-pending-commands](chat-pending-commands.md) | TUI pending region mirrors the web pending region |
| [chat-color-schemes](chat-color-schemes.md) | TUI palettes adapted from web palettes |
| [chat-per-space-color-scheme](chat-per-space-color-scheme.md) | TUI per-space themes |
| [chat-spaces-home](chat-spaces-home.md) | Home space treatment carries over |
| [chat-view-edit-commands](chat-view-edit-commands.md) | `/view` and `/edit` will back the TUI blob viewer and editor |
| [workers-panel](workers-panel.md) | Worker metrics surface in the TUI debugger's worker-list column |
| [daemon-value-message](daemon-value-message.md) | Value type used in transcript and modal rendering |
| [daemon-mount](daemon-mount.md) | Debugger source resolution reads through mounts |
| [daemon-agent-tools](daemon-agent-tools.md) | Tool-call messages are first-class transcript entries |

## Known Gaps and TODOs

- [ ] Decide bespoke vs. `termimad` Markdown renderer once
  `chat-markdown-render.md` settles.
- [ ] Research whether XS has a protocol verb for pause-on-request; if
  not, we may need a small VM patch to implement `p` (manual pause).
- [ ] Specify how the TUI displays sourcemaps when agents run bundled
  (minified) code.
- [ ] Remote-TUI-through-daemon-over-TCP story: today the bus socket is
  Unix-domain only; SSH suffices but there may be a case for exposing
  the bus over TLS + bearer token (see `gateway-bearer-token-auth`).
- [ ] Terminal capability detection for truecolor vs. 256-color.
- [ ] Clipboard handling on headless servers (`arboard` falls back to
  OSC-52, which not all terminals support).
- [ ] Playwright-equivalent integration tests for the TUI
  (`insta`-style snapshots of `ratatui::buffer::Buffer`).

## Prompt

> Write a design document at `/home/kris/designer/designs/endor-tui.md`
> for a terminal (TUI) interface for the `endor` command — the Rust
> re-implementation of the Endo daemon.
> This design has two main features:
>
> 1. **A Chat user interface** rendered in TUI idiom.
>    The existing Chat UI in the monorepo is a web (HTML/DOM) interface
>    at `packages/chat/`.
>    The TUI should provide analogous capabilities (message transcript,
>    space switching, command bar, inventory, inbox, pending commands,
>    value rendering/modals) but adapted for a keyboard-driven terminal.
>    Investigate the existing Chat UI thoroughly enough to enumerate the
>    concepts that need a TUI analogue and to propose a panel layout,
>    keybinding scheme, and rendering model (lines vs. screens, re-draw
>    strategy).
>
> 2. **A stepping debugger for XS workers.**
>    `endor` workers run Moddable XS (XS JavaScript engine).
>    The TUI should expose a debugger that can attach to a worker, show
>    its call stack and locals, set/clear breakpoints, step
>    (into/over/out), continue, and inspect values.
>    Research XS's debugging facilities (the XS debugger protocol,
>    `xsbug`, the `debugger` keyword and how XS surfaces breaks) so the
>    design is grounded in what XS actually provides.
>    Note that the daemon bus protocol will need to carry debugger
>    traffic between the TUI and the workers; there is a sibling design
>    doc `endor-bus-tui.md` for the bus/TUI verbs, so you can assume
>    that surface is designed separately and reference it rather than
>    duplicate.
