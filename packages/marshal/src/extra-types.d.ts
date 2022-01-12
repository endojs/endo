// This type cannot be declared in pure JSDoc.
// It's a recursive array type.
declare type NestedArray<T> = Array<T | NestedArray<T>>;
