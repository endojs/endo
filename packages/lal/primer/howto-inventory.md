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

## Viewing and Editing Values

View the contents of a blob, file, or JSON value inline in
the chat window:
```
/view my-config
```

Open an inline editor to modify a value in place:
```
/edit my-config
```

These work for any text content — configuration files, JSON
blobs, source code, notes. `/view` is read-only; `/edit`
lets you change and save. Both are Chat-only features with
no direct CLI equivalent.

You can also browse mounted directories this way:
```
/view project-dir/README.md
/edit project-dir/src/config.json
```

## Mounting a Filesystem Directory

Mount gives an agent (or yourself) read/write access to a
real directory on disk:

```
/mount /path/to/project -n project-dir
```

Now `project-dir` is a live capability. Browse and edit its
contents with `/ls`, `/view`, and `/edit`:
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

## Checking In and Out (Immutable Snapshots)

Check in a local directory as an immutable readable tree.
This is a CLI-only operation — it accesses the local
filesystem directly:

```
endo checkin ./my-docs -n docs
```

Check it back out later:
```
endo checkout docs ./restored-docs
```

Once checked in, you can browse the snapshot in Chat:
```
/ls docs
/view docs/README.md
```

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
