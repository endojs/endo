/* Minimal sys/types.h for wasm32 freestanding */
#ifndef _SYS_TYPES_H
#define _SYS_TYPES_H

#include <stddef.h>
#include <stdint.h>

typedef int32_t ssize_t;
typedef uint32_t dev_t;
typedef uint32_t ino_t;
typedef uint32_t mode_t;
typedef uint32_t nlink_t;
typedef uint32_t uid_t;
typedef uint32_t gid_t;
typedef int32_t off_t;
typedef int32_t pid_t;
typedef int32_t id_t;

#endif /* _SYS_TYPES_H */



