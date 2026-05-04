# Genie: document the `rootfs` form field and `GENIE_ROOTFS` opt-in

Sub-task carved out of [`50_genie_rootfs_config.md`](./50_genie_rootfs_config.md)
§ "Plan / Seam 3".

## Context

Once Seam 1 ([`51_genie_rootfs_form_field.md`](./51_genie_rootfs_form_field.md))
and Seam 2 ([`52_genie_rootfs_mount_cap.md`](./52_genie_rootfs_mount_cap.md))
land, the configuration form will accept a `rootfs` value with four
distinct shapes (`host-bind`, `minimal`, `oci:<ref>`, pet name).
The operator-facing surface in `packages/genie/README.md` and the
implementer's lens in `packages/genie/CLAUDE.md` need to catch up so
the new form field is not invisible — and so the bwrap/oci asymmetry
is documented at the user-facing boundary instead of bubbling up as
a slice-mint error.

## Deliverables

- [x] **`packages/genie/README.md`** — § "Sandboxed workspace" /
  "Workspace form-field shapes" already has a table of form fields
  for `backend` and `network`.
  Add a `rootfs` row covering all four shapes:
  - `host-bind` (default) — bind-mounts the host's
    `/usr` / `/etc` / etc. read-only; bwrap and podman.
  - `minimal` — backend-supplied empty / busybox rootfs; caller
    must supply their own bin dirs via `mounts`.
  - `oci:<ref>` — materialised from an OCI image reference; podman
    only (bwrap rejects with a structured error).
  - pet name — a Mount cap already introduced into the agent
    guest's namespace, validated against `MountInterface`.

  **Done.** The form-field table at the top of "Daemon bootstrap
  (`setup.js`)" carries a `rootfs` row pointing into a full
  § "Rootfs form-field shapes" subsection that documents all four
  shapes and the `oci:<ref>` ⇒ podman-only constraint.
- [x] **`packages/genie/README.md`** — § "Failure-mode cookbook"
  (same file): add a row for the bwrap-rejects-oci case mapping
  the literal error string to the operator-side fix
  ("set `backend: 'podman'` in the form, or pick a non-oci
  rootfs").
  Cross-link to
  [`packages/sandbox/README.md`](../packages/sandbox/README.md)
  § "Capability surface" / "Driver auto-registration" for the
  upstream rule.

  **Done.** The cookbook table now has a row keyed on
  `rootfs "oci:<ref>" is incompatible with "backend: bwrap"; …`,
  reproducing the structured error verbatim and cross-linking to
  the sandbox README's "Driver auto-registration" anchor.
- [x] **`packages/genie/CLAUDE.md`** — extend § "Capabilities the
  genie guest receives" (or sibling section) so the implementer's
  lens reflects the new form field.
  Specifically, the table row for `workspace` already mentions the
  pet-name path; add a paragraph (or new row) covering the
  `rootfs` field's four shapes and the bwrap-rejects-oci
  cross-check.

  **Done.** The "Capabilities the genie guest receives" section
  now has a sibling subsection
  "`rootfs` form field — four shapes plus a backend cross-check"
  with a four-row mapping table from form value to
  `ParsedRootfsValue` to `RootfsSpec` arm, plus a paragraph on
  the dual-check (`assertRootfsBackendCompatible` in `main.js`
  and the bwrap driver's symmetric reject).
- [x] **`packages/genie/CLAUDE.md`** § "When you add a new sandbox
  backend": add a step requiring the new driver to declare which
  `RootfsSpec` shapes it supports, and to mirror that declaration
  into the genie's form-side cross-validation if it diverges from
  the bwrap/podman pair.

  **Done.** Step 4 of that section now requires the new driver
  to declare its supported `RootfsSpec` shapes and, when those
  diverge from the bwrap/podman pair, to extend
  `assertRootfsBackendCompatible` (and reconsider
  `ALLOWED_ROOTFS_KINDS` plus the form-field label) so the
  asymmetry surfaces at the form boundary.
- [ ] **Optional — `GENIE_ROOTFS` env var.**
  Introduce a `GENIE_ROOTFS` env var in
  `packages/genie/setup.js` that auto-submits the form's `rootfs`
  field, paralleling `GENIE_MODEL` / `GENIE_WORKSPACE`.
  Defer the decision until Seams 1+2 land — the form is already
  human-submittable, and env-var sugar is purely operator
  ergonomics.
  When this lands, document it under § "Operator quickstart" in
  the README alongside the existing env-var examples, and add a
  default-resolution note to the `setup.js` source comments.

  **Deferred (as the deliverable itself flags).** Seams 1+2 have
  landed and the form is human-submittable; no `GENIE_ROOTFS`
  reference exists in `packages/genie/setup.js` yet, and adding
  one is purely operator ergonomics.  Leaving the box unchecked
  so a future operator-experience pass can pick it up cleanly.

## Blocked by / blocks

- Blocked by [`51_genie_rootfs_form_field.md`](./51_genie_rootfs_form_field.md)
  and [`52_genie_rootfs_mount_cap.md`](./52_genie_rootfs_mount_cap.md)
  — the docs describe the form field those seams land.
- Does not block any other task; this is the trailing-edge cleanup
  for the `rootfs` chain.

## Cross-references

- [`packages/genie/README.md`](../packages/genie/README.md) §
  "Sandboxed workspace" / "Failure-mode cookbook".
- [`packages/genie/CLAUDE.md`](../packages/genie/CLAUDE.md) §
  "Capabilities the genie guest receives" / "When you add a new
  sandbox backend".
- [`packages/sandbox/README.md`](../packages/sandbox/README.md) §
  "Capability surface" / "Driver auto-registration" — upstream
  documentation of the bwrap-rejects-oci rule the genie now
  surfaces at the form boundary.
- [`packages/genie/setup.js`](../packages/genie/setup.js) — env
  var defaulting site for the optional `GENIE_ROOTFS` deliverable.
