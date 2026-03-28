/*
 * Minimal heap allocator for QuickJS on seL4.
 *
 * QuickJS needs malloc/free/realloc.  We implement a simple
 * first-fit free-list allocator over the 16 MB memory region
 * mapped by the Microkit system description.
 *
 * This is not a production allocator — it's sufficient to run
 * QuickJS for Phase 0b.  A real allocator (dlmalloc, etc.) can
 * replace it later.
 */

#include <stddef.h>
#include <stdint.h>

/* Set by the Microkit system description (setvar_vaddr). */
extern uintptr_t js_heap_vaddr;

/* Heap size: 32 MB (must match system.xml memory_region size). */
#define HEAP_SIZE (32 * 1024 * 1024)

/* Block header for the free-list allocator. */
typedef struct block_header {
    size_t size;                  /* Size of this block (excluding header) */
    struct block_header *next;    /* Next free block (or NULL) */
    int free;                     /* 1 if free, 0 if allocated */
} block_header_t;

#define HEADER_SIZE sizeof(block_header_t)
#define ALIGN(x) (((x) + 15) & ~(size_t)15)  /* 16-byte alignment */

static int heap_initialized = 0;
static block_header_t *free_list = NULL;

static void heap_init(void) {
    if (heap_initialized) return;
    if (js_heap_vaddr == 0) return;

    free_list = (block_header_t *)js_heap_vaddr;
    free_list->size = HEAP_SIZE - HEADER_SIZE;
    free_list->next = NULL;
    free_list->free = 1;
    heap_initialized = 1;
}

void *malloc(size_t size) {
    if (size == 0) return NULL;
    if (!heap_initialized) heap_init();
    if (!free_list) return NULL;

    size = ALIGN(size);

    block_header_t *curr = free_list;
    while (curr) {
        if (curr->free && curr->size >= size) {
            /* Split block if there's enough room for another block. */
            if (curr->size >= size + HEADER_SIZE + 16) {
                block_header_t *new_block =
                    (block_header_t *)((uint8_t *)curr + HEADER_SIZE + size);
                new_block->size = curr->size - size - HEADER_SIZE;
                new_block->next = curr->next;
                new_block->free = 1;
                curr->size = size;
                curr->next = new_block;
            }
            curr->free = 0;
            return (void *)((uint8_t *)curr + HEADER_SIZE);
        }
        curr = curr->next;
    }

    return NULL;  /* Out of memory */
}

void free(void *ptr) {
    if (!ptr) return;

    block_header_t *block =
        (block_header_t *)((uint8_t *)ptr - HEADER_SIZE);
    block->free = 1;

    /* Coalesce adjacent free blocks. */
    block_header_t *curr = free_list;
    while (curr && curr->next) {
        if (curr->free && curr->next->free) {
            curr->size += HEADER_SIZE + curr->next->size;
            curr->next = curr->next->next;
        } else {
            curr = curr->next;
        }
    }
}

void *realloc(void *ptr, size_t size) {
    if (!ptr) return malloc(size);
    if (size == 0) { free(ptr); return NULL; }

    block_header_t *block =
        (block_header_t *)((uint8_t *)ptr - HEADER_SIZE);
    size_t old_size = block->size;

    if (old_size >= size) return ptr;  /* Already big enough */

    void *new_ptr = malloc(size);
    if (!new_ptr) return NULL;

    /* Copy old data. */
    size_t copy_size = old_size < size ? old_size : size;
    uint8_t *src = (uint8_t *)ptr;
    uint8_t *dst = (uint8_t *)new_ptr;
    for (size_t i = 0; i < copy_size; i++) {
        dst[i] = src[i];
    }

    free(ptr);
    return new_ptr;
}

void *calloc(size_t nmemb, size_t size) {
    size_t total = nmemb * size;
    void *ptr = malloc(total);
    if (ptr) {
        uint8_t *p = (uint8_t *)ptr;
        for (size_t i = 0; i < total; i++) p[i] = 0;
    }
    return ptr;
}
