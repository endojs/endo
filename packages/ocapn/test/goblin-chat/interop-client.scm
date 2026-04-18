;;; Minimal tcp-testing-only interop client for the Endo goblin-chat host.
;;;
;;; Intended to run inside `guix shell --manifest=manifest.scm` against
;;; spritely/goblin-chat checked out at $GOBLIN_CHAT_SRC, so it can reuse
;;; that repository's (goblin-chat backend) for the user-controller side.
;;;
;;; Expected env/args:
;;;   $1  sturdyref URI printed by `test/goblin-chat/index.js`
;;;   $2  message to send
;;;
;;; Exit 0 on a successful `send-message` ack, non-zero otherwise.
;;;
;;; Module paths for the tcp-testing-only netlayer in guile-goblins are
;;; unverified — adjust to match whichever form the installed Goblins
;;; exposes. The OCapN Python test suite targets guile-goblins over this
;;; same transport, so the netlayer exists; only the public binding name
;;; needs to line up.

(use-modules (goblins)
             (goblins actor-lib common)
             (goblins ocapn captp)
             (goblins ocapn ids)
             ;; TODO: confirm module path on current guile-goblins.
             (goblins ocapn netlayers tcp-testing)
             (goblin-chat backend)
             (ice-9 match))

(define args (cdr (command-line)))
(define uri (list-ref args 0))
(define message (list-ref args 1))

(define machine-vat (spawn-vat))
(define user-vat (spawn-vat))

(define (machine-run thunk) (with-vat machine-vat (thunk)))
(define (user-run thunk) (with-vat user-vat (thunk)))

(define netlayer
  (machine-run (lambda () (spawn ^tcp-testing-netlayer))))

(define mycapn
  (machine-run (lambda () (spawn-mycapn netlayer))))

(define chat-sref (string->ocapn-id uri))

(define-values (user user-controller)
  (user-run (lambda () (spawn-user-controller-pair "endo-interop-ci"))))

(define chatroom-vow
  (user-run (lambda () (<- mycapn 'enliven chat-sref))))

(on chatroom-vow
    (lambda (chatroom)
      (define channel-vow
        (user-run (lambda () (<- user-controller 'join-room chatroom))))
      (on channel-vow
          (lambda (channel)
            (define ack-vow
              (user-run (lambda () (<- channel 'send-message message))))
            (on ack-vow
                (lambda (ack)
                  (display "interop-client: sent message, ack = ")
                  (write ack)
                  (newline)
                  (exit 0))
                #:catch
                (lambda (err)
                  (display "interop-client: send failed: ")
                  (write err)
                  (newline)
                  (exit 2))
                #:promise? #t))
          #:catch
          (lambda (err)
            (display "interop-client: join-room failed: ")
            (write err)
            (newline)
            (exit 3))
          #:promise? #t))
    #:catch
    (lambda (err)
      (display "interop-client: enliven failed: ")
      (write err)
      (newline)
      (exit 4))
    #:promise? #t)

(wait forever)
