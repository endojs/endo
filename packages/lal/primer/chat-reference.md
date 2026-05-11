# Endo Chat Slash Command Reference

The Chat UI accepts slash commands in the message input bar.
Type `/help` to see the built-in command list.

The message input bar doubles as both a chat input and a
command line — prefix with `/` for commands, or `@recipient`
to send a message.

## Sending Messages

To send a message in Chat, type the recipient's name followed
by the message text:

```
@alice Hello, how are you?
@lal Please list my inventory.
```

To include capabilities in the message, embed their pet names
with `@`:

```
@alice Here is @my-counter for you to use.
```

The recipient can then adopt `@my-counter`. Note: if the
garbage collector is enabled and you remove all local names
for a capability, the other party loses access to it.

## Viewing and Editing

These are Chat-specific commands with no direct CLI equivalent:

- `/view <name>` or `/cat` — View the contents of a blob or
  file inline in the chat window. Useful for quickly reading
  text, JSON, or other stored content.
- `/edit <name>` — Open an inline editor for a blob's
  contents. Edit in place and save without leaving the chat.

## Inventory

- `/list [path]` or `/ls` — List names in inventory
  (optionally within a subdirectory)
- `/show <name>` — Show a value
- `/remove <name>` or `/rm` — Remove a name
- `/move <from> <to>` or `/mv` — Rename a value
- `/copy <from> <to>` or `/cp` — Copy a name
- `/mkdir <name>` — Create a subdirectory
- `/mount <path> <name>` — Mount a filesystem directory
- `/mktmp <name>` — Create a scratch directory (unlike
  `/mount`, scratch spaces migrate with the state directory;
  unlike `/mkdir`, they materialize as files on disk)
- `/locate <name>` — Get the locator URL for a value
- `/checkin <name>` or `/ci` — Check in a local directory as
  a readable tree
- `/checkout <name>` or `/co` — Check out a readable tree to
  a local directory
- `/cancel <name> [reason]` — Cancel a formula

## Messaging

- `/request <to> <description>` — Request a capability
- `/dismiss <msgnum>` — Dismiss a message
- `/clear` — Dismiss all messages
- `/adopt <msgnum> <edge> [name]` — Adopt a value from a
  message
- `/resolve <msgnum> <name>` — Grant a request
- `/reject <msgnum> [reason]` — Deny a request
- `/reply <msgnum> <text>` — Reply to a message
- `/form <to>` — Send a structured form (opens a modal)
- `/submit <msgnum>` — Submit values for a form
- `/define <source>` — Propose code with named capability
  slots for the host to endow
- `/endow <msgnum>` — Open a modal showing the definition's
  code and a binding form for each slot (keyboard
  alternative to the inline form on definition messages)
- `/dm <to> <text>` — Send a direct message (only available
  in channel context, not the home space)

## Execution

- `/js <source>` or `/eval` — Evaluate JavaScript code
  (opens a form for binding endowments)

## Workers and Agents

- `/spawn <name>` — Create a worker
- `/mkhost <handle> <agent-name>` or `/host` — Create a host
  (separate mailbox and storage)
- `/mkguest <handle> <agent-name>` or `/guest` — Create a
  guest

## Networking

- `/invite <guest>` — Create an invitation (choose link or
  inventory delivery)
- `/accept <locator> <guest-name>` — Accept an invitation
- `/share <name>` — Generate a shareable locator with
  connection hints
- `/adopt-locator <locator> <name>` — Adopt a remote value
  from a shareable locator
- `/network [host] [port]` — Enable TCP peer network
  (defaults to 127.0.0.1:8940)
- `/network-libp2p` — Enable libp2p peer network (no open
  ports needed)
- `/network-ws-relay <url>` — Connect to WebSocket relay
  server

## Navigation

- `/enter <host>` — Enter a host as current profile
- `/exit` — Exit to parent profile
- `/help` — Show command reference
