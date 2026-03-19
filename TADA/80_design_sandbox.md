DONE — Revised `designs/daemon-os-sandbox-plugin.md`:

- Integrated NOTE(Josh) about Landlock: added Landlock as a complementary
  confinement mechanism alongside bubblewrap/seccomp-bpf throughout the doc
  (problem statement, Linux backend section, dependencies, compatibility).
- Integrated NOTE(Josh) about broader isolation backends: expanded the problem
  statement to describe containers (Podman, LXC/Incus, systemd-nspawn, Docker),
  lightweight VMs (Firecracker, Incus VMs), and Landlock as future backend
  options, with the initial implementation targeting bubblewrap + sandbox-exec.
- Reconciled Josh's NetEndowment interface change: updated NetEndowmentShape
  guards to use `allowOutbound`/`allowInbound` (array of `{cidr, port}` rules)
  instead of the old boolean `outbound`/`inbound` + `allowHosts`/`allowPorts`.
- Updated SBPL and bwrap mapping tables to reference the new net fields.
- Updated `help()` text in the SandboxMaker entry point to match.
- Revised network filtering security considerations to explain per-rule
  enforcement strategies (SBPL ip-filter, nftables in namespace, Landlock
  network scoping, container/VM backends) and the initial fallback behavior.
- Updated `designs/README.md` summary table with new Updated date.
