# `claude-credentials/` — Claude Credentials factory (peer side)

This directory normally lives on the machine that **owns the Anthropic
account**, not the sandbox host. The long-lived API key/token never leaves this
peer. Below is each object and **what authority sharing it grants**.

## Objects

- **`service`** — the factory caplet. It presents the "Create Claude
  Credentials" form and mints a `ClaudeCredentials` cap from a key you submit;
  its exo surface is only `help()`. The sensitive object is the **minted
  credential**, not this caplet.
- **`profile`** — the factory's guest **agent**. Holds `host-agent` = **full
  authority** over *this* (peer) machine. **Never share.**
- **`handle`** — the guest's mailbox handle. Low authority; don't share
  casually.

## What you share off-machine

The **minted `ClaudeCredentials` cap** (named when you submit the form), `send`d
to the sandbox host in a session-request package (the host `adopt`s it). The host
only ever receives a short-lived **materialised** secret at container-spawn time
— never the long-lived key, which stays on this peer.
