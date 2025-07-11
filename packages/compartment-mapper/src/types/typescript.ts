/**
 * Helpers relevant to any TypeScript project.
 *
 * @module
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

/**
 * Generic type guard function that checks if a value of type `T` is also of type `U`.
 * @template T The type of the value to check.
 * @template U The type that the value should be checked against.
 */

export type TypeGuard<T, U extends T> = (value: T) => value is U;

/**
 * Helper type for a generic type guard used in an "extends" clause
 */
export type SomeTypeGuard = TypeGuard<any, any>;

/**
 * Infers the type that a type guard function checks for.
 *
 * @template T The type guard function type itself
 * @returns The type that the guard checks for
 */
export type GuardedType<T> = T extends (value: any) => value is infer U
  ? U
  : never;

/**
 * Converts a union type to an intersection type
 */
export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

// LiteralUnion is from https://www.npmjs.com/package/type-fest
