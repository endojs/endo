/**
 * Fairly exhaustive, excruciatingly pedantic _type-level_ helpers for
 * representing and validating **Canonical Names** and npm package names.
 *
 * A {@link CanonicalName | Canonical Name} is a string containing one or more
 * npm package names (scoped or unscoped) delimited by a `>` character.
 *
 * The following rules about npm package names are enforced:
 *
 * - ✅ Length > 0
 * - ✅ Can contain hyphens
 * - ✅ No leading `.` or `_`
 * - ✅ No spaces
 * - ✅ No `~)('!*` characters
 *
 * The following rules are not enforced:
 *
 * - ❌ All lowercase - Not feasible due to recursion limits & legacy package
 *   names
 * - ❌ Not a reserved name - unmaintainable list of node builtin module names
 * - ❌ Length ≤ 214 - Not feasible due to recursion limits & legacy package
 *   names
 *
 * "Legacy" package names may contain uppercase letters and be longer than 214
 * characters.
 *
 * @module
 * @see {@link https://www.npmjs.com/package/validate-npm-package-name}
 */

/**
 * Characters that are explicitly forbidden in npm package names. These include:
 * ` `, `~`, `)`, `(`, `'`, `!`, `*`
 *
 * We check each one individually because TypeScript's template literal types
 * can detect if a string contains a specific substring.
 *
 * Returns `true` if the string contains a forbidden character, `false`
 * otherwise.
 */
type ContainsForbiddenChar<S extends string> = S extends
  | `${string} ${string}`
  | `${string}~${string}`
  | `${string})${string}`
  | `${string}(${string}`
  | `${string}'${string}`
  | `${string}!${string}`
  | `${string}*${string}`
  ? true
  : false;

/**
 * Validates that a string doesn't start with `.` or `_`.
 *
 * Returns `true` if the string doesn't start with `.` or `_`, `false`
 * otherwise.
 */
type HasValidStart<S extends string> = S extends `.${string}` | `_${string}`
  ? false
  : true;

/**
 * Validates that a string is non-empty.
 *
 * Returns `true` if the string is non-empty, `false` otherwise.
 */
type IsNonEmpty<S extends string> = S extends '' ? false : true;

/**
 * Combines all validation checks for a package name segment.
 *
 * Returns `true` if the string passes all checks, `false` otherwise.
 */
type IsValidPackageNameSegment<S extends string> =
  IsNonEmpty<S> extends false
    ? false
    : HasValidStart<S> extends false
      ? false
      : ContainsForbiddenChar<S> extends true
        ? false
        : true;

// ============================================================================
// Scoped and Unscoped Package Names
// ============================================================================

/** A scoped npm package name, like "@scope/pkg" */
export type ScopedPackageName<S extends string = string> =
  S extends `@${infer Scope}/${infer Name}`
    ? IsValidPackageNameSegment<Scope> extends true
      ? IsValidPackageNameSegment<Name> extends true
        ? S
        : never
      : never
    : never;

/**
 * An unscoped npm package name.
 *
 * Must pass all validation checks and must not contain a `/` (which would
 * indicate a scoped package or a subpath).
 *
 * Note: Package names containing uppercase letters are technically invalid per
 * npm rules, but they exist in the wild. TypeScript cannot reliably validate
 * case at the type level, so we don't enforce this.
 */
export type UnscopedPackageName<S extends string = string> =
  S extends `${string}/${string}`
    ? never
    : IsValidPackageNameSegment<S> extends true
      ? S
      : never;

/**
 * A scoped or unscoped npm package name.
 */
export type NpmPackageName<S extends string = string> =
  S extends `@${string}/${string}`
    ? ScopedPackageName<S>
    : UnscopedPackageName<S>;

/**
 * Split a string on `>`—the canonical name delimiter—into a tuple of segments.
 */
export type SplitOnDelimiter<S extends string> =
  S extends `${infer Head}>${infer Tail}`
    ? [Head, ...SplitOnDelimiter<Tail>]
    : [S];

/**
 * Validate that every element in a tuple of strings is a valid npm package
 * name.
 */
export type AllValidPackageNames<Parts extends readonly string[]> =
  Parts extends [
    infer Head extends string,
    ...infer Tail extends readonly string[],
  ]
    ? NpmPackageName<Head> extends never
      ? never
      : AllValidPackageNames<Tail>
    : Parts;

/**
 * A Canonical Name string comprised of one or more npm package names separated
 * by `>` (e.g., `foo`, `@scope/foo>bar`, `foo>@scope/bar>baz`).
 *
 * When given a string literal type, invalid shapes narrow to `never`.
 */
export type CanonicalName<S extends string = string> =
  AllValidPackageNames<SplitOnDelimiter<S>> extends never ? never : S;
