;;; Minimal Tor onion interop host for Endo OCapN.
;;;
;;; Mirrors `interop-client.scm` but hosts over Goblins' onion netlayer
;;; and waits for Endo's Tor-netlayer client to join via sturdyref.

(use-modules (goblins core)
             (goblins vat)
             (goblin-chat backend)
             (goblins actor-lib methods)
             (goblins utils crypto)
             (goblins ocapn captp)
             (goblins ocapn ids)
             (goblins ocapn netlayer onion)
             (fibers conditions))

;; One-shot completion signal for this script.
(define done? (make-condition))

;; Optional CLI args to override default message payloads.
(define args (cdr (command-line)))

(define (arg-or-default idx default)
  (if (> (length args) idx)
      (list-ref args idx)
      default))

(define local-message
  (arg-or-default 0 "hello from Guile CI"))
(define expected-remote-message
  (arg-or-default 1 "hello from Endo OCapN"))

;; Tor socket paths. Defaults match Goblins docs and module defaults, but
;; are overridable from env so CI can isolate paths.
(define tor-control-path
  (or (getenv "OCAPN_TOR_CONTROL_SOCKET")
      (string-append (getenv "HOME") "/.cache/goblins/tor/tor-control-sock")))
(define tor-socks-path
  (or (getenv "OCAPN_TOR_SOCKS_SOCKET")
      (string-append (getenv "HOME") "/.cache/goblins/tor/tor-socks-sock")))
(define tor-ocapn-socks-dir
  (or (getenv "OCAPN_TOR_OCAPN_SOCKETS_DIR")
      (string-append (getenv "HOME") "/.cache/goblins/tor/ocapn-sockets")))

;; Interop progress flags.
(define sent-local-message? #f)
(define sent-ack? #f)
(define saw-local-message? #f)
(define saw-remote-message? #f)
(define finished? #f)

(define (finish-if-ready!)
  (when (and (not finished?)
             sent-ack?
             saw-local-message?
             saw-remote-message?)
    (set! finished? #t)
    (display "interop-client-tor: observed local+remote messages and ack")
    (newline)
    (force-output)
    (signal-condition! done?)))

(define (fatal! label err)
  (display "interop-client-tor: ")
  (display label)
  (display ": ")
  (write err)
  (newline)
  (force-output)
  (signal-condition! done?)
  (primitive-exit 1))

(define (^interop-observer _bcom user channel)
  (methods
   ((new-message _context _from-user observed-message)
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
            (display "interop-client-tor: sent message, ack = ")
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

;; Keep transport and app actors isolated in separate vats.
(define machine-vat (spawn-vat))
(define user-vat (spawn-vat))
(define (machine-run thunk) (with-vat machine-vat (thunk)))
(define (user-run thunk) (with-vat user-vat (thunk)))

;; Boot onion netlayer and app objects.
(define netlayer
  (machine-run
   (lambda ()
     (spawn ^onion-netlayer
            #:tor-control-path tor-control-path
            #:tor-socks-path tor-socks-path
            #:tor-ocapn-socks-dir tor-ocapn-socks-dir))))
(define mycapn
  (machine-run (lambda () (spawn-mycapn netlayer))))
(define chatroom
  (user-run (lambda () (spawn ^chatroom "#interop-room"))))
(define-values (user user-controller)
  (user-run (lambda () (spawn-user-controller-pair "guile-interop-host"))))

(define (start-user-flow!)
  (user-run
   (lambda ()
     (on (<- user-controller 'join-room chatroom)
         (lambda (channel)
           (on (<- channel 'subscribe (spawn ^interop-observer user channel))
               (lambda (_subscription-result)
                 (display "interop-client-tor: subscription ready")
                 (newline)
                 (force-output))
               #:catch
               (lambda (err)
                 (fatal! "subscribe failed" err))
               #:promise? #t))
         #:catch
         (lambda (err)
           (fatal! "join-room failed" err))
         #:promise? #t))))

;; Publish sturdyref with onion transport and then run local user flow.
(machine-run
 (lambda ()
   (on (<- mycapn 'register chatroom 'onion)
       (lambda (chat-sref)
         (display "sturdyref: ")
         (display (ocapn-id->string chat-sref))
         (newline)
         (force-output)
         (start-user-flow!))
       #:catch
       (lambda (err)
         (fatal! "register failed" err))
       #:promise? #t)))

;; Block until success/failure.
(wait done?)
(primitive-exit 0)
