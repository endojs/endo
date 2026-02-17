# Daemon Capability Bank

## What is the Problem Being Solved?

AI coding agents (Claude Code, Cursor, Devin, etc.) are granted dangerous
ambient authority — filesystem access, shell execution, network, git,
credentials — that enables data exfiltration, persistence, credential theft,
and lateral movement.  The OWASP Top 10 for Agentic Applications [1]
identifies these as primary attack surfaces: prompt injection leading to
tool misuse (ASI01 Agent Goal Hijack, ASI02 Tool Misuse & Exploitation),
overly broad tool permissions (ASI03 Identity & Privilege Abuse), and
unexpected code execution (ASI05).  Empirical research confirms the severity:
Liu et al.'s AIShellJack framework demonstrated attack success rates up to
84% against agentic coding editors [2], and the IDEsaster vulnerability class
found that 100% of tested AI IDEs were vulnerable to prompt-injection-to-
tool-abuse chains [3].

Endo's object-capability model [4] is well-suited to mediate these dangers:
guests default to zero authority (least-authority formula), capabilities are
unforgeable references, and `makeExo()` + `M.interface()` guards enforce
method-level contracts [5].  However, Endo currently lacks a standard
vocabulary of OS-level capabilities that plugins can grant and attenuate.
The LAL agent (`packages/lal/agent.js`) already operates as a guest with
26 tools for directory operations, mail, and eval proposals — but none of
these mediate host OS resources.

The Capability Bank is a family of designs — one per resource category —
that extends Endo's capability discipline to the OS-level resources an AI
agent might need.  Each design should follow genuine ocap patterns:
recursive attenuation (you narrow authority by handing out sub-capabilities,
not by configuring deny-lists), caretaker separation (the controller that
can revoke or restrict is a separate facet from the capability the guest
holds), and structural confinement (a guest cannot name resources outside
its granted scope because no path from its capabilities reaches them).

## Capability Categories

Each category below will have its own focused design document.  The
categories are ordered roughly by design complexity and implementation
priority.

| Category | Design document | Threat addressed | Status |
|----------|----------------|------------------|--------|
| Filesystem | [`daemon-capability-filesystem.md`](daemon-capability-filesystem.md) | Credential theft, config poisoning, data exfiltration via file reads | Draft |
| Process execution | `daemon-capability-process.md` | Arbitrary code execution, reverse shells | Planned |
| Network | `daemon-capability-network.md` | Data exfiltration, C2 channels, SSRF | Planned |
| Git operations | `daemon-capability-git.md` | Persistence via hooks, unauthorized pushes | Planned |
| Environment variables | `daemon-capability-env.md` | Credential theft via env inspection | Planned |
| Credential store | `daemon-capability-credentials.md` | Secret leakage across tenants | Planned |
| User I/O | `daemon-capability-userio.md` | Clipboard harvesting, social engineering | Planned |
| Timer / scheduling | `daemon-capability-timer.md` | Autonomous persistent scheduling | Planned |
| Delegates / epithets | [`daemon-capability-persona.md`](daemon-capability-persona.md) | Impersonation, undisclosed AI activity, unverifiable delegation | Draft |

### Cross-cutting concerns

Once individual capability designs are solid, a **composition layer** will
bundle attenuated capabilities into named profiles for common roles
(read-only developer, CI runner, data analyst, etc.).  This is deferred
until the individual capability shapes are settled.

### OWASP Agentic Top 10 coverage

