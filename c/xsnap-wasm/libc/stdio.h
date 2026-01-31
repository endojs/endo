/* Minimal stdio.h for wasm32 freestanding */
#ifndef _STDIO_H
#define _STDIO_H

#include <stddef.h>
#include <stdarg.h>

#define EOF (-1)

typedef struct _FILE FILE;

extern FILE* stdin;
extern FILE* stdout;
extern FILE* stderr;

int printf(const char* format, ...);
int fprintf(FILE* stream, const char* format, ...);
int sprintf(char* str, const char* format, ...);
int snprintf(char* str, size_t size, const char* format, ...);

int vprintf(const char* format, va_list ap);
int vfprintf(FILE* stream, const char* format, va_list ap);
int vsprintf(char* str, const char* format, va_list ap);
int vsnprintf(char* str, size_t size, const char* format, va_list ap);

int putchar(int c);
int puts(const char* s);
int fputs(const char* s, FILE* stream);
int fputc(int c, FILE* stream);

/* These are stubs - we don't support file I/O in WASM */
FILE* fopen(const char* pathname, const char* mode);
int fclose(FILE* stream);
size_t fread(void* ptr, size_t size, size_t nmemb, FILE* stream);
size_t fwrite(const void* ptr, size_t size, size_t nmemb, FILE* stream);
int fflush(FILE* stream);
int feof(FILE* stream);
int ferror(FILE* stream);
int fseek(FILE* stream, long offset, int whence);
long ftell(FILE* stream);
void rewind(FILE* stream);
int fgetc(FILE* stream);
char* fgets(char* s, int size, FILE* stream);
int fscanf(FILE* stream, const char* format, ...);
int sscanf(const char* str, const char* format, ...);

#define SEEK_SET 0
#define SEEK_CUR 1
#define SEEK_END 2

#endif /* _STDIO_H */



