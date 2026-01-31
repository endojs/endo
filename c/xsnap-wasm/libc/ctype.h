/* Minimal ctype.h for wasm32 freestanding */
#ifndef _CTYPE_H
#define _CTYPE_H

int isalnum(int c);
int isalpha(int c);
int isblank(int c);
int iscntrl(int c);
int isdigit(int c);
int isgraph(int c);
int islower(int c);
int isprint(int c);
int ispunct(int c);
int isspace(int c);
int isupper(int c);
int isxdigit(int c);

int tolower(int c);
int toupper(int c);

/* Inline implementations for common cases */
static inline int __isdigit(int c) { return c >= '0' && c <= '9'; }
static inline int __isxdigit(int c) { return __isdigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
static inline int __isspace(int c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v'; }
static inline int __isupper(int c) { return c >= 'A' && c <= 'Z'; }
static inline int __islower(int c) { return c >= 'a' && c <= 'z'; }
static inline int __isalpha(int c) { return __isupper(c) || __islower(c); }
static inline int __isalnum(int c) { return __isalpha(c) || __isdigit(c); }
static inline int __tolower(int c) { return __isupper(c) ? c + 32 : c; }
static inline int __toupper(int c) { return __islower(c) ? c - 32 : c; }

#endif /* _CTYPE_H */