| ASI category | Defending capabilities |
|---|---|
| ASI01 Agent Goal Hijack | All — interface guards reject structurally invalid calls regardless of LLM intent |
| ASI02 Tool Misuse & Exploitation | Filesystem (root confinement), Process (command allowlist), Network (host allowlist) |
| ASI03 Identity & Privilege Abuse | All — maker pattern restricts creation to HOST; guests hold attenuated instances |
| ASI05 Unexpected Code Execution | Process (command + argument guards), Filesystem (write confinement) |
| ASI06 Memory & Context Poisoning | Git (hook denial prevents persistent instruction injection) |
| ASI08 Cascading Failures | Network (rate limits), Process (concurrency limits), Timer (max concurrent) |
| ASI09 Human-Agent Trust Exploitation | User I/O (prompt controls, notification rate limits), Persona (mandatory AI disclosure) |
| ASI10 Rogue Agents | Timer (recurring denial), Network (C2 prevention), Git (push restrictions) |

### LAL agent integration

The LAL agent can dynamically discover capabilities in its namespace
and register namespaced tools (e.g., `fs.readText`, `git.status`).
The integration pattern will be specified in each capability's design
document and summarized in a separate LAL integration document once the
individual designs are stable.

## Design Principles

Each capability design in this family should follow these principles:

1. **Capabilities are objects, not configurations.**  A guest receives a
   `Directory` capability rooted at `/home/user/project` — it does not
   receive a "FileSystem service configured with roots and deny-globs."
   The guest cannot name `~/.ssh` because no method on its `Directory`
   returns a path to it.

2. **Recursive attenuation.**  Authority narrows by handing out
   sub-capabilities.  A `Directory` returns child `Directory` and `File`
   capabilities.  You attenuate by granting a subdirectory, not by adding
   exclude patterns to a descriptor.

3. **Caretaker separation.**  The facet the guest holds (e.g., `File`) is
   separate from the facet the host holds for control (e.g.,
   `FileControl`).  The host can revoke or restrict without the guest's
   cooperation.  The guest cannot discover or influence the controller.

4. **Defense-in-depth deny patterns are optional.**  Hardcoded denylists
   for sensitive paths, credential env vars, etc. are a secondary safety
   net, not the primary confinement mechanism.  They catch mistakes in
   capability granting, not failures in the capability model itself.

5. **LLM discoverability.**  Every capability exposes `help()` text
   written for an LLM encountering it cold, and `M.interface()` guards
   with maximally specific shapes (named fields, literal enumerations,
   descriptive remotable tags).

6. **Existing Endo patterns.**  Designs should build on Endo's existing
   directory capability (`packages/daemon/src/directory.js`), the virtual
   filesystem design sketch (`docs/virtual-filesystem-design.md`), and
   the guest/host power model rather than introducing parallel abstractions.

## References

[1]: OWASP GenAI Security Project, "OWASP Top 10 for Agentic
Applications for 2026," December 2025.
https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/

[2]: Y. Liu et al., "'Your AI, My Shell': Demystifying Prompt Injection
Attacks on Agentic AI Coding Editors," arXiv:2509.22040, September 2025.
https://arxiv.org/abs/2509.22040

[3]: A. Marzouk (MaccariTA), "IDEsaster: 30+ Vulnerabilities in AI
Coding Tools Enabling Data Theft and RCE," December 2025.  Covered in
The Hacker News:
https://thehackernews.com/2025/12/researchers-uncover-30-flaws-in-ai.html

[4]: M. S. Miller, "Object-Capability Model," in *Robust Composition:
Towards a Unified Approach to Access Control and Concurrency Control*,
Ph.D. dissertation, Johns Hopkins University, 2006.
https://en.wikipedia.org/wiki/Object-capability_model

[5]: Endo project, "Hardened JavaScript (SES)," Agoric / Endo
documentation.
https://github.com/endojs/endo — see also
https://docs.agoric.com/guides/js-programming/hardened-js

[6]: OWASP GenAI Security Project, "Agentic Security Initiative,"
ongoing research initiative exploring security implications of agentic
systems.
https://genai.owasp.org/initiatives/agentic-security-initiative/

[7]: OWASP GenAI Security Project, "Agentic AI — Threats and
Mitigations," v1.0.1, 2025.
https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/

[8]: OWASP, "Top 10 for Large Language Model Applications 2025."
https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/
