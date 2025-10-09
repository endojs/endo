/**
 * Type-level helpers for representing and validating Canonical Names.
 *
 * A Canonical Name is a string containing one or more npm package names
 * (scoped or unscoped) delimited by a '>' character.
 *
 * These utilities are purely type-level; at runtime they are just strings.
 * When used with string literals, TypeScript can evaluate them and narrow or
 * reject invalid shapes (yielding `never`).
 *
 * @module
 */

/** A scoped npm package name, like "@scope/pkg" */
export type ScopedPackageName = `@${string}/${string}`;

/**
 * An unscoped npm package name. We approximate this as any string that does
 * not contain a '/'.
 */
export type UnscopedPackageName<S extends string = string> =
  S extends `${string}/${string}` ? never : S;

/** A scoped or unscoped npm package name. */
export type NpmPackageName<S extends string = string> =
  | ScopedPackageName
  | UnscopedPackageName<S>;

/** Split a string on '>' into a tuple of segments. */
export type SplitOnGt<S extends string> =
  S extends `${infer Head}>${infer Tail}` ? [Head, ...SplitOnGt<Tail>] : [S];

/**
 * Validate that every element in a tuple of strings is a valid npm package name.
 * Returns `never` if any element looks like a subpath (contains '/') but is not scoped.
 */
export type AllValidPackageNames<Parts extends string[]> = Parts extends [
  infer H extends string,
  ...infer T extends string[],
]
  ? H extends ScopedPackageName
    ? AllValidPackageNames<T>
    : H extends `${string}/${string}`
      ? never
      : AllValidPackageNames<T>
  : Parts;

/**
 * A Canonical Name string comprised of one or more npm package names separated
 * by '>' (e.g., "foo", "@scope/foo>bar", "foo>@scope/bar>baz").
 *
 * When given a string literal type, invalid shapes narrow to `never`.
 */
export type CanonicalName<S extends string = string> =
  AllValidPackageNames<SplitOnGt<S>> extends never ? never : S;

/** Convenience predicate-style helper: resolves to `true`/`false` for literals. */
export type IsCanonicalName<S extends string> =
  CanonicalName<S> extends never ? false : true;
