;;; Slim Guix manifest for the Endo↔Goblins chat interop client.
;;;
;;; Spritely's own goblin-chat/manifest.scm pulls GTK/G-Golf/mesa for the
;;; GUI; none of that is reachable from our headless interop client, so we
;;; stick to guile + guile-goblins + guile-fibers to keep `guix shell`
;;; resolution fast in CI.

(specifications->manifest
 '("guile"
   "guile-goblins"
   "guile-fibers"))
