# How-To: Managing Your Inventory

Your inventory is a collection of named references to
capabilities. There are two kinds of name:

- **Special names** (`@self`, `@host`, `@agent`, etc.) are
  read-only and indelible — always present, cannot be removed
  or overwritten.
- **Pet names** (`my-data`, `project-dir`, etc.) are
  user-chosen labels you can freely create, rename, copy, and
  remove. They are lowercase alphanumeric with hyphens.

## Browsing Your Inventory

List everything:
```
/ls
```

List a subdirectory:
```
/ls my-directory
```

View the contents of a blob, file, or JSON value inline:
```
/view my-config
```

Edit a value in place (Chat only):
```
/edit my-config
```

CLI equivalents: `endo ls`, `endo cat <name>`.

## Mounting a Filesystem Directory

Mount gives an agent (or yourself) read/write access to a
real directory on disk:

```
/mount /path/to/project -n project-dir
```

Now `project-dir` is a live capability. You can browse it:
```
/ls project-dir
/view project-dir/README.md
/edit project-dir/src/config.json
```

Or give it to an agent:
```
@lal Here is @project-dir — please review the code.
```

For a daemon-managed scratch directory:
```
/mktmp -n scratch
```

CLI equivalents: `endo mount /path -n name`,
`endo mktmp -n name`.

## Checking In and Out (Immutable Snapshots)

Check in a local directory as an immutable readable tree.
This is a CLI operation — there is no Chat equivalent for
check-in because it accesses the local filesystem:

```
endo checkin ./my-docs -n docs
```

Check it back out later:
```
endo checkout docs ./restored-docs
```

Chat equivalents for checkout only: `/co docs ./restored-docs`

## Renaming and Organizing

```
/mv old-name new-name
/cp original alias
/mkdir projects
```

Move into a subdirectory:
```
/mv my-tool projects/my-tool
```

## Removing Names

```
/rm my-name
```

This removes the name, not the underlying value. Other names
pointing to the same value are unaffected.

Warning: if the garbage collector is enabled and you remove
all names for a capability you've shared, the other party
loses access.

## Getting a Shareable Locator

```
/share my-value
```

Returns a locator URL that can be shared with peers on other
machines. The other party adopts it:
```
/adopt-locator <locator> -n their-name
```

CLI equivalent: `endo locate my-value`.
