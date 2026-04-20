;;; Compatibility shim for Guix guile-goblins package variants that
;;; do not ship (goblins ghash). This is enough for goblin-chat/backend.scm.

(define-module (goblins ghash)
  #:use-module (ice-9 hash-table)
  #:export (ghash-for-each))

(define (ghash-for-each proc table)
  (hash-for-each proc table))
