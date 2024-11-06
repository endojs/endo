/**
 * @module Helpers relevant to any TypeScript project.
 */

/** Any object. All objects. Not `null`, though. */
export type SomeObject = Record<PropertyKey, any>;

/**
 * Matches any {@link
 * https://developer.mozilla.org/en-US/docs/Glossary/Primitive primitive
 * value}.
 */
export type Primitive =
  | null
  | undefined
  | string
  | number
  | boolean
  | symbol
  | bigint;

/**
 * Allows creating a union type by combining primitive types and literal types
 * without sacrificing auto-completion in IDEs for the literal type part of the
 * union.
 *
 * Currently, when a union type of a primitive type is combined with literal
 * types, TypeScript loses all information about the combined literals. Thus,
 * when such a type is used in an IDE with autocompletion, no suggestions are
 * made for the declared literals.
 *
 * This type is a workaround for {@link
 * https://github.com/Microsoft/TypeScript/issues/29729
 * Microsoft/TypeScript#29729}. It will be removed as soon as it's not needed
 * anymore.
 */
export type LiteralUnion<LiteralType, PrimitiveType extends Primitive> =
  | LiteralType
  | (PrimitiveType & Record<never, never>);

// LiteralUnion is from https://www.npmjs.com/package/type-fest
