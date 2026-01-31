/* Minimal stddef.h for wasm32 freestanding */
#ifndef _STDDEF_H
#define _STDDEF_H

typedef unsigned int size_t;
typedef int ptrdiff_t;
typedef unsigned int wchar_t;

#define NULL ((void*)0)

#define offsetof(type, member) __builtin_offsetof(type, member)

#endif /* _STDDEF_H */



