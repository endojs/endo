# Whylip

An interactive illustrated primer that runs as a mode inside Endo Chat. Whylip connects to a Fae agent as its LLM backend and renders responses as interactive scenes in sandboxed iframes, with a branching conversation tree for exploring topics from multiple angles.

## Prerequisites

- A running Endo daemon (`endo start`)
- A configured Fae agent (requires an LLM API key — Anthropic, Ollama, or llama.cpp)

## Quick Start

### 1. Start the daemon

```bash
endo start
```

### 2. Set up Fae

If you haven't already installed a Fae agent, run its setup script from the `packages/fae` directory:

```bash
cd packages/fae
yarn setup
```

This provisions a Fae agent under the pet name `fae`. The first time you open its mailbox in the chat UI, it will present a form to configure LLM credentials (host, model, auth token).

### 3. Launch Familiar (Electron) or the Chat dev server

**Electron:**

```bash
cd packages/familiar
yarn bundle && yarn start
```

**Dev server (browser):**

```bash
cd packages/chat
yarn dev
```

Then open `http://localhost:5173/dev` in your browser.

### 4. Create a Whylip Space

1. In the spaces gutter (left edge), click the **+** button
2. Select **Whylip Book**
3. Enter a book name (e.g., `physics-primer`)
4. Enter the pet name of your Fae agent (e.g., `fae` — the name from `endo list`)
5. Click **Create Book**

This creates a new Endo host profile for the book and writes a reference to the Fae agent into its pet store. The Whylip UI sends messages to the Fae agent through this reference.

## Using Whylip

### Asking questions

Type a question in the input bar at the bottom and press Enter (or click the send button). The Fae agent will respond with:

- **Narrative text** — an explanation rendered below the scene area
- **A scene** — a self-contained HTML/CSS/JS visualization displayed in the sandboxed iframe above

You can also click the microphone button to use voice input (requires browser support for the Web Speech API).

### Branching conversations

The sidebar on the left shows the full conversation tree. Each node is a message exchange:

- `›` markers are your messages (user)
- `◆` markers are the primer's responses (assistant)

**To branch from a past point:** click any node in the tree. Your next message will fork from that point, creating a new branch. The Fae agent rebuilds its context window from only the messages on the active branch path — exactly like Pi's `/tree` command.

This lets you explore alternative explanations, drill deeper into subtopics, or retry a question without losing previous work.

### Scenes

Scenes are fully self-contained HTML documents running inside a sandboxed iframe (`sandbox="allow-scripts"`). They have no network access and cannot reach the parent page. Fae generates these dynamically using canvas, SVG, or plain DOM manipulation to illustrate concepts interactively.

## Architecture

```
User input
  → Whylip host sends to "fae" petname (E(powers).send('fae', ...))
  → Fae agent receives message, assembles context from ConversationTree
  → LLM responds with JSON { narrative, scene }
  → Fae replies via endo messaging
  → Whylip host receives reply in its mailbox
  → Whylip UI adds to local tree, renders scene + narrative
```

The conversation tree is backed by `@endo/conversation-tree`:
- **Fae side**: `EndoPetstoreBackend` — nodes persist in the daemon's petname store, survive restarts
- **Whylip UI side**: `MemoryBackend` — reconstructed from the mailbox on each page load

## File Structure

```
packages/whylip/
├── index.js                     # Public entry: exports mountWhylip()
├── src/
│   ├── mount.js                 # createRoot + render bridge
│   ├── App.jsx                  # 3-panel layout, top-level state
│   ├── ConversationTree.jsx     # Indented outline sidebar
│   ├── SceneCanvas.jsx          # Sandboxed iframe for scene HTML
│   ├── NarrativePanel.jsx       # Markdown-like narrative renderer
│   ├── InputBar.jsx             # Text input + voice button
│   ├── VoiceButton.jsx          # Microphone toggle (Web Speech API)
│   ├── whylip.css               # Dark literary aesthetic
│   └── hooks/
│       ├── useConversation.js   # Endo mailbox sync + local tree management
│       └── useSpeech.js         # SpeechRecognition + SpeechSynthesis
├── package.json
└── README.md
```

`packages/chat/whylip-component.js` imports `mountWhylip` from `@endo/whylip` and calls it when a Whylip-mode Space is selected.
