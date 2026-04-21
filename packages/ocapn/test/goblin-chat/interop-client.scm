;;; Minimal websocket interop host for Endo OCapN.
;;;
;;; This intentionally keeps Guile-side logic small and uses Spritely's
;;; existing `(goblin-chat backend)` to host the chatroom.

(use-modules (goblins core)
             (goblins vat)
             (goblin-chat backend)
             (goblins actor-lib methods)
             (goblins ocapn captp)
             (goblins ocapn ids)
             (goblins ocapn netlayer websocket)
             (fibers conditions))

;; Global condition used as a one-shot "done" signal for this script.
;; We wait on it at the end and exit as soon as either success or fatal
;; failure has been observed.
(define done? (make-condition))

;; Command-line handling: we optionally accept two messages so CI/local runs
;; can override defaults without editing the file.
(define args (cdr (command-line)))

(define (arg-or-default idx default)
  (if (> (length args) idx)
      (list-ref args idx)
      default))

;; Message values used by both sides of the interop check:
;; - `local-message` is what Guile sends once Endo joins.
;; - `expected-remote-message` is what Guile expects Endo to send back.
(define local-message
  (arg-or-default 0 "hello from Guile CI"))
(define expected-remote-message
  (arg-or-default 1 "hello from Endo OCapN"))

;; Websocket bind port is controllable via env for CI orchestration, with a
;; deterministic fallback for ad-hoc local runs.
(define websocket-port
  (let ((env-port (getenv "OCAPN_TEST_PORT")))
    (if env-port
        (string->number env-port)
        22047)))

;; Interop progress flags. We only declare success once all required events
;; have happened: Guile sent, send ack arrived, and both messages were seen.
(define sent-local-message? #f)
(define sent-ack? #f)
(define saw-local-message? #f)
(define saw-remote-message? #f)
(define finished? #f)

;; Success gate for the script. When both sides' messages and Guile's send
;; acknowledgement are observed, emit a stable log marker and unblock `(wait done?)`.
(define (finish-if-ready!)
  (when (and (not finished?)
             sent-ack?
             saw-local-message?
             saw-remote-message?)
    (set! finished? #t)
    (display "interop-client: observed local+remote messages and ack")
    (newline)
    (force-output)
    (signal-condition! done?)))

;; Fatal helper used by all async error paths so failures are consistently
;; logged and cause an immediate non-zero exit.
(define (fatal! label err)
  (display "interop-client: ")
  (display label)
  (display ": ")
  (write err)
  (newline)
  (force-output)
  (signal-condition! done?)
  (primitive-exit 1))

;; Observer actor subscribed to the chat channel.
;; - `new-message`: records message observations for the bilateral assertion.
;; - `user-joined`: sends Guile's local message exactly once when a remote
;;   participant joins.
;; - `user-left`: currently ignored for test success criteria.
(define (^interop-observer _bcom user channel)
  (methods
   ((new-message _context _from-user observed-message)
    ;; Normalize to string so logs/assertions remain robust if a backend
    ;; sends a non-string payload in the future.
    (define message-string
      (if (string? observed-message)
          observed-message
          (format #f "~a" observed-message)))
    (when (string=? message-string local-message)
      (set! saw-local-message? #t))
    (when (string=? message-string expected-remote-message)
      (set! saw-remote-message? #t))
    (finish-if-ready!)
    #t)
   ((user-joined joining-user)
    (when (and (not sent-local-message?)
               (not (eq? joining-user user)))
      (set! sent-local-message? #t)
      (on (<- channel 'send-message local-message)
          (lambda (ack)
            (display "interop-client: sent message, ack = ")
            (write ack)
            (newline)
            (force-output)
            (set! sent-ack? #t)
            (finish-if-ready!))
          #:catch
          (lambda (err)
            (fatal! "send-message failed" err))
          #:promise? #t))
    #t)
   ((user-left _user) #t)))

;; Two vats:
;; - machine-vat hosts transport/captp machinery.
;; - user-vat hosts chatroom/user actors.
;; Keeping these separated mirrors Goblins examples and avoids mixing
;; transport lifecycle with app actor lifecycle.
(define machine-vat (spawn-vat))
(define user-vat (spawn-vat))
(define (machine-run thunk) (with-vat machine-vat (thunk)))
(define (user-run thunk) (with-vat user-vat (thunk)))

;; Boot transport and app objects:
;; - websocket netlayer bound to `websocket-port`
;; - mycapn node on that netlayer
;; - chatroom actor plus a local user/controller pair
(define netlayer
  (machine-run
   (lambda ()
     (spawn ^websocket-netlayer
            #:encrypted? #f
            #:port websocket-port))))
(define mycapn
  (machine-run (lambda () (spawn-mycapn netlayer))))
(define chatroom
  (user-run (lambda () (spawn ^chatroom "#interop-room"))))
(define-values (user user-controller)
  (user-run (lambda () (spawn-user-controller-pair "guile-interop-host"))))

;; Register the chatroom on the websocket transport and print the sturdyref.
;; CI extracts this `sturdyref:` line and passes it to the Endo client.
(machine-run
 (lambda ()
   (on (<- mycapn 'register chatroom 'websocket)
       (lambda (chat-sref)
         (display "sturdyref: ")
         (display (ocapn-id->string chat-sref))
         (newline)
         (force-output))
       #:catch
       (lambda (err)
         (fatal! "register failed" err))
       #:promise? #t)))

;; Join the room as the local Guile participant and subscribe our observer.
;; After Endo joins, observer `user-joined` triggers the Guile send; success
;; is declared only after both messages are seen and send ack is received.
(user-run
 (lambda ()
   (on (<- user-controller 'join-room chatroom)
       (lambda (channel)
         (on (<- channel 'subscribe (spawn ^interop-observer user channel))
             (lambda (_subscription-result)
               (display "interop-client: subscription ready")
               (newline)
               (force-output))
             #:catch
             (lambda (err)
               (fatal! "subscribe failed" err))
             #:promise? #t))
       #:catch
       (lambda (err)
         (fatal! "join-room failed" err))
       #:promise? #t)))

;; Block the process until success/failure path signals `done?`.
;; Success exits 0; fatal paths exit non-zero from `fatal!`.
(wait done?)
(primitive-exit 0)
